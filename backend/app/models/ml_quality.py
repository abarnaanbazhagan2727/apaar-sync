# Owner: APAAR-Sync / SIH 2026
"""Data models for ML Data Quality verification and prototype Random Forest predictor."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

PredictionLabel = Literal["Potential Data Issue", "No Issue Flagged"]


class DataQualityFeaturesInput(BaseModel):
    """The six numerical features expected by the trained Random Forest prototype."""

    missing_fields: int = Field(
        ...,
        ge=0,
        le=50,
        description="Count of missing or blank required fields (0-50).",
        examples=[2],
    )
    duplicate_flag: int = Field(
        ...,
        ge=0,
        le=1,
        description="Duplicate indicator: 1 if duplicate suspected/found, 0 otherwise.",
        examples=[0],
    )
    invalid_id_format: int = Field(
        ...,
        ge=0,
        le=1,
        description="ID format indicator: 1 if APAAR ID format is invalid/malformed, 0 otherwise.",
        examples=[1],
    )
    invalid_age: int = Field(
        ...,
        ge=0,
        le=1,
        description="Age indicator: 1 if age outside permissible range (15-60), 0 otherwise.",
        examples=[0],
    )
    invalid_department: int = Field(
        ...,
        ge=0,
        le=1,
        description="Department: 1 if programme code is unrecognized, 0 otherwise.",
        examples=[0],
    )
    invalid_marks: int = Field(
        ...,
        ge=0,
        le=1,
        description="Marks: 1 if qualifying marks % is invalid (<0 or >100), 0 otherwise.",
        examples=[0],
    )


class DataQualityPredictionResponse(BaseModel):
    """Prediction outcome and prototype risk score."""

    prediction: int = Field(
        ...,
        description="Raw prediction class: 1 (Potential Data Issue), 0 (No Issue Flagged)",
    )
    label: PredictionLabel = Field(
        ...,
        description="Human-readable prediction label",
    )
    issue_probability: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Model issue-class probability (0.00 to 1.00)",
    )
    clean_probability: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Model clean-class probability (0.00 to 1.00)",
    )
    prototype_score_label: str = Field(
        default="Prototype Data-Quality Risk Score (0.00 - 1.00)",
        description="Explicit label designating this as a prototype score, not verified fraud",
    )
    features_evaluated: dict[str, int] = Field(
        ...,
        description="The six numerical features evaluated",
    )
    warnings: list[str] = Field(
        default_factory=list,
        description="Descriptive validation warnings for triggered features",
    )
    model_name: str = Field(
        default="RandomForestClassifier (APAAR-Sync Prototype)",
        description="Architecture name of the prototype model",
    )
    disclaimer: str = Field(
        default=(
            "Prototype model score trained on simulated student data for SIH 2026. "
            "Does NOT represent verified fraud probability or official APAAR verification."
        ),
        description="Mandatory prototype research disclaimer",
    )


class StudentRecordQualityInput(BaseModel):
    """Simulated student record submitted for combined deterministic validation and ML scoring."""

    student_name: str | None = Field(None, description="Full candidate name")
    apaar_id: str | None = Field(None, description="12-digit APAAR ID or provisional ID")
    apaar_opt_out: bool = Field(False, description="Opted out of APAAR")
    provisional_id: str | None = Field(None, description="Provisional identifier if opted out")
    dob: str | None = Field(None, description="Date of birth (YYYY-MM-DD or DD-MM-YYYY)")
    programme_code: str | None = Field(None, description="Approved AICTE programme code")
    qualifying_exam_pct: float | None = Field(None, description="Qualifying exam % marks")
    gender: str | None = Field(None, description="Gender (male, female, transgender)")
    category: str | None = Field(None, description="Social category (general, ews, obc, sc, st)")
    seat_pool: str | None = Field(None, description="Seat pool quota")
    domicile_state: str | None = Field(None, description="State of domicile")
    is_duplicate: bool = Field(False, description="Duplicate flag for testing")


class DeterministicFindingItem(BaseModel):
    """A deterministic validation issue found prior to or alongside ML evaluation."""

    rule_code: str
    field: str | None = None
    severity: str
    message: str


class StudentRecordQualityResponse(BaseModel):
    """Response containing both deterministic validation findings and ML prototype score."""

    record_summary: dict[str, Any]
    features_derived: DataQualityFeaturesInput
    deterministic_findings: list[DeterministicFindingItem]
    missing_required_fields: list[str]
    prediction: DataQualityPredictionResponse
    explanation: str


class ModelStatusResponse(BaseModel):
    """Safe model status information without disclosing filesystem internals."""

    status: Literal["ready", "missing_file", "error"]
    model_type: str
    version: str
    features: list[str]
    classes: list[int]
    total_trees: int | None = None
    disclaimer: str
