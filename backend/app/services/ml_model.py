# Owner: APAAR-Sync / SIH 2026
"""Singleton service for loading and executing the APAAR-Sync Random Forest model."""

from __future__ import annotations

import logging
import os
import re
import warnings
from datetime import date, datetime
from pathlib import Path
from typing import Any

import joblib
import pandas as pd
from fastapi import HTTPException, status

from app.models.ml_quality import (
    DataQualityFeaturesInput,
    DataQualityPredictionResponse,
    DeterministicFindingItem,
    ModelStatusResponse,
    StudentRecordQualityInput,
    StudentRecordQualityResponse,
)

log = logging.getLogger(__name__)

FEATURE_NAMES: list[str] = [
    "missing_fields",
    "duplicate_flag",
    "invalid_id_format",
    "invalid_age",
    "invalid_department",
    "invalid_marks",
]

# AICTE standard reference programmes for validation demonstration
KNOWN_PROGRAMMES: set[str] = {
    "CSE",
    "ECE",
    "EEE",
    "MECH",
    "CIVIL",
    "IT",
    "AI_ML",
    "AIDS",
    "CS_DS",
    "CS_BS",
    "ROBOTICS",
    "BIOTECH",
    "CHEMICAL",
    "AEROSPACE",
    "AUTOMOBILE",
    "MBA",
    "MCA",
}

_MODEL: Any | None = None
_MODEL_STATUS: str = "unloaded"
_MODEL_LOAD_ERROR: str | None = None
_APAAR_DIGITS_RE = re.compile(r"^\d{12}$")
_REFERENCE_CUTOFF_DATE = date(2026, 9, 30)


def _find_model_path() -> Path | None:
    """Safely locate the joblib file across execution contexts without exposing paths."""
    candidates = [
        # Explicit env override
        Path(os.environ["APAAR_MODEL_PATH"]) if "APAAR_MODEL_PATH" in os.environ else None,
        # Standard backend/models directory relative to this file
        Path(__file__).resolve().parents[2] / "models" / "apaar_sync_model.joblib",
        # Current working directory / models
        Path.cwd() / "models" / "apaar_sync_model.joblib",
        # Current working directory / backend / models
        Path.cwd() / "backend" / "models" / "apaar_sync_model.joblib",
        # Downloads fallback if available
        Path.home() / "Downloads" / "apaar_sync_model.joblib",
    ]
    for candidate in candidates:
        if candidate and candidate.is_file():
            return candidate
    return None


def load_model() -> Any | None:
    """Load the model once at startup and cache the instance in memory."""
    global _MODEL, _MODEL_STATUS, _MODEL_LOAD_ERROR  # noqa: PLW0603
    if _MODEL is not None:
        return _MODEL

    model_path = _find_model_path()
    if not model_path:
        _MODEL_STATUS = "missing_file"
        _MODEL_LOAD_ERROR = "Model file 'apaar_sync_model.joblib' not found in backend/models."
        log.warning("ML model file not found. Predictions will return a friendly service message.")
        return None

    try:
        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", category=UserWarning)
            _MODEL = joblib.load(model_path)
            _MODEL_STATUS = "ready"
            _MODEL_LOAD_ERROR = None
            log.info("Successfully loaded APAAR-Sync Random Forest model into memory.")
            return _MODEL
    except Exception as exc:  # noqa: BLE001
        _MODEL_STATUS = "error"
        _MODEL_LOAD_ERROR = f"Failed to deserialize model: {exc.__class__.__name__}"
        log.exception("Error deserializing joblib model file.")
        return None


def get_model() -> Any:
    """Retrieve the cached model or attempt loading once."""
    if _MODEL is None:
        load_model()
    if _MODEL is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "ML_MODEL_UNAVAILABLE",
                "message": (
                    "The prototype Random Forest model is currently unavailable on the server. "
                    "Ensure 'apaar_sync_model.joblib' is located in backend/models."
                ),
                "status": _MODEL_STATUS,
            },
        )
    return _MODEL


def get_model_status() -> ModelStatusResponse:
    """Return model operational status without disclosing internal filesystem paths."""
    model = _MODEL
    if model is None:
        load_model()
        model = _MODEL

    if model is None:
        return ModelStatusResponse(
            status="missing_file" if _MODEL_STATUS == "missing_file" else "error",
            model_type="RandomForestClassifier",
            version="0.1.0-prototype",
            features=FEATURE_NAMES,
            classes=[0, 1],
            total_trees=None,
            disclaimer=(
                "Prototype model for SIH 2026 Problem SIH26263. Model file is not loaded."
            ),
        )

    classes_list = [int(c) for c in getattr(model, "classes_", [0, 1])]
    trees_count = len(getattr(model, "estimators_", []))

    return ModelStatusResponse(
        status="ready",
        model_type=model.__class__.__name__,
        version="0.1.0-prototype",
        features=FEATURE_NAMES,
        classes=classes_list,
        total_trees=trees_count if trees_count > 0 else None,
        disclaimer=(
            "Prototype model trained on simulated student data for SIH 2026 (Problem SIH26263). "
            "Does not represent verified fraud probability or official APAAR verification."
        ),
    )


