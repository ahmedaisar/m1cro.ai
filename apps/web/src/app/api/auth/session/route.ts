import { requestHasSession } from "@/lib/auth";

export async function GET(request: Request): Promise<Response> {
  return Response.json({ authenticated: requestHasSession(request) }, { headers: { "cache-control": "no-store" } });
}
