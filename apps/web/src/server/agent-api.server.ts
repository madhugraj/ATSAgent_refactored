/**
 * Hosted agent + workflow API dispatch (map §4 L1): extracted from
 * src/server.ts so the composition stays pure — this part imports the
 * agents' code, which stays in the app, while the rate-limit rules it
 * enforces come from @ats/platform-http/server.
 *
 * Hosted agent API and MCP (Agent studio): authenticated by platform-issued
 * keys, limited per caller per path and, tighter, per key.
 */
import { log } from "@ats/observability/server";
import {
  AGENT_API_KEY_LIMIT,
  allowRequest,
  isWorkflowApiPath,
  tooManyRequests,
} from "@ats/platform-http/server";

async function workflowApiResponse(request: Request, url: URL): Promise<Response> {
  const api = await import("./agents/workflow-app.server");
  const { bearerKey } = await import("./agents/hosted-api.server");
  const key = bearerKey(request);
  if (!key) return api.workflowUnauthorized();
  if (
    !(await allowRequest(
      `workflow-key:${api.hashWorkflowKey(key)}`,
      Date.now(),
      AGENT_API_KEY_LIMIT,
    ))
  )
    return tooManyRequests();
  try {
    const resolved = await api.resolveWorkflowKey(key);
    if (!resolved) return api.workflowUnauthorized();
    return await api.handleWorkflowApi(request, url, resolved);
  } catch (error) {
    log.error("workflow_api.unhandled", { error: error instanceof Error ? error : String(error) });
    return new Response(JSON.stringify({ error: "Internal error." }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

export async function agentApiResponse(request: Request, url: URL): Promise<Response> {
  if (isWorkflowApiPath(url.pathname)) return workflowApiResponse(request, url);
  const api = await import("./agents/hosted-api.server");
  const key = api.bearerKey(request);
  if (!key) return api.unauthorized();
  const { hashKey } = await import("./agents/blueprints.server");
  if (!(await allowRequest(`agent-key:${hashKey(key)}`, Date.now(), AGENT_API_KEY_LIMIT)))
    return tooManyRequests();
  try {
    return url.pathname === "/api/mcp"
      ? await api.handleMcp(request)
      : await api.handleAgentApi(request, url);
  } catch (error) {
    log.error("agent_api.unhandled", { error: error instanceof Error ? error : String(error) });
    return new Response(JSON.stringify({ error: "Internal error." }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