def predict_quality(features: DataQualityFeaturesInput) -> DataQualityPredictionResponse:
    """Execute prediction on the six validated features using the cached model."""
    model = get_model()

    input_dict = {
        "missing_fields": int(features.missing_fields),
        "duplicate_flag": int(features.duplicate_flag),
        "invalid_id_format": int(features.invalid_id_format),
        "invalid_age": int(features.invalid_age),
        "invalid_department": int(features.invalid_department),
        "invalid_marks": int(features.invalid_marks),
    }

    df = pd.DataFrame([input_dict], columns=FEATURE_NAMES)

    try:
        raw_pred = int(model.predict(df)[0])
        probabilities = model.predict_proba(df)[0]
        clean_prob = float(probabilities[0])
        issue_prob = float(probabilities[1]) if len(probabilities) > 1 else (1.0 - clean_prob)
    except Exception as exc:  # noqa: BLE001
        log.exception("Prediction inference failed.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error generating model prediction inference.",
        ) from exc

    warnings_list: list[str] = []
    if features.missing_fields > 0:
        warnings_list.append(f"{features.missing_fields} required field(s) were missing or blank.")
    if features.duplicate_flag == 1:
        warnings_list.append("Duplicate identity or multiple enrollment collision detected.")
    if features.invalid_id_format == 1:
        warnings_list.append("Identifier does not match 12-digit numeric APAAR standard.")
    if features.invalid_age == 1:
        warnings_list.append("Candidate age is outside admission boundary (15 - 60 years).")
    if features.invalid_department == 1:
        warnings_list.append("Programme code is not recognized in approved institutional registry.")
    if features.invalid_marks == 1:
        warnings_list.append("Qualifying marks percentage is outside limits (0.00% - 100.00%).")

    is_issue = raw_pred == 1 or issue_prob >= 0.5
    label: str = "Potential Data Issue" if is_issue else "No Issue Flagged"

    return DataQualityPredictionResponse(
        prediction=raw_pred,
        label=label,  # type: ignore[arg-type]
        issue_probability=round(issue_prob, 4),
        clean_probability=round(clean_prob, 4),
        prototype_score_label="Prototype Data-Quality Risk Score (0.00 - 1.00)",
        features_evaluated=input_dict,
        warnings=warnings_list,
        model_name="RandomForestClassifier (APAAR-Sync Prototype)",
        disclaimer=(
            "Prototype model score trained on simulated student data for SIH 2026. "
            "Does NOT represent verified fraud probability or official APAAR verification."
        ),
    )


def _parse_candidate_date(raw_date: str | None) -> date | None:
    if not raw_date or not raw_date.strip():
        return None
    cleaned = raw_date.strip().split("T")[0].split(" ")[0]
    formats = ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%Y/%m/%d", "%d.%m.%Y")
    for fmt in formats:
        try:
            return datetime.strptime(cleaned, fmt).date()
        except ValueError:
            continue
    return None


