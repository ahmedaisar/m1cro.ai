import { authenticateUser, createSessionToken, isSameOriginRequest, sessionCookie } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  if (!request.headers.get("origin") || !isSameOriginRequest(request)) return Response.json({ error: "Origin not allowed" }, { status: 403 });
  const secret = process.env.M1CRO_WEB_SESSION_SECRET;
  if (!secret || secret.length < 32 || (!process.env.M1CRO_USERS_JSON && !process.env.M1CRO_WEB_PASSWORD)) {
    return Response.json({ error: "Web sign-in is not configured. Set M1CRO_WEB_SESSION_SECRET and either M1CRO_USERS_JSON or the legacy M1CRO_WEB_PASSWORD." }, { status: 503 });
  }
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > 4096) return Response.json({ error: "Request too large" }, { status: 413 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid request" }, { status: 400 }); }
  if (!body || typeof body !== "object" || typeof (body as { password?: unknown }).password !== "string") {
    return Response.json({ error: "Email and password are required" }, { status: 400 });
  }
  const input = body as { email?: unknown; password: string };
  const email = typeof input.email === "string" ? input.email : "owner@local";
  let user;
  try { user = authenticateUser(email, input.password); }
  catch { return Response.json({ error: "Sign-in configuration is invalid" }, { status: 503 }); }
  if (!user) return Response.json({ error: "Invalid email or password" }, { status: 401 });
  const token = createSessionToken(user);
  const secure = process.env.NODE_ENV === "production";
  return Response.json({ authenticated: true, user }, { headers: { "set-cookie": sessionCookie(token, secure), "cache-control": "no-store" } });
}
