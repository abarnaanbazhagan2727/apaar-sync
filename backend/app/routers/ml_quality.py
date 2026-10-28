# Owner: APAAR-Sync / SIH 2026
"""API Router for ML Data Quality evaluation and Random Forest prototype inference."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends

from app.core.security import require_roles
from app.mocks import mock
from app.models.auth import User
from app.models.ml_quality import (
    DataQualityFeaturesInput,
    DataQualityPredictionResponse,
    ModelStatusResponse,
    StudentRecordQualityInput,
    StudentRecordQualityResponse,
)
from app.services import ml_model

log = logging.getLogger(__name__)

# Endpoints are accessible to all platform roles for demonstration & verification
ANY_ROLE = require_roles(
    "institution_operator",
    "institution_admin",
    "aicte_admin",
    "auditor",
    "student",
    "verifier",
)

# Primary router mounted under /api/ml
router = APIRouter(prefix="/api/ml", tags=["ml-quality"])

# Legacy / direct router mounted under /ml for backwards and cross-convention compatibility
router_direct = APIRouter(prefix="/ml", tags=["ml-quality"])


@router.get("/model-info", response_model=ModelStatusResponse)
@router_direct.get("/model-info", response_model=ModelStatusResponse)
def get_model_information(user: User = Depends(ANY_ROLE)) -> ModelStatusResponse:
    """Return model runtime status, expected features, classes, and disclaimers safely."""
    return ml_model.get_model_status()


@router.post("/predict", response_model=DataQualityPredictionResponse)
@router_direct.post("/predict", response_model=DataQualityPredictionResponse)
def predict_data_quality(
    features: DataQualityFeaturesInput,
    user: User = Depends(ANY_ROLE),
) -> DataQualityPredictionResponse:
    """Run inference on the six validated features using the prototype Random Forest model."""
    return ml_model.predict_quality(features)


@router.post("/evaluate-record", response_model=StudentRecordQualityResponse)
@router_direct.post("/evaluate-record", response_model=StudentRecordQualityResponse)
def evaluate_student_record(
    record: StudentRecordQualityInput,
    user: User = Depends(ANY_ROLE),
) -> StudentRecordQualityResponse:
    """Evaluate a candidate student record against deterministic rules and the ML model."""
    return ml_model.evaluate_student_record(record)


@router.get("/batch/{batch_id}")
@router_direct.get("/batch/{batch_id}")
def evaluate_batch_quality(
    batch_id: str,
    user: User = Depends(ANY_ROLE),
) -> dict[str, Any]:
    """Evaluate quality across an uploaded batch using the prototype ML model."""
    try:
        mock_batch = mock("batch")
        mock_issues = mock("validation_issues")
    except Exception:
        mock_batch = None
        mock_issues = []

    total_rows = 15
    if mock_batch and str(mock_batch.get("id")) == batch_id:
        total_rows = mock_batch.get("counts", {}).get("total_rows", 15)

    missing_cnt = sum(
        1
        for i in mock_issues
        if i.get("rule_code") in ("REQUIRED_FIELD_MISSING", "APAAR_MISSING")
    )
    dup_cnt = sum(1 for i in mock_issues if "DUP" in str(i.get("rule_code", "")))
    id_fmt_cnt = sum(1 for i in mock_issues if i.get("rule_code") == "APAAR_FORMAT")
    age_cnt = sum(1 for i in mock_issues if i.get("rule_code") == "AGE_OUT_OF_RANGE")
    dept_cnt = sum(1 for i in mock_issues if i.get("rule_code") == "PROGRAMME_UNKNOWN")
    marks_cnt = sum(
        1
        for i in mock_issues
        if i.get("rule_code") in ("MARKS_OUT_OF_RANGE", "MARKS_INVALID")
    )

    sample_features = DataQualityFeaturesInput(
        missing_fields=min(missing_cnt, 3),
        duplicate_flag=1 if dup_cnt > 0 else 0,
        invalid_id_format=1 if id_fmt_cnt > 0 else 0,
        invalid_age=1 if age_cnt > 0 else 0,
        invalid_department=1 if dept_cnt > 0 else 0,
        invalid_marks=1 if marks_cnt > 0 else 0,
    )

    batch_prediction = ml_model.predict_quality(sample_features)

    return {
        "batch_id": batch_id,
        "total_rows_evaluated": total_rows,
        "sample_features": sample_features.model_dump(),
        "batch_ml_summary": batch_prediction.model_dump(),
        "counts": {
            "missing_field_issues": missing_cnt,
            "duplicate_issues": dup_cnt,
            "invalid_id_format_issues": id_fmt_cnt,
            "invalid_age_issues": age_cnt,
            "invalid_department_issues": dept_cnt,
            "invalid_marks_issues": marks_cnt,
        },
        "disclaimer": (
            "Prototype ML batch evaluation on simulated data for SIH 2026. "
            "Deterministic findings and model scores are reported separately."
        ),
    }


@router.get("/institution-radar/{institution_id}")
@router_direct.get("/institution-radar/{institution_id}")
def get_institution_quality_radar(
    institution_id: str,
    user: User = Depends(ANY_ROLE),
) -> dict[str, Any]:
    """INNOVATION 3: Explainable Data Quality and Risk Radar at institution level."""
    return {
        "institution_id": institution_id,
        "institution_name": "Shadow Institute of Technology",
        "overall_quality_score": 88.5,
        "quality_tier": "HIGH_COMPLIANCE",
        "deterministic_rules_audit": {
            "missing_field_rate": 2.4,
            "duplicate_record_rate": 1.1,
            "invalid_format_count": 3,
            "unresolved_compliance_issues": 1,
            "statutory_rules_applied": [
                {"rule": "REQUIRED_COLUMNS", "status": "PASS", "description": "Mandatory identity and admission fields verified"},
                {"rule": "APAAR_12_DIGITS", "status": "FLAGGED", "description": "3 records with non-conforming identifier lengths"},
                {"rule": "INTRA_BATCH_UNIQUENESS", "status": "FLAGGED", "description": "2 duplicate records identified across programmes"},
                {"rule": "AGE_BOUNDARY_15_60", "status": "PASS", "description": "All candidate birth dates within eligible range"},
                {"rule": "QUALIFYING_PERCENTAGE_RANGE", "status": "PASS", "description": "Marks percentages bounded between 0-100%"},
            ],
            "transparent_formula": "Score = 100.0 - (Missing_Rate * 2.5) - (Duplicate_Rate * 4.0) - (Format_Errors * 1.0) - (Unresolved * 0.5)",
            "calculation_breakdown": {
                "base_score": 100.0,
                "missing_fields_penalty": -6.0,
                "duplicate_penalty": -4.4,
                "invalid_format_penalty": -3.0,
                "unresolved_penalty": -0.5,
                "final_score": 88.5,
            },
        },
        "historical_trends": [
            {"batch_number": 1, "upload_date": "2026-09-15", "total_rows": 60, "errors": 9, "score": 72.0},
            {"batch_number": 2, "upload_date": "2026-10-02", "total_rows": 60, "errors": 5, "score": 81.5},
            {"batch_number": 3, "upload_date": "2026-10-28", "total_rows": 60, "errors": 2, "score": 88.5},
        ],
        "recurring_errors_by_department": [
            {"programme_code": "UG-CSE", "department": "Computer Science & Engineering", "duplicates": 2, "missing_fields": 1, "format_errors": 1, "total_issues": 4},
            {"programme_code": "UG-ECE", "department": "Electronics & Communication", "duplicates": 0, "missing_fields": 2, "format_errors": 1, "total_issues": 3},
            {"programme_code": "UG-MECH", "department": "Mechanical Engineering", "duplicates": 0, "missing_fields": 1, "format_errors": 2, "total_issues": 3},
            {"programme_code": "UG-AIDS", "department": "AI & Data Science", "duplicates": 1, "missing_fields": 0, "format_errors": 0, "total_issues": 1},
        ],
        "ml_prototype_assessment": {
            "model_name": "RandomForestClassifier (APAAR-Sync Prototype)",
            "model_version": "0.1.0-prototype",
            "simulated_anomaly_probability": 0.115,
            "feature_importance_weights": {
                "missing_fields": 0.35,
                "duplicate_flag": 0.30,
                "invalid_id_format": 0.16,
                "invalid_marks": 0.10,
                "invalid_age": 0.05,
                "invalid_department": 0.04,
            },
            "disclaimer": (
                "Prototype model trained on simulated student data for SIH 2026 Problem SIH26263. "
                "Deterministic findings and model scores are reported separately. "
                "Does NOT represent verified fraud probability or official government API."
            ),
        },
    }

