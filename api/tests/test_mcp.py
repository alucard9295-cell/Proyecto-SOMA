import asyncio

from langchain_core.tools import tool

from soma_api.config import Settings
from soma_api.mcp import load_external_tools


@tool
def search_docs(query: str) -> str:
    """Search documentation without changing it."""
    return "result-" + (query * 100)


@tool
def update_docs(query: str) -> str:
    """Write documentation."""
    return query


@tool
def modify_docs(query: str) -> str:
    """Mutate documentation."""
    return query


@tool
def unlisted_docs(query: str) -> str:
    """Tool that is not in the configured allowlist."""
    return query


class FakeMCPClient:
    def __init__(self, *_args, **_kwargs):
        self.called = True

    async def get_tools(self):
        return [search_docs, update_docs, modify_docs, unlisted_docs]


def _settings(**overrides):
    values = dict(
        database_path="data/test.sqlite3",
        jwt_secret="secret",
        cors_origins=("http://localhost:5173",),
        allowed_hosts=("testserver",),
        environment="test",
        agent_api_key="",
        agent_base_url="http://agent",
        agent_model="test",
        agent_require_auth=False,
        mcp_enabled=True,
        mcp_langchain_docs_url="http://mcp",
        mcp_allowed_tools=("search_docs", "update_docs", "modify_docs"),
        mcp_timeout_seconds=1,
        mcp_max_output_chars=32,
    )
    values.update(overrides)
    return Settings(**values)


def test_mcp_is_disabled_by_default(monkeypatch):
    class ExplodingClient:
        def __init__(self, *_args, **_kwargs):
            raise AssertionError("disabled MCP must not create a client")

    monkeypatch.setattr("soma_api.mcp.MultiServerMCPClient", ExplodingClient)
    assert asyncio.run(load_external_tools(_settings(mcp_enabled=False))) == []


def test_mcp_accepts_only_allowlisted_read_tools_and_limits_output(monkeypatch):
    monkeypatch.setattr("soma_api.mcp.MultiServerMCPClient", FakeMCPClient)
    tools = asyncio.run(load_external_tools(_settings()))
    assert [candidate.name for candidate in tools] == ["search_docs"]
    result = asyncio.run(tools[0].ainvoke({"query": "x"}))
    assert len(result) <= 32


def test_mcp_rejects_modify_tool_even_when_allowlisted(monkeypatch):
    monkeypatch.setattr("soma_api.mcp.MultiServerMCPClient", FakeMCPClient)
    tools = asyncio.run(load_external_tools(_settings()))
    assert "modify_docs" not in [candidate.name for candidate in tools]
    assert "unlisted_docs" not in [candidate.name for candidate in tools]
