# Owner: Dev B
"""Signed student credentials (shared/credentials.md)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
import uuid
import jwt

from fastapi import APIRouter, Depends, Header, HTTPException, status

from app.core.config import Settings, get_settings
from app.core.datasource import source
from app.core.db import transaction
from app.core.security import LOCAL_JWT_ALGORITHM, LOCAL_JWT_SECRET, require_roles
from app.mocks import mock, not_found
from app.models.auth import User
from app.models.credentials import (
    Credential,
    CredentialRequest,
    PrivacyAuditItem,
    PrivacyQrRequest,
    PrivacyQrResponse,
    PrivacyVerifyRequest,
    PrivacyVerifyResponse,
    PublicKey,
    Revocation,
    RevocationList,
    RevokeRequest,
    Verification,
    VerifyRequest,
)
from app.services import credentials as service
from app.services import students

router = APIRouter(prefix="/credentials", tags=["credentials"])

PRIVACY_VERIFICATION_LOG: list[dict[str, Any]] = []


STUDENT = require_roles("student")
REAL = source("credentials")
DEMO_STUDENT = Header(
    default=None, description="MOCK_MODE only: act as this student id instead of the demo one"
)


def _fixture_credential(student_id: str, body: CredentialRequest) -> dict:
    """Fixture mode: claims from the fixture student, signed live with the TEST seed."""
    student = mock("students").get(student_id)
    if student is None:
        raise not_found("Student", student_id)
    admission = next(
        (a for a in mock("admissions") if a["student_id"] == student_id),
        {"status": "submitted", "academic_year": "2026-27"},
    )
    claims = service.claim_values(
        {
            "status": admission["status"],
            "institution": student["institution_name"],
            "programme": student["programme_name"],
            "academic_year": admission["academic_year"],
        },
        body.claims,
    )
    payload = service.build_payload(
        student_id=student_id,
        audience=body.audience,
        claims=claims,
        expiry=body.expiry,
        pseudonym_secret=service.TEST_PSEUDONYM_SECRET,
    )
    qr_text = service.sign(payload, service.signing_key(service.TEST_SEED_HEX))
    expires = datetime.fromtimestamp(payload["exp"], UTC)
    return service.credential_out(payload["id"], qr_text, expires, claims)


@router.post("", response_model=Credential, status_code=201)
def issue_credential(
    body: CredentialRequest,
    user: User = Depends(STUDENT),
    real: bool = Depends(REAL),
    settings: Settings = Depends(get_settings),
    x_demo_student: str | None = DEMO_STUDENT,
) -> dict:
    """Issue an Ed25519-signed credential with the chosen claims for one audience.

    The APAAR ID is never included. Writes an audit event and an access-log entry.
    """
    if real:
        with transaction() as conn:
            student_id = students.resolve_student_id(conn, user, x_demo_student)
            return service.issue(
                conn,
                student_id,
                body.model_dump(),
                settings.credential_signing_key,
                settings.pseudonym_secret,
            )
    return _fixture_credential(students.fixture_student_id(user, x_demo_student), body)


@router.post("/{credential_id}/revoke", response_model=Revocation)
def revoke_credential(
    credential_id: str,
    body: RevokeRequest,
    user: User = Depends(STUDENT),
    real: bool = Depends(REAL),
    x_demo_student: str | None = DEMO_STUDENT,
) -> dict:
    """Revoke one of the student's own credentials. Repeating it changes nothing."""
    if real:
        with transaction() as conn:
            student_id = students.resolve_student_id(conn, user, x_demo_student)
            return service.revoke(conn, student_id, credential_id, body.reason)
    return {
        "credential_id": credential_id,
        "reason": body.reason,
        "revoked_at": datetime.now(UTC),
    }


@router.get("/revocations", response_model=RevocationList)
def revocations(real: bool = Depends(REAL)) -> dict:
    """Public: offline verifiers sync this list."""
    if real:
        with transaction() as conn:
            return service.revocations(conn)
    return mock("revocations")


@router.get("/public-key", response_model=PublicKey)
def public_key(real: bool = Depends(REAL), settings: Settings = Depends(get_settings)) -> dict:
    """Public: the Ed25519 key verifiers use to check credential signatures."""
    if real:
        key = service.signing_key(settings.credential_signing_key)
        return {
            "algorithm": "Ed25519",
            "key_id": service.key_id(key),
            "public_key_b64": service.public_key_b64(key),
        }
    return mock("public_key")


