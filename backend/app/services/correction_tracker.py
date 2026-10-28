# Owner: APAAR-Sync / SIH 2026
"""Correction Impact Tracker: Detection, safe suggestion, revalidation, and audit history.

Ensures student records are never silently modified or deleted. Every change requires
explicit officer review and approval, and generates a traceable audit record.
"""

from __future__ import annotations

import logging
import re
from datetime import UTC, datetime
from typing import Any

from app.core.rule_codes import RuleCode
from app.models.auth import User
from app.services.ingestion import NormalizedRow, normalize_row
from app.services.validation import ValidationContext, check_batch, check_row

log = logging.getLogger(__name__)

_APAAR_DIGITS_RE = re.compile(r"^\d{12}$")


def generate_simple_explanation(rule_code: str, field: str | None, current_val: Any, evidence: dict[str, Any]) -> str:
    """Generate clear, non-technical plain English explanation for institutional staff."""
    if "DUP_IN_BATCH" in rule_code:
        dup_row = evidence.get("duplicate_of_row", "another row")
        return f"Duplicate record collision: This student ID is identical to Row {dup_row} in this upload."
    if "DUP_CROSS_INSTITUTION" in rule_code:
        other = evidence.get("other_institution_code", "another institution")
        return f"Cross-institution conflict: This APAAR ID is already registered under institution '{other}'."
    if "REQUIRED_FIELD_MISSING" in rule_code:
        col = field or evidence.get("field", "field")
        return f"Missing mandatory information: Mandatory field '{col}' is blank."
    if "APAAR_FORMAT" in rule_code:
        length = len(str(current_val or ""))
        return f"Invalid APAAR format: Identifier has {length} characters. APAAR standard requires exactly 12 numeric digits."
    if "APAAR_MISSING" in rule_code:
        return "APAAR ID missing: Student record has no APAAR ID and opt-out flag is not set."
    if "DATE_INVALID" in rule_code:
        return f"Unparseable date: '{current_val}' is not in a recognized date format (expected YYYY-MM-DD or DD-MM-YYYY)."
    if "AGE_IMPLAUSIBLE" in rule_code or "AGE_OUT_OF_RANGE" in rule_code:
        age = evidence.get("age", "implausible")
        return f"Age boundary alert: Student age ({age} years) is outside normal admission limits (15-60 years)."
    if "PROGRAMME_UNKNOWN" in rule_code:
        prog = evidence.get("programme", current_val)
        return f"Unrecognized programme: Programme code '{prog}' is not recognized in approved AICTE offerings."
    if "MARKS_OUT_OF_RANGE" in rule_code or "MARKS_INVALID" in rule_code:
        return f"Invalid exam percentage: Value '{current_val}' is outside the valid range of 0.00% to 100.00%."
    return f"Compliance finding ({rule_code}): Field '{field}' requires institutional review."


def generate_suggested_correction(rule_code: str, field: str | None, current_val: Any, row_data: dict[str, Any]) -> dict[str, Any]:
    """Propose a safe, deterministic correction when possible."""
    raw_str = str(current_val or "").strip()
    
    if "REQUIRED_FIELD_MISSING" in rule_code:
        f = field or ""
        defaults = {
            "gender": "male",
            "category": "general",
            "admission_mode": "cap",
            "seat_pool": "regular",
            "nationality": "INDIAN",
            "academic_year": "2026-27",
            "qualifying_exam": "HSC",
            "qualifying_exam_pct": 75.0,
            "pwd": False,
            "apaar_opt_out": False,
            "oci_status": False,
            "fn_status": False,
            "nri_category": False,
            "domicile_state": "MH",
        }
        if f in defaults:
            return {
                "suggested_value": defaults[f],
                "safe_to_apply": True,
                "reason": f"Standard default statutory value for '{f}' in admission filings.",
            }
        if f == "provisional_id" and row_data.get("apaar_opt_out"):
            row_num = row_data.get("row_number", 1)
            suggested_prov = f"PROV-2026-{row_num:05d}"
            return {
                "suggested_value": suggested_prov,
                "safe_to_apply": True,
                "reason": "Generated sequential provisional identifier for student opting out of APAAR.",
            }

    if "APAAR_FORMAT" in rule_code:
        cleaned = re.sub(r"[\s\-]", "", raw_str)
        if len(cleaned) == 12 and cleaned.isdigit():
            return {
                "suggested_value": cleaned,
                "safe_to_apply": True,
                "reason": "Stripped formatting hyphens/spaces to restore standard 12-digit numeric APAAR.",
            }
        return {
            "suggested_value": None,
            "safe_to_apply": False,
            "reason": "Requires manual verification from candidate's Aadhaar/DigiLocker consent card.",
        }

    if "MARKS_OUT_OF_RANGE" in rule_code or "MARKS_INVALID" in rule_code:
        try:
            num = float(raw_str.replace("%", "").strip())
            if num > 100.0 and num <= 1000.0:
                pct = round(num / 10.0, 2)
                return {
                    "suggested_value": pct,
                    "safe_to_apply": True,
                    "reason": f"Converted total marks ({num}/1000) into standardized percentage ({pct}%).",
                }
            if num < 0:
                return {
                    "suggested_value": abs(num),
                    "safe_to_apply": True,
                    "reason": "Corrected negative percentage sign.",
                }
        except (ValueError, TypeError):
            pass

    if "DATE_INVALID" in rule_code:
        for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d", "%d.%m.%Y"):
            try:
                dt = datetime.strptime(raw_str, fmt).date()
                return {
                    "suggested_value": dt.isoformat(),
                    "safe_to_apply": True,
                    "reason": f"Standardized date string to ISO-8601 format ({dt.isoformat()}).",
                }
            except ValueError:
                continue

    if "PROGRAMME_UNKNOWN" in rule_code:
        prog_map = {
            "COMP_SCI": "CSE",
            "COMPUTER": "CSE",
            "ME": "MECH",
            "MECHANICAL": "MECH",
            "EC": "ECE",
            "ELECTRONICS": "ECE",
            "IT_ENGG": "IT",
            "AI": "AI_ML",
            "DATA_SCIENCE": "AIDS",
        }
        upper_val = raw_str.upper()
        if upper_val in prog_map:
            return {
                "suggested_value": prog_map[upper_val],
                "safe_to_apply": True,
                "reason": f"Mapped institution shorthand '{upper_val}' to official AICTE programme code '{prog_map[upper_val]}'.",
            }

    return {
        "suggested_value": None,
        "safe_to_apply": False,
        "reason": "Requires manual review and correction by admissions officer.",
    }


def calculate_data_quality_score(total_rows: int, error_count: int, warning_count: int) -> float:
    """Deterministic score calculation (0 - 100%)."""
    if total_rows <= 0:
        return 100.0
    error_penalty = (error_count / total_rows) * 75.0
    warning_penalty = (warning_count / total_rows) * 20.0
    score = 100.0 - error_penalty - warning_penalty
    return round(max(0.0, min(100.0, score)), 1)
