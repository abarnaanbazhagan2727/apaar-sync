# Owner: APAAR-Sync / SIH 2026
"""INNOVATION 2: Faculty-Linked Dynamic Intake Risk Alerts.

Configurable monitoring module comparing programme-level intake against faculty availability.
Evaluates Student-to-Faculty Ratio (SFR) and cadre distribution using prototype AICTE rules.
Includes interactive What-If scenario simulation and recorded officer decisions.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.core.security import require_roles
from app.models.auth import User

log = logging.getLogger(__name__)

router = APIRouter(prefix="/intake-risk", tags=["intake-risk"])

AUTH_OFFICERS = require_roles("institution_admin", "institution_operator", "aicte_admin", "auditor")
DECISION_MAKERS = require_roles("institution_admin", "aicte_admin")

DEFAULT_SFR_THRESHOLD = 20.0
RECOMMENDED_SFR = 15.0

# Synthetic programme intake & staffing state for demonstration
PROGRAMMES_STAFFING_DB: dict[str, dict[str, Any]] = {
    "UG-CSE": {
        "programme_code": "UG-CSE",
        "programme_name": "B.Tech Computer Science & Engineering",
        "department": "Computer Science & Engineering",
        "approved_intake": 180,
        "enrolled_students": 178,
        "faculty_count": 6,
        "professors": 1,
        "associate_professors": 1,
        "assistant_professors": 4,
        "sfr_threshold": DEFAULT_SFR_THRESHOLD,
        "decision_status": "pending",
        "decision_action": None,
        "decision_note": None,
        "decided_by": None,
        "decided_at": None,
    },
    "UG-ECE": {
        "programme_code": "UG-ECE",
        "programme_name": "B.Tech Electronics & Communication",
        "department": "Electronics & Communication Engineering",
        "approved_intake": 120,
        "enrolled_students": 115,
        "faculty_count": 7,
        "professors": 1,
        "associate_professors": 2,
        "assistant_professors": 4,
        "sfr_threshold": DEFAULT_SFR_THRESHOLD,
        "decision_status": "compliant",
        "decision_action": "COMPLIANT_BASELINE",
        "decision_note": "Within AICTE prototype ratio benchmark.",
        "decided_by": "System Automated Check",
        "decided_at": "2026-10-01T00:00:00Z",
    },
    "UG-MECH": {
        "programme_code": "UG-MECH",
        "programme_name": "B.Tech Mechanical Engineering",
        "department": "Mechanical Engineering",
        "approved_intake": 60,
        "enrolled_students": 58,
        "faculty_count": 2,
        "professors": 0,
        "associate_professors": 1,
        "assistant_professors": 1,
        "sfr_threshold": DEFAULT_SFR_THRESHOLD,
        "decision_status": "pending",
        "decision_action": None,
        "decision_note": None,
        "decided_by": None,
        "decided_at": None,
    },
    "UG-AIDS": {
        "programme_code": "UG-AIDS",
        "programme_name": "B.Tech Artificial Intelligence & Data Science",
        "department": "Computer Science & Engineering",
        "approved_intake": 60,
        "enrolled_students": 60,
        "faculty_count": 1,
        "professors": 0,
        "associate_professors": 0,
        "assistant_professors": 1,
        "sfr_threshold": DEFAULT_SFR_THRESHOLD,
        "decision_status": "pending",
        "decision_action": None,
        "decision_note": None,
        "decided_by": None,
        "decided_at": None,
    },
    "UG-CIVIL": {
        "programme_code": "UG-CIVIL",
        "programme_name": "B.Tech Civil Engineering",
        "department": "Civil Engineering",
        "approved_intake": 60,
        "enrolled_students": 54,
        "faculty_count": 3,
        "professors": 1,
        "associate_professors": 1,
        "assistant_professors": 1,
        "sfr_threshold": DEFAULT_SFR_THRESHOLD,
        "decision_status": "compliant",
        "decision_action": "COMPLIANT_BASELINE",
        "decision_note": "Satisfies baseline staffing threshold.",
        "decided_by": "System Automated Check",
        "decided_at": "2026-10-01T00:00:00Z",
    },
}

INTAKE_RISK_AUDIT_LOG: list[dict[str, Any]] = []


def _compute_programme_metrics(prog: dict[str, Any]) -> dict[str, Any]:
    intake = prog["approved_intake"]
    faculty = prog["faculty_count"]
    threshold = prog.get("sfr_threshold", DEFAULT_SFR_THRESHOLD)
    sfr = round(intake / max(faculty, 1), 1)
    required_faculty = max(1, int(-(-intake // int(threshold))))  # ceiling division
    faculty_deficit = max(0, required_faculty - faculty)

    professors = prog.get("professors", 0)
    associates = prog.get("associate_professors", 0)
    assistants = prog.get("assistant_professors", 0)

    # Risk evaluation
    if faculty_deficit >= 3 or sfr >= 35.0 or faculty <= 1:
        risk_level = "CRITICAL"
        alert_title = "Critical Faculty Deficit & Capacity Risk"
    elif faculty_deficit > 0 or sfr > threshold:
        risk_level = "HIGH"
        alert_title = "High Student-Faculty Ratio Alert"
    elif sfr > RECOMMENDED_SFR:
        risk_level = "MODERATE"
        alert_title = "Moderate Load - Approaching Cap"
    else:
        risk_level = "COMPLIANT"
        alert_title = "Compliant Staffing Level"

    # Cadre analysis
    cadre_notes = []
    if intake >= 120 and professors < 1:
        cadre_notes.append("Senior Cadre Deficit: 0 Professors (minimum 1 required for approved intake >= 120)")
    if professors == 0 and associates == 0:
        cadre_notes.append("Severe Cadre Imbalance: Department has only Assistant Professors")
    cadre_summary = "; ".join(cadre_notes) if cadre_notes else "Cadre ratio within acceptable norms"

    explanation = (
        f"Approved intake of {intake} with {faculty} available faculty results in an SFR of {sfr}:1 "
        f"(configured AICTE prototype threshold: {threshold}:1). "
        f"Requires minimum {required_faculty} faculty members ({faculty_deficit} deficit). {cadre_summary}."
    )

    return {
        **prog,
        "sfr": sfr,
        "sfr_threshold": threshold,
        "recommended_sfr": RECOMMENDED_SFR,
        "required_faculty": required_faculty,
        "faculty_deficit": faculty_deficit,
        "risk_level": risk_level,
        "alert_title": alert_title,
        "alert_explanation": explanation,
        "cadre_summary": cadre_summary,
    }


class ProgrammeRiskItem(BaseModel):
    programme_code: str
    programme_name: str
    department: str
    approved_intake: int
    enrolled_students: int
    faculty_count: int
    professors: int
    associate_professors: int
    assistant_professors: int
    sfr: float
    sfr_threshold: float
    recommended_sfr: float
    required_faculty: int
    faculty_deficit: int
    risk_level: Literal["CRITICAL", "HIGH", "MODERATE", "COMPLIANT"]
    alert_title: str
    alert_explanation: str
    cadre_summary: str
    decision_status: str
    decision_action: str | None = None
    decision_note: str | None = None
    decided_by: str | None = None
    decided_at: str | None = None


class IntakeRiskOverview(BaseModel):
    institution_id: str
    institution_name: str
    total_approved_intake: int
    total_faculty: int
    overall_institutional_sfr: float
    critical_alerts_count: int
    high_alerts_count: int
    pending_decisions_count: int
    programmes: list[ProgrammeRiskItem]
    disclaimer: str


class WhatIfSimulationRequest(BaseModel):
    programme_code: str
    proposed_intake: int = Field(ge=10, le=600)
    available_faculty: int = Field(ge=1, le=100)
    professors: int = Field(ge=0, le=20, default=1)
    associate_professors: int = Field(ge=0, le=30, default=2)
    assistant_professors: int = Field(ge=0, le=50, default=4)
    custom_threshold: float = Field(ge=10.0, le=30.0, default=DEFAULT_SFR_THRESHOLD)


class WhatIfSimulationResponse(BaseModel):
    programme_code: str
    original_intake: int
    original_faculty: int
    original_sfr: float
    original_risk: str
    simulated_intake: int
    simulated_faculty: int
    simulated_sfr: float
    simulated_required_faculty: int
    simulated_faculty_gap: int
    simulated_risk: str
    risk_change_label: str
    explanation: str


class RecordDecisionRequest(BaseModel):
    decision_action: Literal[
        "ACKNOWLEDGE_RECRUITMENT",
        "PROPOSE_INTAKE_REDUCTION",
        "CROSS_DEPT_SHARING",
        "FLAG_FOR_AICTE_REVIEW",
    ]
    officer_notes: str = Field(min_length=3)


class DecisionResponse(BaseModel):
    success: bool
    programme_code: str
    decision_action: str
    decided_by: str
    decided_at: datetime
    message: str


class IntakeRiskAuditItem(BaseModel):
    timestamp: datetime
    programme_code: str
    decided_by: str
    user_role: str
    decision_action: str
    officer_notes: str
    previous_risk: str


@router.get("/programmes", response_model=IntakeRiskOverview)
def get_intake_risk_overview(
    user: User = Depends(AUTH_OFFICERS),
) -> IntakeRiskOverview:
    """Return institutional programme intake vs faculty staffing analysis and risk alerts."""
    prog_list = [_compute_programme_metrics(p) for p in PROGRAMMES_STAFFING_DB.values()]

    total_intake = sum(p["approved_intake"] for p in prog_list)
    total_faculty = sum(p["faculty_count"] for p in prog_list)
    overall_sfr = round(total_intake / max(total_faculty, 1), 1)

    critical_count = sum(1 for p in prog_list if p["risk_level"] == "CRITICAL")
    high_count = sum(1 for p in prog_list if p["risk_level"] == "HIGH")
    pending_count = sum(1 for p in prog_list if p["decision_status"] == "pending")

    return IntakeRiskOverview(
        institution_id=user.institution_id or "10000000-0000-4000-8000-000000000003",
        institution_name=user.institution_name or "Shadow Institute of Technology",
        total_approved_intake=total_intake,
        total_faculty=total_faculty,
        overall_institutional_sfr=overall_sfr,
        critical_alerts_count=critical_count,
        high_alerts_count=high_count,
        pending_decisions_count=pending_count,
        programmes=prog_list,
        disclaimer=(
            "AICTE Prototype Demonstration for SIH 2026 (Problem SIH26263). "
            "Thresholds and alerts represent configurable prototype rules for simulation purposes."
        ),
    )


@router.post("/simulate", response_model=WhatIfSimulationResponse)
def simulate_what_if(
    sim: WhatIfSimulationRequest,
    user: User = Depends(AUTH_OFFICERS),
) -> WhatIfSimulationResponse:
    """Simulate changes in proposed intake or faculty availability to assess impact on risk tier."""
    base = PROGRAMMES_STAFFING_DB.get(sim.programme_code)
    if not base:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Programme '{sim.programme_code}' not found in registry.",
        )

    orig_computed = _compute_programme_metrics(base)

    sim_prog = {
        **base,
        "approved_intake": sim.proposed_intake,
        "faculty_count": sim.available_faculty,
        "professors": sim.professors,
        "associate_professors": sim.associate_professors,
        "assistant_professors": sim.assistant_professors,
        "sfr_threshold": sim.custom_threshold,
    }
    sim_computed = _compute_programme_metrics(sim_prog)

    orig_risk = orig_computed["risk_level"]
    sim_risk = sim_computed["risk_level"]

    if orig_risk in ("CRITICAL", "HIGH") and sim_risk in ("COMPLIANT", "MODERATE"):
        change_label = "RISK MITIGATED: Action brings programme into compliance"
    elif orig_risk == sim_risk:
        change_label = f"NO TIER CHANGE: Remains in {sim_risk} category"
    else:
        change_label = f"STATUS UPDATED: Changed from {orig_risk} to {sim_risk}"

    return WhatIfSimulationResponse(
        programme_code=sim.programme_code,
        original_intake=base["approved_intake"],
        original_faculty=base["faculty_count"],
        original_sfr=orig_computed["sfr"],
        original_risk=orig_risk,
        simulated_intake=sim.proposed_intake,
        simulated_faculty=sim.available_faculty,
        simulated_sfr=sim_computed["sfr"],
        simulated_required_faculty=sim_computed["required_faculty"],
        simulated_faculty_gap=sim_computed["faculty_deficit"],
        simulated_risk=sim_risk,
        risk_change_label=change_label,
        explanation=sim_computed["alert_explanation"],
    )


@router.post("/{programme_code}/decide", response_model=DecisionResponse)
def record_officer_decision(
    programme_code: str,
    body: RecordDecisionRequest,
    user: User = Depends(DECISION_MAKERS),
) -> DecisionResponse:
    """Authorized admissions officer or administrator records a reviewed decision on the alert."""
    prog = PROGRAMMES_STAFFING_DB.get(programme_code)
    if not prog:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Programme '{programme_code}' not found in registry.",
        )

    prev_metrics = _compute_programme_metrics(prog)
    prev_risk = prev_metrics["risk_level"]

    now = datetime.now(UTC)
    prog["decision_status"] = "mitigated" if body.decision_action != "FLAG_FOR_AICTE_REVIEW" else "escalated"
    prog["decision_action"] = body.decision_action
    prog["decision_note"] = body.officer_notes
    prog["decided_by"] = user.email or user.display_name or "Admissions Officer"
    prog["decided_at"] = now.isoformat()

    audit_entry = {
        "timestamp": now,
        "programme_code": programme_code,
        "decided_by": user.email or user.display_name or "Admissions Officer",
        "user_role": user.role,
        "decision_action": body.decision_action,
        "officer_notes": body.officer_notes,
        "previous_risk": prev_risk,
    }
    INTAKE_RISK_AUDIT_LOG.append(audit_entry)

    return DecisionResponse(
        success=True,
        programme_code=programme_code,
        decision_action=body.decision_action,
        decided_by=prog["decided_by"],
        decided_at=now,
        message=f"Decision '{body.decision_action}' recorded for {programme_code}. Audit entry committed.",
    )


@router.get("/audit", response_model=list[IntakeRiskAuditItem])
def get_intake_risk_audit_log(
    user: User = Depends(AUTH_OFFICERS),
) -> list[dict]:
    """Retrieve history of all officer decisions and mitigations taken on intake risk alerts."""
    return INTAKE_RISK_AUDIT_LOG
