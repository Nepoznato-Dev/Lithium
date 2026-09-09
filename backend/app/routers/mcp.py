"""
MCP Protocol endpoint — expose Lithium tools to external AI clients.

Implements a minimal Model Context Protocol server over HTTP.
External clients (Claude, GPT, etc.) can:
  - GET  /api/mcp/tools     → list available tools
  - POST /api/mcp/call      → execute a tool

The frontend handles actual execution; the backend proxies the request
to the browser via a simple polling mechanism or direct response.
"""
from fastapi import APIRouter, Request
from pydantic import BaseModel
from typing import Optional, Dict, Any, List

router = APIRouter(prefix="/api/mcp", tags=["mcp"])


class ToolDefinition(BaseModel):
    name: str
    description: str
    inputSchema: Dict[str, Any]


class ToolCallRequest(BaseModel):
    name: str
    arguments: Optional[Dict[str, Any]] = {}


class ToolCallResponse(BaseModel):
    content: List[Dict[str, str]]
    isError: bool = False


# Static tool definitions (mirrors frontend mcpServer.js)
TOOLS: List[ToolDefinition] = [
    ToolDefinition(
        name="lithium_list_files",
        description="List files in the Lithium virtual file system at a given path.",
        inputSchema={
            "type": "object",
            "properties": {"path": {"type": "string", "description": "Directory path"}},
            "required": ["path"],
        },
    ),
    ToolDefinition(
        name="lithium_read_file",
        description="Read the contents of a file in the Lithium virtual file system.",
        inputSchema={
            "type": "object",
            "properties": {"path": {"type": "string", "description": "File path"}},
            "required": ["path"],
        },
    ),
    ToolDefinition(
        name="lithium_write_file",
        description="Write content to a file in the Lithium virtual file system.",
        inputSchema={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "File path"},
                "content": {"type": "string", "description": "File content"},
            },
            "required": ["path", "content"],
        },
    ),
    ToolDefinition(
        name="lithium_list_notes",
        description="List all notes in the Lithium Notes app.",
        inputSchema={"type": "object", "properties": {}},
    ),
    ToolDefinition(
        name="lithium_browser_history",
        description="Get recent browser browsing history.",
        inputSchema={
            "type": "object",
            "properties": {"limit": {"type": "number", "description": "Max entries (default 20)"}},
        },
    ),
    ToolDefinition(
        name="lithium_browser_bookmarks",
        description="Get all browser bookmarks.",
        inputSchema={"type": "object", "properties": {}},
    ),
    ToolDefinition(
        name="lithium_privacy_stats",
        description="Get privacy protection statistics.",
        inputSchema={"type": "object", "properties": {}},
    ),
    ToolDefinition(
        name="lithium_ai_chat",
        description="Send a message to the Lithium AI assistant.",
        inputSchema={
            "type": "object",
            "properties": {
                "message": {"type": "string", "description": "The message to send"},
                "sessionId": {"type": "string", "description": "Optional session ID"},
            },
            "required": ["message"],
        },
    ),
    ToolDefinition(
        name="lithium_ai_sessions",
        description="List all AI conversation sessions.",
        inputSchema={"type": "object", "properties": {}},
    ),
    ToolDefinition(
        name="lithium_storage_stats",
        description="Get storage usage statistics.",
        inputSchema={"type": "object", "properties": {}},
    ),
    ToolDefinition(
        name="lithium_system_info",
        description="Get system information about Lithium OS.",
        inputSchema={"type": "object", "properties": {}},
    ),
]


@router.get("/tools", response_model=List[ToolDefinition])
async def list_tools():
    """Return all available MCP tool definitions."""
    return TOOLS


@router.post("/call", response_model=ToolCallResponse)
async def call_tool(req: ToolCallRequest):
    """Execute a tool call.

    In the full implementation, this would proxy to the browser frontend
    via WebSocket or Server-Sent Events. For now, it returns a placeholder
    indicating the tool was received.
    """
    # In production, this would forward the call to the browser tab
    # via a persistent WebSocket connection or SSE channel.
    return ToolCallResponse(
        content=[
            {
                "type": "text",
                "text": f"Tool '{req.name}' received with args: {req.arguments}. "
                "Tool execution is handled by the Lithium browser frontend. "
                "Connect via the browser's MCP bridge for live execution.",
            }
        ],
        isError=False,
    )


@router.get("/status")
async def mcp_status():
    """MCP server status and capabilities."""
    return {
        "status": "running",
        "protocol_version": "1.0",
        "server_name": "Lithium MCP Server",
        "tools_count": len(TOOLS),
        "capabilities": ["tools"],
    }
