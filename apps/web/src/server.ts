/**
 * HTTP entry — composition only (map §4 L1). Every pipeline step (error
 * normalising, request context, CSRF guard, rate-limit rules incl. the
 * auth-read/auth-mutation branches, /metrics, SLI flusher start, security
 * headers/CSP nonce) is a named, composable function in
 * @ats/platform-http/server; this file wires the app-owned pieces (the
 * TanStack SSR server entry, the error page, the hosted agent/workflow API
 * dispatch) and calls the steps in the same order as before the extraction:
 * error capture → request context → CSRF guard → rate limit → /metrics →
 * metrics/SLI → security headers/CSP. The second CSRF layer stays in
 * src/start.ts (map §6 — keep both).
 */
import "./boot";
import "./lib/error-capture";

import {
  contextFromHeaders,
  requestStarted,
  routeGroup,
  withRequestContext,
} from "@ats/observability/server";
import {
  csrfGuard,
  ensureSliFlusher,
  finishRequest,
  rateLimitedDispatch,
  requestUrl,
  type PipelineApp,
  type ServerFetchHandler,
} from "@ats/platform-http/server";

import { renderErrorPage } from "./lib/error-page";
import { agentApiResponse } from "./server/agent-api.server";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

const app: PipelineApp = {
  loadServerEntry: getServerEntry,
  renderErrorPage,
  handleAgentApi: agentApiResponse,
};

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const started = performance.now();
    const trace = contextFromHeaders(request.headers);
    const url = requestUrl(request);
    if (!url) return new Response("Bad request", { status: 400 });
    const group = routeGroup(url.pathname);
    ensureSliFlusher();
    requestStarted();

    return withRequestContext(trace, async () => {
      const csrf = request.method !== "OPTIONS" ? csrfGuard(request, url.pathname) : null;
      const response = csrf ?? (await rateLimitedDispatch(request, url, group, env, ctx, app));
      return finishRequest(response, { started, request, url, group, trace });
    });
  },
};
