import { requestSessionIdentity } from "@/lib/auth";

export async function GET(request: Request): Promise<Response> {
  const user = requestSessionIdentity(request);
  return Response.json({ authenticated: user !== null, ...(user ? { user } : {}) }, { headers: { "cache-control": "no-store" } });
}
