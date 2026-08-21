from langchain_mcp_adapters.client import MultiServerMCPClient

from .config import Settings


async def load_external_tools(settings: Settings):
    """Load read-only external tools only when explicitly enabled."""
    if not settings.mcp_enabled:
        return []
    client = MultiServerMCPClient(
        {
            "langchain_docs": {
                "transport": "http",
                "url": settings.mcp_langchain_docs_url,
            }
        }
    )
    return await client.get_tools()
