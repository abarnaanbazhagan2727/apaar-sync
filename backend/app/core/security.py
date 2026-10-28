# Owner: Dev B
"""Authentication and role guards.

Mock mode: the user comes from the X-Demo-Role and X-Demo-Institution headers.
Otherwise: a Supabase access token in the Authorization header, verified against the
project JWKS (ES256/RS256) or, for legacy projects, SUPABASE_JWT_SECRET (HS256).
"""

from __future__ import annotations

from collections.abc import Callable
from functools import lru_cache
from typing import get_args

import jwt
from fastapi import Depends, Header, HTTPException, status

from app.core.config import Settings, get_settings
from app.models.auth import Role, User

import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta

ROLES: tuple[str, ...] = get_args(Role)
DEFAULT_DEMO_ROLE: Role = "aicte_admin"
DEMO_USER_IDS: dict[str, str] = {
    # The demo student maps to the first student in the mock fixtures.
    "student": "40000000-0000-4000-8000-000000000001",
}

LOCAL_JWT_SECRET = "apaar-sync-sih26263-jwt-signing-secret-2026-key"
LOCAL_JWT_ALGORITHM = "HS256"


def hash_password(password: str, salt: str | None = None) -> str:
    """NIST-compliant PBKDF2-HMAC-SHA256 password hash."""
    if salt is None:
        salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000)
    return f"pbkdf2:sha256:100000${salt}${key.hex()}"


def verify_password(plain_password: str, hashed: str) -> bool:
    """Verify plain password against PBKDF2 hash using constant-time comparison."""
    try:
        parts = hashed.split("$")
        if len(parts) != 3:
            return False
        _, salt, expected_hex = parts
        key = hashlib.pbkdf2_hmac("sha256", plain_password.encode("utf-8"), salt.encode("utf-8"), 100_000)
        return hmac.compare_digest(key.hex(), expected_hex)
    except Exception:
        return False


# Seed demo accounts using cryptographically hashed credentials.
# No plaintext passwords are ever stored.
DEMO_USERS_DATABASE: dict[str, dict[str, Any]] = {
    "admin@apaarsync.demo": {
        "id": "demo-admin-001",
        "email": "admin@apaarsync.demo",
        "password_hash": hash_password("Admin@123", salt="apaarsync_admin_salt_2026"),
        "role": "aicte_admin",
        "display_name": "AICTE Administrator",
        "institution_id": None,
        "institution_name": "AICTE Central Command",
        "role_label": "Admin",
        "description": "Full access to institutional oversight, AICTE review queue, intake radar, and audit logs.",
    },
    "officer@apaarsync.demo": {
        "id": "demo-officer-002",
        "email": "officer@apaarsync.demo",
        "password_hash": hash_password("Officer@123", salt="apaarsync_officer_salt_2026"),
        "role": "institution_operator",
        "display_name": "Admissions Officer",
        "institution_id": "10000000-0000-4000-8000-000000000003",
        "institution_name": "Shadow Institute of Technology",
        "role_label": "Institution Officer",
        "description": "Upload student CSVs, review validation issues, approve record corrections, and monitor intake risks.",
    },
    "reviewer@apaarsync.demo": {
        "id": "demo-reviewer-003",
        "email": "reviewer@apaarsync.demo",
        "password_hash": hash_password("Reviewer@123", salt="apaarsync_reviewer_salt_2026"),
        "role": "auditor",
        "display_name": "Compliance & Verification Reviewer",
        "institution_id": None,
        "institution_name": "AICTE Directorate of Quality Assurance",
        "role_label": "Reviewer",
        "description": "Read-only compliance auditor: inspect validation results, audit trail, and verify student credentials.",
    },
}

USER_ALIASES: dict[str, str] = {
    "admin": "admin@apaarsync.demo",
    "officer": "officer@apaarsync.demo",
    "reviewer": "reviewer@apaarsync.demo",
}


def authenticate_user(username_or_email: str, password: str) -> dict[str, Any] | None:
    """Authenticate against seeded demo users store using hashed password comparison."""
    clean_identifier = username_or_email.strip().lower()
    email = USER_ALIASES.get(clean_identifier, clean_identifier)
    user_record = DEMO_USERS_DATABASE.get(email)
    if not user_record:
        return None
    if not verify_password(password, user_record["password_hash"]):
        return None
    return user_record


def create_access_token(user_info: dict[str, Any], expires_delta: timedelta | None = None) -> str:
    """Create a signed JWT bearer token with expiration and roles."""
    now = datetime.now(UTC)
    expire = now + (expires_delta or timedelta(hours=24))
    payload = {
        "sub": user_info["id"],
        "email": user_info.get("email"),
        "role": user_info["role"],
        "institution_id": user_info.get("institution_id"),
        "institution_name": user_info.get("institution_name"),
        "display_name": user_info.get("display_name"),
        "app_metadata": {
            "role": user_info["role"],
            "institution_id": user_info.get("institution_id"),
            "institution_name": user_info.get("institution_name"),
        },
        "exp": int(expire.timestamp()),
        "iat": int(now.timestamp()),
        "iss": "apaar-sync-platform",
    }
    return jwt.encode(payload, LOCAL_JWT_SECRET, algorithm=LOCAL_JWT_ALGORITHM)


