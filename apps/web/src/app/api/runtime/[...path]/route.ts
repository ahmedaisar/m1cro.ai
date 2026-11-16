import { isSameOriginRequest, requestHasSession } from "@/lib/auth";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ path: string[] }> };

function validPath(parts: string[]): boolean {
  if (parts.length === 2 && parts[0] === "v1" && (parts[1] === "sessions" || parts[1] === "projects")) return true;
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
  const base = process.env.M1CRO_RUNTIME_URL;
  const token = process.env.M1CRO_RUNTIME_TOKEN;
  if (!base || !token || token.length < 32) {
    return Response.json({ error: "Runtime connection is not configured on the server" }, { status: 503 });
  }
  let runtimeBase: URL;
  try { runtimeBase = new URL(base); } catch { return Response.json({ error: "Invalid runtime URL configuration" }, { status: 500 }); }
  if (runtimeBase.username || runtimeBase.password || runtimeBase.search || runtimeBase.hash) {
    return Response.json¶»§q«^