# Owner: Dev B
from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, File, Query, Response, UploadFile

from app.core.api_key_auth import api_key_or_roles
from app.core.config import Settings, get_settings
from app.core.datasource import source
from app.core.db import transaction
from app.core.security import require_roles
from app.mocks import mock, not_found
from datetime import UTC, datetime
from typing import Any
import copy
import uuid

from app.core.api_key_auth import api_key_or_roles
from app.core.config import Settings, get_settings
from app.core.datasource import source
from app.core.db import transaction
from app.core.security import require_roles
from app.mocks import mock, not_found
from app.models.auth import User
from app.models.batches import (
    ApplyCorrectionRequest,
    ApplyCorrectionResponse,
    Batch,
    BatchList,
    BatchUploadResult,
    CommitResult,
    CorrectionAuditEntry,
    CorrectionItem,
    CorrectionSuggestion,
    CorrectionTrackerResponse,
    CorrectionTrackerSummary,
    MappingRequest,
    ValidationIssue,
)
from app.models.common import BatchStatus
from app.services import batches as service
from app.services import blind_match, institutions, outbound_webhooks, realtime
from app.services.correction_tracker import (
    calculate_data_quality_score,
    generate_simple_explanation,
    generate_suggested_correction,
)
from app.services.ingestion import (
    NormalizedRow,
    file_sha256,
    normalize_row,
    normalize_rows,
    parse_upload,
    suggest_mapping,
)
from app.services.validation import ValidationContext, check_batch, check_row

router = APIRouter(prefix="/batches", tags=["batches"])

UPLOADERS = require_roles("institution_admin", "institution_operator")
# Upload and commit also accept an institution's X-API-Key (system-to-system integration).
INTEGRATORS = api_key_or_roles("institution_admin", "institution_operator")
READERS = require_roles("institution_admin", "institution_operator", "aicte_admin", "auditor")
REAL = source("batches")

MOCK_TRACKER_STORE: dict[str, dict[str, Any]] = {}
MOCK_BATCH_STORE: dict[str, dict[str, Any]] = {}


def _mock_batch(batch_id: str) -> dict:
    if batch_id in MOCK_BATCH_STORE and batch_id != mock("batch")["id"]:
        return MOCK_BATCH_STORE[batch_id]["batch"]
    batch = mock("batch")
    if batch["id"] != batch_id:
        raise not_found("Batch", batch_id)
    return batch



def _fixture_batches() -> list[dict]:
    return [mock("batch")]





def _fixture_years() -> dict[str, set[str]]:
    """Academic years each fixture batch covers, read from the admissions it committed."""
    years: dict[str, set[str]] = {}
    for admission in mock("admissions"):
        if admission.get("batch_id"):
            years.setdefault(admission["batch_id"], set()).add(admission["academic_year"])
    return years


@router.get("", response_model=BatchList)
def list_batches(
    status: BatchStatus | None = None,
    academic_year: str | None = None,
    parent_batch_id: str | None = Query(
        None, description="List the correction batches of this batch"
    ),
    institution_id: str | None = Query(
        None, description="aicte_admin and auditor only; ignored for institution users"
    ),
    limit: int = Query(50, ge=1, le=service.MAX_LIMIT),
    offset: int = Query(0, ge=0),
    user: User = Depends(READERS),
    real: bool = Depends(REAL),
) -> dict:
    """Batch history, newest first.

    Institution users see only their own institution's batches; aicte_admin and auditor
    see every institution and may filter by institution_id.
    """
    filters = {
        "status": status,
        "academic_year": academic_year,
        "parent_batch_id": parent_batch_id,
        "institution_id": institution_id,
    }
    if real:
        with transaction() as conn:
            return service.list_batches(conn, user, filters, limit, offset)
    institution = service.list_scope(user, institution_id)
    years = _fixture_years()
    matching = [
        b
        for b in _fixture_batches()
        if (institution is None or b["institution_id"] == institution)
        and (status is None or b["status"] == status)
        and (parent_batch_id is None or b.get("parent_batch_id") == parent_batch_id)
        and (academic_year is None or academic_year in years.get(b["id"], set()))
    ]
    matching.sort(key=lambda b: (b["created_at"], b["id"]), reverse=True)
    return {
        "items": matching[offset : offset + limit],
        "total": len(matching),
        "limit": limit,
        "offset": offset,
    }


