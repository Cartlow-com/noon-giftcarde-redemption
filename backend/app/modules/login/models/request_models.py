from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)


class RefreshSessionRequest(BaseModel):
    refresh_token: str = Field(min_length=1)
