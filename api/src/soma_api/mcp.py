import asyncio
from concurrent.futures import ThreadPoolExecutor, TimeoutError as ExecutorTimeout
import json
import re
from typing import Any

from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain_core.tools import StructuredTool

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
    tools = await client.get_tools()
    return [
        _wrap_tool(tool, settings)
        for tool in tools
        if _is_allowed_read_only_tool(tool, settings)
    ]


WRITE_MARKERS = {
    "add",
    "append",
    "archive",
    "create",
    "change",
    "delete",
    "destroy",
    "execute",
    "insert",
    "modify",
    "mutate",
    "overwrite",
    "approve",
    "cancel",
    "clear",
    "copy",
    "edit",
    "merge",
    "move",
    "patch",
    "post",
    "prepend",
    "put",
    "replace",
    "remove",
    "rename",
    "reset",
    "rewrite",
    "run",
    "save",
    "send",
    "set",
    "submit",
    "truncate",
    "update",
    "upsert",
    "upload",
    "write",
}


def _is_allowed_read_only_tool(tool: Any, settings: Settings) -> bool:
    name = str(getattr(tool, "name", ""))
    if not name or name not in settings.mcp_allowed_tools:
        return False
    # Split common camelCase names too, so naming style cannot bypass the veto.
    normalized_name = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", name)
    tokens = set(re.findall(r"[a-z0-9]+", normalized_name.lower()))
    return not tokens.intersection(WRITE_MARKERS)


def _wrap_tool(tool: Any, settings: Settings) -> StructuredTool:
    async def invoke(**kwargs: Any) -> str:
        result = await asyncio.wait_for(
            tool.ainvoke(kwargs), timeout=settings.mcp_timeout_seconds
        )
        return _limit_output(result, settings.mcp_max_output_chars)

    def invoke_sync(**kwargs: Any) -> str:
        # ToolNode may use the synchronous path. Run the same bounded async
        # adapter in a short-lived executor so the timeout remains effective.
        executor = ThreadPoolExecutor(max_workers=1)
        future = executor.submit(lambda: asyncio.run(invoke(**kwargs)))
        try:
            return future.result(timeout=settings.mcp_timeout_seconds + 0.5)
        except ExecutorTimeout as error:
            future.cancel()
            raise TimeoutError("MCP tool timeout") from error
        finally:
            executor.shutdown(wait=False, cancel_futures=True)

    return StructuredTool.from_function(
        func=invoke_sync,
        coroutine=invoke,
        name=str(tool.name),
        description=str(getattr(tool, "description", "Read-only MCP tool")),
        args_schema=getattr(tool, "args_schema", None),
    )


def _limit_output(value: Any, max_chars: int) -> str:
    if isinstance(value, str):
        text = value
    else:
        text = json.dumps(value, ensure_ascii=True, default=str)
    if len(text) <= max_chars:
        return text
    suffix = "... [MCP output truncated]"
    if max_chars <= len(suffix):
        return suffix[:max_chars]
    return f"{text[:max_chars - len(suffix)]}{suffix}"
