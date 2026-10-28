# Owner: Dev B
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.core.rule_codes import RuleCode
from app.models.common import BatchStatus, IssueSeverity


class BatchCounts(BaseModel):
    rows_total: int = 0
    errors: int = 0
    warnings: int = 0
    review: int = 0
    info: int = 0


class Batch(BaseModel):
    id: str
    institution_id: str
    uploaded_by: str
    file_name: str
    file_hash: str
    status: BatchStatus
    counts: BatchCounts
    created_at: datetime
    parent_batch_id: str | None = Field(
        None, description="Set on a correction batch: the batch whose rejected rows it fixes"
    )


class BatchList(BaseModel):
    """One page of batches, newest first. total counts every match, not just this page."""

    items: list[Batch]
    total: int
    limit: int
    offset: int


class BatchUploadResult(BaseModel):
    batch: Batch
    suggested_mapping: dict[str, str] = Field(
        description="Uploaded column name -> admissions-template column name"
    )
    unmapped_columns: list[str]
    missing_required: list[str] = []
    duplicate_upload: bool = False


class MappingRequest(BaseModel):
    mapping: dict[str, str]


class ValidationIssue(BaseModel):
    id: int
    batch_id: str
    row_number: int
    rule_code: RuleCode
    severity: IssueSeverity
    message: str
    details: dict[str, Any] = {}
    resolved: bool = False
    resolution_note: str | None = None
    resolved_at: datetime | None = None


class ResolveIssueRequest(BaseModel):
    note: str = Field(min_length=1)


class CommitResult(BaseModel):
    batch_id: str
    status: BatchStatus
    rows_committed: int
    rows_rejected: int
    rows_skipped_existing: int = 0
    review_cases_created: list[str]
    parent_batch_id: str | None = Field(
        None, description="Set on a correction commit: the batch whose rejected rows it fixes"
    )
    rows_not_matched: int = Field(
        0, description="Correction rows that matched no rejected row of the parent batch"
    )


class CorrectionSuggestion(BaseModel):
    suggested_value: Any = None
    safe_to_apply: bool = False
    reason: str = ""


class CorrectionItem(BaseModel):
    issue_id: int
    row_number: int
    field: str
    current_value: Any = None
    rule_code: str
    severity: str
    simple_explanation: str
    suggested_correction: CorrectionSuggestion | None = None
    status: str = "pending"
    resolved: bool = False


class CorrectionTrackerSummary(BaseModel):
    total_issues: int
    errors_count: int
    warnings_count: int
    resolved_count: int
    current_quality_score: float
    potential_quality_score: float


class CorrectionTrackerResponse(BaseModel):
    batch_id: str
    summary: CorrectionTrackerSummary
    items: list[CorrectionItem]


class ApplyCorrectionRequest(BaseModel):
    issue_id: int
    row_number: int
    field: str
    corrected_value: Any
    action: str = "approve"  # "approve", "modify", "reject"
    officer_note: str = ""


class CorrectionAuditEntry(BaseModel):
    timestamp: datetime
    user_email: str
    user_role: str
    row_number: int
    field: str
    old_value: Any = None
    new_value: Any = None
    action: str
    revalidation_status: str
    officer_note: str = ""


class ApplyCorrectionResponse(BaseModel):
    success: bool
    message: str
    before_issues_count: int
    after_issues_count: int
    before_quality_score: float
    after_quality_score: float
    score_impact: str
    audit_entry: CorrectionAuditEntry

