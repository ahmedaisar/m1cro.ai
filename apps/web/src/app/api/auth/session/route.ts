import { getRequestUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await getRequestUser(request.headers);
    return Response.json(
      { authenticated: Boolean(user), user },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json(
      { authenticated: false, user: null, error: "Authentication service is unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
