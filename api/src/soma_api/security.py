import base64
import binascii
import hashlib
import hmac
import secrets
import time

import jwt


TOKEN_ALGORITHM = "HS256"
TOKEN_ISSUER = "soma-api"
TOKEN_AUDIENCE = "soma-web"


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(
        password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=64
    )
    return "scrypt$16384$8$1${salt}${digest}".format(
        salt=_encode(salt), digest=_encode(digest)
    )


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, n, r, p, salt_text, digest_text = encoded.split("$")
        if algorithm != "scrypt":
            return False
        expected = hashlib.scrypt(
            password.encode("utf-8"),
            salt=_decode(salt_text),
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=len(_decode(digest_text)),
        )
    except (ValueError, TypeError, binascii.Error):
        return False
    return hmac.compare_digest(expected, _decode(digest_text))


def issue_token(user_id: int, username: str, secret: str, expires_in: int = 28800) -> str:
    now = int(time.time())
    payload = {
        "sub": str(user_id),
        "username": username,
        "iss": TOKEN_ISSUER,
        "aud": TOKEN_AUDIENCE,
        "iat": now,
        "nbf": now,
        "exp": now + expires_in,
        "jti": secrets.token_urlsafe(16),
    }
    return jwt.encode(payload, secret, algorithm=TOKEN_ALGORITHM)


def verify_token(token: str, secret: str) -> dict[str, object] | None:
    try:
        return jwt.decode(
            token,
            secret,
            algorithms=[TOKEN_ALGORITHM],
            issuer=TOKEN_ISSUER,
            audience=TOKEN_AUDIENCE,
            options={"require": ["sub", "username", "iss", "aud", "iat", "nbf", "exp", "jti"]},
        )
    except (jwt.InvalidTokenError, ValueError, KeyError, TypeError):
        return None


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