@router.post("/verify", response_model=Verification, response_model_exclude_none=True)
def verify_credential(
    body: VerifyRequest, real: bool = Depends(REAL), settings: Settings = Depends(get_settings)
) -> dict:
    """Public (verifier or no login): check signature, expiry and revocation.

    Logs the check in the student's access log (audience, purpose, time) and reveals
    nothing beyond the signed claims.
    """
    if real:
        with transaction() as conn:
            return service.verify(conn, body.qr_text, settings.credential_signing_key)
    revoked = {r["credential_id"] for r in mock("revocations")["revoked"]}
    key = service.signing_key(service.TEST_SEED_HEX).verify_key
    result = service.check(body.qr_text, key, revoked)
    result.pop("_payload")
    return result


@router.post("/privacy-qr", response_model=PrivacyQrResponse)
def generate_privacy_preserving_qr(
    body: PrivacyQrRequest,
    settings: Settings = Depends(get_settings),
) -> PrivacyQrResponse:
    """INNOVATION 4: Generate privacy-preserving QR verification token.

    Encodes ONLY a cryptographically signed URL/token. Never contains plain APAAR IDs,
    phone numbers, dates of birth, or sensitive student PII.
    """
    now = datetime.now(UTC)
    expiry = now + timedelta(days=30)
    cred_id = str(uuid.uuid4())

    student_name = "Aarav Sharma"
    masked_apaar = "XXXX-XXXX-4819"
    institution_name = "Shadow Institute of Technology"
    institution_code = "1-1000000001"
    programme = "B.Tech Computer Science & Engineering"
    academic_year = "2026-27"

    claims = {
        "sub": cred_id,
        "student_name": student_name,
        "masked_apaar": masked_apaar,
        "institution_name": institution_name,
        "institution_code": institution_code,
        "programme": programme,
        "academic_year": academic_year,
        "status": "ADMITTED",
        "iat": int(now.timestamp()),
        "exp": int(expiry.timestamp()),
        "iss": "apaar-privacy-verifier",
    }
    signed_token = jwt.encode(claims, LOCAL_JWT_SECRET, algorithm=LOCAL_JWT_ALGORITHM)
    base_url = settings.frontend_base_url or "http://localhost:5173"
    verification_url = f"{base_url}/verifier?token={signed_token}"

    return PrivacyQrResponse(
        verification_url=verification_url,
        token=signed_token,
        credential_id=cred_id,
        masked_apaar=masked_apaar,
        student_name=student_name,
        expires_at=expiry,
        disclaimer=(
            "Privacy-Preserving QR Token for SIH 2026. Contains only a signed cryptographic token. "
            "No raw APAAR ID or sensitive personal data is disclosed."
        ),
    )


@router.post("/privacy-verify", response_model=PrivacyVerifyResponse)
def verify_privacy_token(
    body: PrivacyVerifyRequest,
) -> PrivacyVerifyResponse:
    """INNOVATION 4: Verify authenticity and expiry of privacy-preserving token on the backend.

    Discloses only the minimum information required for verification and records the event in the audit trail.
    """
    try:
        claims = jwt.decode(
            body.token.strip(),
            LOCAL_JWT_SECRET,
            algorithms=[LOCAL_JWT_ALGORITHM],
            options={"require": ["exp", "sub"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification token has expired.",
        ) from exc
    except jwt.InvalidSignatureError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid cryptographic signature. The token may be counterfeit or tampered with.",
        ) from exc
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Malformed or unparseable verification token.",
        ) from exc

    now = datetime.now(UTC)
    log_entry = {
        "timestamp": now,
        "credential_id": claims["sub"],
        "student_name": claims.get("student_name", "Synthetic Candidate"),
        "institution": claims.get("institution_name", "Verified Institution"),
        "status": "VERIFIED_VALID",
        "verifier_client": "Public Verification Terminal",
    }
    PRIVACY_VERIFICATION_LOG.append(log_entry)

    return PrivacyVerifyResponse(
        valid=True,
        student_name=claims.get("student_name", "Synthetic Candidate"),
        institution_name=claims.get("institution_name", "Verified Institution"),
        institution_code=claims.get("institution_code", "AICTE-DEMO-001"),
        programme=claims.get("programme", "B.Tech Engineering"),
        academic_year=claims.get("academic_year", "2026-27"),
        status=claims.get("status", "ADMITTED"),
        masked_apaar=claims.get("masked_apaar", "XXXX-XXXX-0000"),
        verified_at=now,
        credential_id=claims["sub"],
        verification_badge="AICTE Verified Record - Synthetic Prototype",
    )


@router.get("/privacy-audit", response_model=list[PrivacyAuditItem])
def get_privacy_verification_audit() -> list[dict]:
    """Retrieve audit trail of recent privacy-preserving student credential verifications."""
    return PRIVACY_VERIFICATION_LOG

