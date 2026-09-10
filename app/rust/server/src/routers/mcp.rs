//! MCP Protocol endpoint — expose Lithium tools to external AI clients.

use axum::Json;
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
pub struct ToolDefinition {
    pub name: &'static str,
    pub description: &'static str,
    pub input_schema: serde_json::Value,
}

#[derive(Deserialize)]
pub struct ToolCallRequest {
    pub name: String,
    #[serde(default)]
    pub arguments: serde_json::Value,
}

#[derive(Serialize)]
pub struct ToolCallResponse {
    pub content: Vec<serde_json::Value>,
    pub is_error: bool,
}

fn tools() -> Vec<ToolDefinition> {
    vec![
        ToolDefinition { name: "lithium_list_files", description: "List files in the Lithium virtual file system at a given path.", input_schema: serde_json::json!({"type":"object","properties":{"path":{"type":"string","description":"Directory path"}},"required":["path"]}) },
        ToolDefinition { name: "lithium_read_file", description: "Read the contents of a file in the Lithium virtual file system.", input_schema: serde_json::json!({"type":"object","properties":{"path":{"type":"string","description":"File path"}},"required":["path"]}) },
        ToolDefinition { name: "lithium_write_file", description: "Write content to a file in the Lithium virtual file system.", input_schema: serde_json::json!({"type":"object","properties":{"path":{"type":"string","description":"File path"},"content":{"type":"string","description":"File content"}},"required":["path","content"]}) },
        ToolDefinition { name: "lithium_list_notes", description: "List all notes in the Lithium Notes app.", input_schema: serde_json::json!({"type":"object","properties":{}}) },
        ToolDefinition { name: "lithium_browser_history", description: "Get recent browser browsing history.", input_schema: serde_json::json!({"type":"object","properties":{"limit":{"type":"number","description":"Max entries (default 20)"}}}) },
        ToolDefinition { name: "lithium_browser_bookmarks", description: "Get all browser bookmarks.", input_schema: serde_json::json!({"type":"object","properties":{}}) },
        ToolDefinition { name: "lithium_privacy_stats", description: "Get privacy protection statistics.", input_schema: serde_json::json!({"type":"object","properties":{}}) },
        ToolDefinition { name: "lithium_ai_chat", description: "Send a message to the Lithium AI assistant.", input_schema: serde_json::json!({"type":"object","properties":{"message":{"type":"string","description":"The message to send"},"sessionId":{"type":"string","description":"Optional session ID"}},"required":["message"]}) },
        ToolDefinition { name: "lithium_ai_sessions", description: "List all AI conversation sessions.", input_schema: serde_json::json!({"type":"object","properties":{}}) },
        ToolDefinition { name: "lithium_storage_stats", description: "Get storage usage statistics.", input_schema: serde_json::json!({"type":"object","properties":{}}) },
        ToolDefinition { name: "lithium_system_info", description: "Get system information about Lithium OS.", input_schema: serde_json::json!({"type":"object","properties":{}}) },
    ]
}

pub async fn list_tools() -> Json<Vec<ToolDefinition>> {
    Json(tools())
}

pub async fn call_tool(Json(req): Json<ToolCallRequest>) -> Json<ToolCallResponse> {
    Json(ToolCallResponse {
        content: vec![serde_json::json!({
            "type": "text",
            "text": format!("Tool '{}' received with args: {}. Tool execution is handled by the Lithium browser frontend. Connect via the browser's MCP bridge for live execution.", req.name, req.arguments),
        })],
        is_error: false,
    })
}

pub async fn mcp_status() -> Json<serde_json::Value> {
    let t = tools();
    Json(serde_json::json!({
        "status": "running", "protocol_version": "1.0",
        "server_name": "Lithium MCP Server", "tools_count": t.len(),
        "capabilities": ["tools"],
    }))
}
