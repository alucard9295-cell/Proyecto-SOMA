from dataclasses import dataclass
import os


@dataclass(frozen=True)
class Settings:
    database_path: str
    jwt_secret: str
    cors_origins: tuple[str, ...]
    allowed_hosts: tuple[str, ...]
    environment: str
    agent_api_key: str
    agent_base_url: str
    agent_model: str
    agent_require_auth: bool
    mcp_enabled: bool
    mcp_langchain_docs_url: str


def load_settings() -> Settings:
    origins = tuple(
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS", "http://127.0.0.1:5173,http://localhost:5173"
        ).split(",")
        if origin.strip()
    )
    environment = os.getenv("ENVIRONMENT", "development")
    secret = os.getenv("JWT_SECRET", "local-development-only-change-me")
    if environment == "production" and secret == "local-development-only-change-me":
        raise RuntimeError("JWT_SECRET must be configured in production")
    return Settings(
        database_path=os.getenv("DATABASE_PATH", "data/soma.sqlite3"),
        jwt_secret=secret,
        cors_origins=origins,
        allowed_hosts=tuple(
            host.strip()
            for host in os.getenv(
                "ALLOWED_HOSTS", "127.0.0.1,localhost,testserver"
            ).split(",")
            if host.strip()
        ),
        environment=environment,
        agent_api_key=os.getenv("AGENT_API_KEY", ""),
        agent_base_url=os.getenv("AGENT_BASE_URL", "https://opencode.ai/zen/go/v1"),
        agent_model=os.getenv("AGENT_MODEL", "deepseek-v4-pro"),
        agent_require_auth=os.getenv("AGENT_REQUIRE_AUTH", "false").lower() == "true",
        mcp_enabled=os.getenv("MCP_ENABLED", "false").lower() == "true",
        mcp_langchain_docs_url=os.getenv(
            "MCP_LANGCHAIN_DOCS_URL", "https://docs.langchain.com/mcp"
        ),
    )
