import { isSameOriginRequest, requestHasSession } from "@/lib/auth";
import { ensureRuntime } from "@/lib/runtime-manager";

export const runtime = "nodejs";
export const maxDuration = 60;
type RouteContext = { params: Promise<{ path: string[] }> };

function validPath(parts: string[]): boolean {
  if (parts.length === 2 && parts[0] === "v1" && (parts[1] === "sessions" || parts[1] === "projects")) return true;
  if (parts.length === 3 && parts[0] === "v1" && parts[1] === "provider" && (parts[2] === "status" || parts[2] === "config" || parts[2] === "probe")) return true;
  if (parts.length === 3 && parts[0] === "v1" && parts[1] === "sessions" && /^[A-Za-z0-9_-]{1,80}$/.test(parts[2])) return true;
  return parts.length === 4
    && parts[0] === "v1"
    && parts[1] === "sessions"
    && /^[A-Za-z0-9_-]{1,80}$/.test(parts[2])
    && (parts[3] === "events" || parts[3] === "commands" || parts[3] === "history");
}
async function proxy(request: Request, context: RouteContext): Promise<Response> {
  if (!requestHasSession(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSameOriginRequest(request)) return Response.json({ error: "Origin not allowed" }, { status: 403 });
  const token = process.env.M1CRO_RUNTIME_TOKEN;
  if (!token || token.length < 32) {
    return Response.json({ error: "Runtime connection is not configured on the server" }, { status: 503 });
  }
  let runtimeBase: URL;
  try { runtimeBase = new URL(await ensureRuntime(request.headers.get("x-vercel-oidc-token"))); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Runtime unavailable" }, { status: 503 }); }
  if (runtimeBase.username || runtimeBase.password || runtimeBase.search || runtimeBase.hash) {
    return Response.json({ error: "Runtime URL must not contain credentials, query parameters or fragments" }, { status: 500 });
  }
  if (process.env.NODE_ENV === "production" && runtimeBase.protocol !== "https:") {
    return Response.json({ error: "Remote runtime connections must use HTTPS" }, { status: 500 });
  }
  const { path } = await context.params;
  if (!validPath(path)) return Response.json({ error: "Unsupported runtime route" }, { status: 404 });
  const upstreamUrl = new URL("/" + path.map(encodeURIComponent).join("/"), runtimeBase);
  upstreamUrl.search = new URL(request.url).search;
  const method = request.method;
  if (method !== "GET" && method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const headers = new Headers({ authorization: "Bearer " + token });
  if (method === "POST") {
    headers.set("content-type", "application/json");
    if (request.headers.get("content-type") !== "application/json") return Response.json({ error: "JSON commands only" }, { status: 415 });
  }
  const lastEventId = request.headers.get("last-event-id");
  if (lastEventId) headers.set("last-event-id", lastEventId);
  if (method === "GET" && path[path.length - 1] === "events") headers.set("accept", "text/event-stream");
  try {
    const upstream = await fetch(upstreamUrl, {
      method,
      headers,
      ...(method === "POST" ? { body: await request.text() } : {}),
      cache: "no-store",
      signal: request.signal,
    });
    const responseHeaders = new Headers();
    const contentType = upstream.headers.get("content-type");
    if (contentType) responseHeaders.set("content-type", contentType);
    responseHeaders.set("cache-control", path[path.length - 1] === "events" ? "no-cache, no-transform" : "no-store");
    responseHeaders.set("x-content-type-options", "nosniff");
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return Response.json({ error: "Runtime service unavailable" }, { status: 502 });
  }
}
export const GET = proxy;
export const POST = proxy;
