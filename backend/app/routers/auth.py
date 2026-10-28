from __future__ import annotations

from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.security import (
    DEMO_USERS_DATABASE,
    authenticate_user,
    create_access_token,
    get_current_user,
)
from app.models.auth import (
    DemoAccountInfo,
    LoginRequest,
    LoginResponse,
    LogoutResponse,
    User,
)

router = APIRouter(tags=["auth"])


@router.post("/auth/login", response_model=LoginResponse)
def login(credentials: LoginRequest) -> LoginResponse:
    """Authenticate user with email or username and password against seeded credentials."""
    user_record = authenticate_user(credentials.identifier, credentials.password)
    if not user_record:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password. Please check your credentials.",
        )

    token = create_access_token(user_record)
    user = User(
        id=user_record["id"],
        role=user_record["role"],
        institution_id=user_record.get("institution_id"),
        display_name=user_record.get("display_name"),
        email=user_record.get("email"),
        institution_name=user_record.get("institution_name"),
        demo=True,
    )
    return LoginResponse(
        access_token=token,
        token_type="Bearer",
        expires_in=86400,
        user=user,
    )


@router.post("/auth/logout", response_model=LogoutResponse)
def logout() -> LogoutResponse:
    """End active user session."""
    return LogoutResponse(success=True, message="Successfully logged out.")


@router.get("/auth/demo-credentials", response_model=list[DemoAccountInfo])
def get_demo_credentials() -> list[DemoAccountInfo]:
    """Provide verified demo credential profiles for SIH demonstration."""
    accounts = []
    for email, data in DEMO_USERS_DATABASE.items():
        accounts.append(
            DemoAccountInfo(
                role_key=data["role"],
                role_label=data["role_label"],
                email=email,
                display_name=data["display_name"],
                institution_name=data.get("institution_name"),
                institution_id=data.get("institution_id"),
                description=data["description"],
            )
        )
    return accounts


@router.get("/me", response_model=User)
def me(user: User = Depends(get_current_user)) -> User:
    """Return currently authenticated profile from bearer token or session."""
    return user


