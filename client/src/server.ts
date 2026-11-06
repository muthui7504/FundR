import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

type WorkerEnvironment = {
  API_ORIGIN?: string;
};

const DEFAULT_API_ORIGIN = "https://fundraise-api-pni1.onrender.com";
let serverEntryPromise: Promise<ServerEntry> | undefined;
let warnedAboutDefaultApiOrigin = false;

function getApiOrigin(env: unknown) {
  const configuredOrigin =
    env && typeof env === "object" && "API_ORIGIN" in env
      ? (env as WorkerEnvironment).API_ORIGIN?.trim()
      : undefined;
  const value = configuredOrigin || DEFAULT_API_ORIGIN;
  if (!configuredOrigin && !warnedAboutDefaultApiOrigin) {
    console.warn("API_ORIGIN is not set; using the configured Render API origin.");
    warnedAboutDefaultApiOrigin = true;
  }
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

async function proxyApiRequest(request: Request, env: unknown) {
  const apiOrigin = getApiOrigin(env);
  if (!apiOrigin)
    return Response.json(
      { message: "The API origin is not configured for this deployment." },
      { status: 503 },
    );
  const requestUrl = new URL(request.url);
  const target = new URL(`${requestUrl.pathname}${requestUrl.search}`, apiOrigin);
  const outbound = new Request(target, request);
  const canRetry =
    request.method === "GET" ||
    request.method === "HEAD" ||
    requestUrl.pathname === "/api/auth/login" ||
    requestUrl.pathname === "/api/auth/google";
  const attempts = canRetry ? 3 : 1;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(outbound.clone());
      if (
        attempt < attempts - 1 &&
        (response.status === 502 || response.status === 503 || response.status === 504)
      ) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
        continue;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("The API request could not be completed.");
}

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const { pathname } = new URL(request.url);
      if (pathname === "/api" || pathname.startsWith("/api/"))
        return await proxyApiRequest(request, env);
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