def demo_user(role: str | None, institution: str | None) -> User:
    role = (role or DEFAULT_DEMO_ROLE).strip()
    if role not in ROLES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, f"Unknown X-Demo-Role '{role}'. Use one of: {ROLES}"
        )
    return User(
        id=DEMO_USER_IDS.get(role, f"demo-{role}"),
        role=role,
        institution_id=institution or None,
        display_name=f"Demo {role.replace('_', ' ')}",
        demo=True,
    )


_ASYMMETRIC = ["ES256", "RS256"]


@lru_cache(maxsize=4)
def jwks_client(supabase_url: str) -> jwt.PyJWKClient:
    """Cached JWKS client for the project; keys are cached and refreshed on unknown kid."""
    url = f"{supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
    return jwt.PyJWKClient(url, cache_keys=True, lifespan=600, timeout=5)


def decode_token(token: str, settings: Settings) -> dict:
    """Verify a Supabase access token.

    Asymmetric tokens (ES256, RS256) are checked against the project JWKS. HS256 tokens are
    accepted only when SUPABASE_JWT_SECRET is set (legacy projects). Audience must be
    "authenticated"; the issuer must be {SUPABASE_URL}/auth/v1 whenever SUPABASE_URL is set.
    """
    algorithm = jwt.get_unverified_header(token).get("alg")
    issuer = f"{settings.supabase_url.rstrip('/')}/auth/v1" if settings.supabase_url else None
    options = {"require": ["exp", "sub"]} if issuer else {"require": ["sub"]}
    if algorithm == "HS256":
        if not settings.supabase_jwt_secret:
            raise jwt.InvalidTokenError("HS256 tokens need SUPABASE_JWT_SECRET")
        key: object = settings.supabase_jwt_secret
        algorithms = ["HS256"]
    elif algorithm in _ASYMMETRIC:
        if not settings.supabase_url:
            raise jwt.InvalidTokenError("SUPABASE_URL is needed to fetch the JWKS")
        key = jwks_client(settings.supabase_url).get_signing_key_from_jwt(token).key
        algorithms = _ASYMMETRIC
    else:
        raise jwt.InvalidTokenError(f"Unsupported algorithm {algorithm}")
    return jwt.decode(
        token,
        key,
        algorithms=algorithms,
        audience="authenticated",
        issuer=issuer,
        options=options,
    )


def _user_from_jwt(authorization: str | None, settings: Settings) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    raw_token = authorization.split(" ", 1)[1].strip()

    # 1. First check if it is our locally signed platform token
    try:
        claims = jwt.decode(
            raw_token,
            LOCAL_JWT_SECRET,
            algorithms=[LOCAL_JWT_ALGORITHM],
            options={"require": ["exp", "sub"]},
        )
        role = claims.get("role")
        if role not in ROLES:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Token has no platform role")
        return User(
            id=claims["sub"],
            role=role,
            institution_id=claims.get("institution_id"),
            display_name=claims.get("display_name") or claims.get("email"),
            email=claims.get("email"),
            institution_name=claims.get("institution_name"),
            demo=False,
            student_id=claims.get("student_id"),
        )
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Authentication token has expired. Please log in again.") from exc
    except jwt.InvalidSignatureError:
        pass  # Fall through to Supabase verification below
    except jwt.PyJWTError:
        pass  # Fall through

    # 2. Check against external Supabase provider if configured
    try:
        claims = decode_token(raw_token, settings)
    except (jwt.PyJWTError, jwt.PyJWKClientError) as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid authentication token") from exc

    app_meta = claims.get("app_metadata") or {}
    role = app_meta.get("role")
    if role not in ROLES:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Token has no platform role")
    return User(
        id=claims["sub"],
        role=role,
        institution_id=app_meta.get("institution_id"),
        display_name=claims.get("email"),
        demo=False,
        student_id=app_meta.get("student_id"),
    )


def get_current_user(
    authorization: str | None = Header(default=None),
    x_demo_role: str | None = Header(default=None),
    x_demo_institution: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> User:
    # If authorization header is provided, validate bearer token
    if authorization and authorization.lower().startswith("bearer "):
        return _user_from_jwt(authorization, settings)
    if settings.mock_mode:
        return demo_user(x_demo_role, x_demo_institution)
    return _user_from_jwt(authorization, settings)



INSTITUTION_ROLES = ("institution_admin", "institution_operator")


def scoped_institution(user: User, requested: str | None = None) -> str | None:
    """Institution a query or write is limited to.

    Institution users are always pinned to their own institution, taken from the
    authenticated user and never from the request; asking for another one is 403.
    Everyone else gets ``requested`` (None means all institutions).
    """
    if user.role not in INSTITUTION_ROLES:
        return requested
    if not user.institution_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "User is not linked to an institution")
    if requested and requested != user.institution_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your institution")
    return user.institution_id


def require_roles(*roles: Role) -> Callable[..., User]:
    """Dependency that returns the current user, or 403 if their role is not in ``roles``."""

    def guard(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN, f"Role '{user.role}' may not access this resource"
            )
        return user

    return guard