def evaluate_student_record(record: StudentRecordQualityInput) -> StudentRecordQualityResponse:
    """Apply deterministic validation checks, map to the 6 features, and run ML model."""
    findings: list[DeterministicFindingItem] = []
    missing_fields: list[str] = []

    # 1. Missing fields audit
    required_checks = {
        "student_name": record.student_name,
        "dob": record.dob,
        "gender": record.gender,
        "category": record.category,
        "seat_pool": record.seat_pool,
        "programme_code": record.programme_code,
        "qualifying_exam_pct": record.qualifying_exam_pct,
    }
    for field_name, value in required_checks.items():
        if value is None or (isinstance(value, str) and not value.strip()):
            missing_fields.append(field_name)
            findings.append(
                DeterministicFindingItem(
                    rule_code="REQUIRED_FIELD_MISSING",
                    field=field_name,
                    severity="error",
                    message=f"Mandatory admission field '{field_name}' is blank or unprovided.",
                )
            )

    missing_fields_count = len(missing_fields)

    # 2. APAAR ID format audit
    invalid_id_format = 0
    raw_apaar = (record.apaar_id or "").replace(" ", "").strip()
    if record.apaar_opt_out:
        if not record.provisional_id and not raw_apaar:
            missing_fields.append("provisional_id")
            missing_fields_count += 1
            findings.append(
                DeterministicFindingItem(
                    rule_code="REQUIRED_FIELD_MISSING",
                    field="provisional_id",
                    severity="warning",
                    message="Student opted out of APAAR but no provisional ID was supplied.",
                )
            )
    else:
        if not raw_apaar:
            missing_fields.append("apaar_id")
            missing_fields_count += 1
            invalid_id_format = 1
            findings.append(
                DeterministicFindingItem(
                    rule_code="APAAR_MISSING",
                    field="apaar_id",
                    severity="error",
                    message="APAAR ID is missing and student has not opted out.",
                )
            )
        elif not _APAAR_DIGITS_RE.fullmatch(raw_apaar):
            invalid_id_format = 1
            findings.append(
                DeterministicFindingItem(
                    rule_code="APAAR_FORMAT",
                    field="apaar_id",
                    severity="error",
                    message=f"APAAR ID must contain 12 numeric digits ({len(raw_apaar)} chars).",
                )
            )

    # 3. Duplicate flag
    duplicate_flag = 1 if record.is_duplicate else 0
    if duplicate_flag == 1:
        findings.append(
            DeterministicFindingItem(
                rule_code="DUP_RECORD_FLAGGED",
                field="apaar_id",
                severity="review",
                message="Record flagged as potential intra-batch or cross-institution duplicate.",
            )
        )

    # 4. Age audit
    invalid_age = 0
    parsed_dob = _parse_candidate_date(record.dob)
    if record.dob and not parsed_dob:
        invalid_age = 1
        findings.append(
            DeterministicFindingItem(
                rule_code="DATE_INVALID",
                field="dob",
                severity="error",
                message=f"Date of birth '{record.dob}' is unparseable.",
            )
        )
    elif parsed_dob:
        cutoff = _REFERENCE_CUTOFF_DATE
        diff = (cutoff.month, cutoff.day) < (parsed_dob.month, parsed_dob.day)
        age = cutoff.year - parsed_dob.year - diff
        if age < 15 or age > 60:
            invalid_age = 1
            findings.append(
                DeterministicFindingItem(
                    rule_code="AGE_OUT_OF_RANGE",
                    field="dob",
                    severity="warning",
                    message=f"Age ({age} yrs on {cutoff.isoformat()}) outside range (15-60).",
                )
            )

    # 5. Department / Programme audit
    invalid_department = 0
    raw_prog = (record.programme_code or "").strip().upper()
    if raw_prog:
        if raw_prog not in KNOWN_PROGRAMMES and not re.match(r"^[A-Z0-9_\-]{2,12}$", raw_prog):
            invalid_department = 1
            findings.append(
                DeterministicFindingItem(
                    rule_code="PROGRAMME_UNKNOWN",
                    field="programme_code",
                    severity="warning",
                    message=f"Programme code '{raw_prog}' not recognized in approved departments.",
                )
            )
    elif "programme_code" not in missing_fields:
        invalid_department = 1

    # 6. Marks audit
    invalid_marks = 0
    if record.qualifying_exam_pct is not None:
        try:
            pct = float(record.qualifying_exam_pct)
            if pct < 0.0 or pct > 100.0:
                invalid_marks = 1
                findings.append(
                    DeterministicFindingItem(
                        rule_code="MARKS_OUT_OF_RANGE",
                        field="qualifying_exam_pct",
                        severity="error",
                        message=f"Percentage ({pct}%) must be between 0.00% and 100.00%.",
                    )
                )
        except (ValueError, TypeError):
            invalid_marks = 1
            findings.append(
                DeterministicFindingItem(
                    rule_code="MARKS_INVALID",
                    field="qualifying_exam_pct",
                    severity="error",
                    message="Qualifying marks percentage could not be parsed as a decimal number.",
                )
            )

    # Map directly into the 6 model features
    features_derived = DataQualityFeaturesInput(
        missing_fields=min(missing_fields_count, 50),
        duplicate_flag=duplicate_flag,
        invalid_id_format=invalid_id_format,
        invalid_age=invalid_age,
        invalid_department=invalid_department,
        invalid_marks=invalid_marks,
    )

    # Predict using the loaded model
    prediction = predict_quality(features_derived)

    # Safe summary of submitted record
    masked_id = (
        f"XXXX-XXXX-{raw_apaar[-4:]}"
        if len(raw_apaar) >= 4
        else (raw_apaar or "(blank)")
    )
    record_summary = {
        "student_name": record.student_name or "(unspecified)",
        "apaar_id_masked": masked_id,
        "programme_code": raw_prog or "(unspecified)",
        "qualifying_exam_pct": record.qualifying_exam_pct,
        "dob": record.dob or "(unspecified)",
        "opted_out": record.apaar_opt_out,
    }

    score_pct = prediction.issue_probability * 100.0
    explanation = (
        f"Record evaluated: {len(findings)} deterministic finding(s). "
        f"Prototype risk score: {score_pct:.1f}% ({prediction.label})."
    )

    return StudentRecordQualityResponse(
        record_summary=record_summary,
        features_derived=features_derived,
        deterministic_findings=findings,
        missing_required_fields=missing_fields,
        prediction=prediction,
        explanation=explanation,
    )
