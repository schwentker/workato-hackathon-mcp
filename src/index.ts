import express, { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createClient } from "@supabase/supabase-js";

import { registerParticipantTools } from "./tools/participants.js";
import { registerTeamTools } from "./tools/teams.js";
import { registerSubmissionTools } from "./tools/submissions.js";
import { registerAwardTools } from "./tools/awards.js";

// ── Environment ───────────────────────────────────────────────────────────────

const PORT = parseInt(process.env["PORT"] ?? "3000", 10);

const SUPABASE_URL = process.env["SUPABASE_URL"];
const SUPABASE_SERVICE_KEY = process.env["SUPABASE_SERVICE_KEY"];

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing required env vars: SUPABASE_URL and SUPABASE_SERVICE_KEY");
  process.exit(1);
}

// ── Supabase ──────────────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

// ── MCP Server ────────────────────────────────────────────────────────────────

const mcp = new McpServer({
  name: "workato-hackathon-mcp",
  version: "1.0.0",
});

registerParticipantTools(mcp, supabase);
registerTeamTools(mcp, supabase);
registerSubmissionTools(mcp, supabase);
registerAwardTools(mcp, supabase);

// ── Express ───────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// Health check
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Active SSE transports keyed by session ID
const transports = new Map<string, SSEServerTransport>();

// SSE connection endpoint – clients open a long-lived GET connection here
app.get("/sse", async (_req: Request, res: Response) => {
  const transport = new SSEServerTransport("/messages", res);
  transports.set(transport.sessionId, transport);

  res.on("close", () => {
    transports.delete(transport.sessionId);
  });

  await mcp.connect(transport);
});

// Message endpoint – clients POST JSON-RPC messages here
app.post("/messages", async (req: Request, res: Response) => {
  const sessionId = req.query["sessionId"] as string | undefined;

  if (!sessionId) {
    res.status(400).json({ error: "Missing sessionId query parameter" });
    return;
  }

  const transport = transports.get(sessionId);

  if (!transport) {
    res.status(404).json({ error: `No active session for sessionId: ${sessionId}` });
    return;
  }

  await transport.handlePostMessage(req, res);
});

// ── Startup ───────────────────────────────────────────────────────────────────

const server = app.listen(PORT, () => {
  // Count registered tools via the internal tool registry
  const toolCount = (mcp as unknown as { _registeredTools: Record<string, unknown> })._registeredTools
    ? Object.keys((mcp as unknown as { _registeredTools: Record<string, unknown> })._registeredTools).length
    : "unknown";

  console.log(`[workato-hackathon-mcp] Listening on port ${PORT}`);
  console.log(`[workato-hackathon-mcp] Registered tools: ${toolCount}`);
  console.log(`[workato-hackathon-mcp] SSE endpoint:  GET  http://localhost:${PORT}/sse`);
  console.log(`[workato-hackathon-mcp] Message endpoint: POST http://localhost:${PORT}/messages`);
  console.log(`[workato-hackathon-mcp] Health endpoint:  GET  http://localhost:${PORT}/health`);
});

// ── Graceful Shutdown ─────────────────────────────────────────────────────────

process.on("SIGTERM", () => {
  console.log("[workato-hackathon-mcp] SIGTERM received – shutting down gracefully");
  server.close(() => {
    console.log("[workato-hackathon-mcp] HTTP server closed");
    process.exit(0);
  });
});
