from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: EmailStr
    role: str
    is_active: bool
    must_change_password: bool = False
    created_at: datetime


class UserListResponse(BaseModel):
    users: list[UserResponse]
    total: int


class CreateUserRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)  # same minimum as LoginRequest
    role: str = "user"


class UpdateUserRequest(BaseModel):
    password: str | None = Field(default=None, min_length=8)  # same minimum as LoginRequest
    role: str | None = None
    is_active: bool | None = None
    # True signs the user out and makes them pick a new password at next sign-in.
    must_change_password: bool | None = None
