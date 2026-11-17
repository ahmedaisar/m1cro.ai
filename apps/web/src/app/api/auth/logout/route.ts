import { clearedSessionCookie, isSameOriginRequest } from "@/lib/auth";

export async function POST(request: Request): Promise<Response> {
  if (!request.headers.get("origin") || !isSameOriginRequest(request)) return Response.json({ error: "Origin not allowed" }, { status: 403 });
  const secure = process.env.NODE_ENV === "production";
  return Response.json({ authenticated: false }, { headers: { "set-cookie": clearedSessionCookie(secure), "cache-control": "no-store" } });
}