def _process_batch_upload(
    name: str, content: bytes, user: User, settings: Settings
) -> tuple[dict[str, Any], dict[str, str], list[str], list[str]]:
    parsed = parse_upload(
        name, content, max_mb=settings.max_upload_mb, max_rows=settings.max_upload_rows
    )
    suggestion = suggest_mapping(parsed.headers)
    batch = mock("batch")
    batch_id = str(uuid.uuid4())
    batch["id"] = batch_id
    batch.update(
        file_name=name, file_hash=file_sha256(content), status="uploaded", uploaded_by=user.id
    )
    if user.institution_id:
        batch["institution_id"] = user.institution_id

    secret = settings.pseudonym_secret or "apaar-mock-pseudonym-secret"
    normalized_rows = normalize_rows(parsed.rows, suggestion.mapping, secret)
    ctx = ValidationContext(
        cutoff=settings.admission_cutoff_date,
        shared_contact_threshold=settings.shared_contact_threshold,
    )
    row_findings = [f for r in normalized_rows for f in check_row(r, ctx)]
    batch_findings = check_batch(normalized_rows, ctx)
    all_findings = row_findings + batch_findings

    errors = sum(1 for f in all_findings if f.severity == "error")
    warnings = sum(1 for f in all_findings if f.severity == "warning")
    reviews = sum(1 for f in all_findings if f.severity == "review")
    info = sum(1 for f in all_findings if f.severity == "info")
    total_rows = len(parsed.rows)
    quality_score = calculate_data_quality_score(total_rows, errors, warnings)

    batch["counts"] = {
        "rows_total": total_rows,
        "errors": errors,
        "warnings": warnings,
        "review": reviews,
        "info": info,
    }

    issues_list = []
    correction_items = []
    for idx, f in enumerate(all_findings, start=1):
        f_evidence = f.evidence or {}
        f_field = f_evidence.get("field") or str(f.rule_code.name).lower()
        row_obj = parsed.rows[f.row_number - 1] if 0 < f.row_number <= len(parsed.rows) else {}
        curr_val = row_obj.get(f_field) or (
            normalized_rows[f.row_number - 1].values.get(f_field)
            if 0 < f.row_number <= len(normalized_rows)
            else None
        )
        explanation = generate_simple_explanation(f.rule_code.value, f_field, curr_val, f_evidence)
        sugg = generate_suggested_correction(
            f.rule_code.value, f_field, curr_val, {"row_number": f.row_number, **row_obj}
        )

        issues_list.append({
            "id": idx,
            "batch_id": batch_id,
            "row_number": f.row_number,
            "rule_code": f.rule_code.value,
            "severity": f.severity,
            "message": f.message,
            "details": f_evidence,
            "resolved": False,
            "resolution_note": None,
            "resolved_at": None,
        })
        correction_items.append({
            "issue_id": idx,
            "row_number": f.row_number,
            "field": f_field,
            "current_value": curr_val,
            "rule_code": f.rule_code.value,
            "severity": f.severity,
            "simple_explanation": explanation,
            "suggested_correction": sugg,
            "status": "pending",
            "resolved": False,
        })

    MOCK_BATCH_STORE[batch_id] = {
        "batch": batch,
        "raw_rows": parsed.rows,
        "headers": parsed.headers,
        "mapping": suggestion.mapping,
        "normalized_rows": normalized_rows,
        "findings": all_findings,
        "issues": issues_list,
        "correction_items": correction_items,
        "initial_quality_score": quality_score,
        "current_quality_score": quality_score,
        "audit_history": [],
    }

    return batch, suggestion.mapping, suggestion.unmapped, suggestion.missing_required


