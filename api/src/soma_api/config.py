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
    mcp_allowed_tools: tuple[str, ...] = ()
    mcp_timeout_seconds: float = 10.0
    mcp_max_output_chars: int = 12000


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
    allowed_tools = tuple(
        tool.strip()
        for tool in os.getenv("MCP_ALLOWED_TOOLS", "").split(",")
        if tool.strip()
    )
    try:
        mcp_timeout_seconds = max(0.1, float(os.getenv("MCP_TIMEOUT_SECONDS", "10")))
    except ValueError:
        mcp_timeout_seconds = 10.0
    try:
        mcp_max_output_chars = max(
            256, int(os.getenv("MCP_MAX_OUTPUT_CHARS", "12000"))
        )
    except ValueError:
        mcp_max_output_chars = 12000
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
        mcp_allowed_tools=allowed_tools,
        mcp_timeout_seconds=mcp_timeout_seconds,
        mcp_max_output_chars=mcp_max_output_chars,
    )
