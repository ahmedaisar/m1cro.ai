import { createSessionToken, isSameOriginRequest, passwordMatches, sessionCookie } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  if (!request.headers.get("origin") || !isSameOriginRequest(request)) return Response.json({ error: "Origin not allowed" }, { status: 403 });
  const password = process.env.M1CRO_WEB_PASSWORD;
  const secret = process.env.M1CRO_WEB_SESSION_SECRET;
  if (!password || !secret || secret.length < 32) {
    return Response.json({ error: "Web sign-in is not configured. Set M1CRO_WEB_PASSWORD and a 32+ character M1CRO_WEB_SESSION_SECRET." }, { status: 503 });
  }
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > 4096) return Response.json({ error: "Request too large" }, { status: 413 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid request" }, { status: 400 }); }
  if (!body || typeof body !== "object" || typeof (body as { password?: unknown }).password !== "string") {
    return Response.json({ error: "Password is required" }, { status: 400 });
  }
  if (!passwordMatches((body as { password: string }).password, password)) {
    return Response.json({ error: "Incorrect password" }, { status: 401 });
  }
  const token = createSessionToken();
  const secure = process.env.NODE_ENV === "production";
  return Response.json({ authenticated: true }, { headers: { "set-cookie": sessionCookie(token, secure), "cache-control": "no-store" } });
}