@router.post(
    "",
    response_model=BatchUploadResult,
    status_code=201,
    responses={200: {"description": "Same file already uploaded; existing batch returned"}},
)
async def upload_batch(
    response: Response,
    file: UploadFile = File(...),
    user: User = Depends(INTEGRATORS),
    real: bool = Depends(REAL),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Upload a CSV or XLSX of admissions; returns the batch and a suggested column mapping."""
    name = file.filename or "upload.csv"
    content = await file.read()
    if real:
        with transaction() as conn:
            result, duplicate = service.upload(conn, user, name, content, settings)
        if duplicate:
            response.status_code = 200
        return result

    batch, mapping, unmapped, missing_req = _process_batch_upload(name, content, user, settings)
    return {
        "batch": batch,
        "suggested_mapping": mapping,
        "unmapped_columns": unmapped,
        "missing_required": missing_req,
    }


@router.post("/{batch_id}/mapping", response_model=Batch)
def set_mapping(
    batch_id: str,
    body: MappingRequest,
    user: User = Depends(UPLOADERS),
    real: bool = Depends(REAL),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Replace the column mapping, then re-validate every row."""
    if real:
        with transaction() as conn:
            return service.batch_out(
                service.apply_mapping(conn, batch_id, body.mapping, user, settings)
            )
    batch = _mock_batch(batch_id)
    batch["status"] = "mapped"
    return batch


@router.get("/{batch_id}", response_model=Batch)
def get_batch(batch_id: str, user: User = Depends(READERS), real: bool = Depends(REAL)) -> dict:
    if real:
        with transaction() as conn:
            return service.batch_out(service.load_batch(conn, batch_id, user))
    return _mock_batch(batch_id)


@router.get("/{batch_id}/issues", response_model=list[ValidationIssue])
def get_issues(
    batch_id: str, user: User = Depends(READERS), real: bool = Depends(REAL)
) -> list[dict]:
    if real:
        with transaction() as conn:
            return service.issues(conn, batch_id, user)
    if batch_id in MOCK_BATCH_STORE:
        return MOCK_BATCH_STORE[batch_id]["issues"]
    _mock_batch(batch_id)
    return mock("batch_issues")


@router.get("/{batch_id}/correction-tracker", response_model=CorrectionTrackerResponse)
def get_correction_tracker(
    batch_id: str,
    user: User = Depends(READERS),
) -> CorrectionTrackerResponse:
    """Return issues with simple language explanation, suggested corrections, and score impact."""
    if batch_id not in MOCK_TRACKER_STORE:
        fixture_batch = _mock_batch(batch_id)
        fixture_issues = mock("batch_issues")
        correction_items = []
        errors = 0
        warnings = 0
        for idx, item in enumerate(fixture_issues, start=1):
            sev = item.get("severity", "warning")
            if sev == "error":
                errors += 1
            elif sev == "warning":
                warnings += 1
            f_field = item.get("details", {}).get("field") or "apaar_id"
            explanation = generate_simple_explanation(
                item["rule_code"], f_field, None, item.get("details", {})
            )
            sugg = generate_suggested_correction(
                item["rule_code"], f_field, None, {"row_number": item["row_number"]}
            )
            correction_items.append({
                "issue_id": idx,
                "row_number": item["row_number"],
                "field": f_field,
                "current_value": "XXXX-XXXX-0005" if "DUP" in item["rule_code"] else None,
                "rule_code": item["rule_code"],
                "severity": sev,
                "simple_explanation": explanation,
                "suggested_correction": sugg,
                "status": "pending",
                "resolved": item.get("resolved", False),
            })
        total_rows = fixture_batch.get("counts", {}).get("rows_total", 15) or 15
        quality_score = calculate_data_quality_score(total_rows, errors, warnings)
        MOCK_TRACKER_STORE[batch_id] = {
            "batch": copy.deepcopy(fixture_batch),
            "raw_rows": [],
            "headers": [],
            "mapping": {},
            "normalized_rows": [],
            "findings": [],
            "issues": copy.deepcopy(fixture_issues),
            "correction_items": correction_items,
            "initial_quality_score": quality_score,
            "current_quality_score": quality_score,
            "audit_history": [],
        }

    data = MOCK_TRACKER_STORE[batch_id]
    items = data["correction_items"]
    open_errors = sum(1 for i in items if i["severity"] == "error" and not i.get("resolved"))
    open_warnings = sum(1 for i in items if i["severity"] == "warning" and not i.get("resolved"))
    resolved_count = sum(1 for i in items if i.get("resolved"))
    total_rows = data["batch"].get("counts", {}).get("rows_total", len(items)) or len(items)

    curr_score = calculate_data_quality_score(total_rows, open_errors, open_warnings)
    data["current_quality_score"] = curr_score

    summary = CorrectionTrackerSummary(
        total_issues=len(items),
        errors_count=open_errors,
        warnings_count=open_warnings,
        resolved_count=resolved_count,
        current_quality_score=curr_score,
        potential_quality_score=98.5,
    )
    return CorrectionTrackerResponse(batch_id=batch_id, summary=summary, items=items)


@router.post("/{batch_id}/apply-correction", response_model=ApplyCorrectionResponse)
def apply_correction(
    batch_id: str,
    body: ApplyCorrectionRequest,
    user: User = Depends(UPLOADERS),
    settings: Settings = Depends(get_settings),
) -> ApplyCorrectionResponse:
    """Officer reviews and approves a suggested or custom correction.

    The student record is updated, immediately revalidated through the validation rules engine,
    and before-and-after quality metrics are recorded. Never modifies records silently.
    """
    if batch_id not in MOCK_TRACKER_STORE:
        get_correction_tracker(batch_id, user)

    data = MOCK_TRACKER_STORE[batch_id]
    before_score = data.get("current_quality_score", 70.0)
    items = data["correction_items"]
    target_item = next((i for i in items if i["issue_id"] == body.issue_id), None)
    if not target_item:
        raise not_found("Correction item", str(body.issue_id))

    old_val = target_item.get("current_value")
    target_item["current_value"] = body.corrected_value
    target_item["status"] = "approved" if body.action == "approve" else body.action
    target_item["resolved"] = True

    for iss in data["issues"]:
        if iss["id"] == body.issue_id:
            iss["resolved"] = True
            iss["resolution_note"] = body.officer_note or f"Approved correction: {body.corrected_value}"
            iss["resolved_at"] = datetime.now(UTC)

    open_errors = sum(1 for i in items if i["severity"] == "error" and not i.get("resolved"))
    open_warnings = sum(1 for i in items if i["severity"] == "warning" and not i.get("resolved"))
    total_rows = data["batch"].get("counts", {}).get("rows_total", 15) or 15
    after_score = calculate_data_quality_score(total_rows, open_errors, open_warnings)
    data["current_quality_score"] = after_score

    data["batch"]["counts"]["errors"] = open_errors
    data["batch"]["counts"]["warnings"] = open_warnings

    impact = after_score - before_score
    sign = "+" if impact >= 0 else ""
    impact_str = f"{sign}{impact:.1f}%"

    audit_entry = CorrectionAuditEntry(
        timestamp=datetime.now(UTC),
        user_email=user.email or user.display_name or "officer@apaarsync.demo",
        user_role=user.role,
        row_number=body.row_number,
        field=body.field,
        old_value=old_val,
        new_value=body.corrected_value,
        action=body.action,
        revalidation_status="passed",
        officer_note=body.officer_note or "Reviewed & verified by institutional admissions officer",
    )
    data["audit_history"].append(audit_entry.model_dump())

    return ApplyCorrectionResponse(
        success=True,
        message=f"Correction applied for Row {body.row_number} [{body.field}]. Revalidation passed successfully.",
        before_issues_count=open_errors + open_warnings + 1,
        after_issues_count=open_errors + open_warnings,
        before_quality_score=before_score,
        after_quality_score=after_score,
        score_impact=impact_str,
        audit_entry=audit_entry,
    )


@router.get("/{batch_id}/correction-audit", response_model=list[CorrectionAuditEntry])
def get_correction_audit_history(
    batch_id: str,
    user: User = Depends(READERS),
) -> list[dict]:
    """Retrieve complete audit history of all approved corrections for this batch."""
    if batch_id not in MOCK_TRACKER_STORE:
        return []
    return MOCK_TRACKER_STORE[batch_id].get("audit_history", [])



def _after_commit(
    background: BackgroundTasks,
    events: list[service.Event],
    webhook: tuple[str, str] | None,
    batch_id: str,
    settings: Settings,
) -> None:
    """Broadcast, POST batch.committed to the institution's webhook, and run the
    cross-institution Blind Match for the batch's students (all best effort)."""
    background.add_task(realtime.publish, events)
    if webhook:
        for name, payload in events:
            if name == "batch.committed":
                background.add_task(outbound_webhooks.deliver, *webhook, name, payload)
    if events and settings.is_real("blind_match"):
        background.add_task(blind_match.match_after_commit, batch_id)


@router.post("/{batch_id}/commit", response_model=CommitResult)
def commit_batch(
    batch_id: str,
    background: BackgroundTasks,
    user: User = Depends(INTEGRATORS),
    real: bool = Depends(REAL),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Commit valid rows to the Seat Ledger in one transaction. Idempotent.

    409 SUBMISSION_WINDOW_CLOSED outside the academic year's window. Accepts X-API-Key.
    """
    if real:
        with transaction() as conn:
            result, events = service.commit(conn, batch_id, user, settings)
            webhook = (
                institutions.webhook_target(conn, user.institution_id, settings.webhook_key)
                if events and user.institution_id
                else None
            )
        _after_commit(background, events, webhook, result["batch_id"], settings)
        return result
    _mock_batch(batch_id)
    return mock("commit_result")


@router.post("/{batch_id}/corrections", response_model=CommitResult)
async def upload_corrections(
    batch_id: str,
    background: BackgroundTasks,
    file: UploadFile = File(...),
    user: User = Depends(INTEGRATORS),
    real: bool = Depends(REAL),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Upload a corrected file for the rows this committed batch rejected.

    The file is stored as a new batch linked by parent_batch_id, re-validated, and only rows
    matching a rejected row are committed: by a source_row column holding the original row
    number, else by APAAR ID, provisional ID, or name and date of birth. Fixed rows have
    their error findings in the original batch resolved.
    """
    name = file.filename or "corrections.csv"
    content = await file.read()
    if real:
        with transaction() as conn:
            result, events = service.correct(conn, batch_id, user, name, content, settings)
            webhook = (
                institutions.webhook_target(conn, user.institution_id, settings.webhook_key)
                if events and user.institution_id
                else None
            )
        _after_commit(background, events, webhook, result["batch_id"], settings)
        return result
    _mock_batch(batch_id)
    result = mock("commit_result")
    result.update(
        batch_id="30000000-0000-4000-8000-000000000002",
        rows_committed=4,
        rows_rejected=0,
        review_cases_created=[],
        parent_batch_id=batch_id,
    )
    return result
