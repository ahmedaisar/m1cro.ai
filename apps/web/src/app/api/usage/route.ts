import { requestSessionIdentity } from "@/lib/auth";
import { getMonthlyUsageSummary } from "@/lib/usage";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const identity = await requestSessionIdentity(request);
  if (!identity) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const usage = await getMonthlyUsageSummary(identity.id);
    return Response.json(usage, {
      headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
    });
  } catch {
    return Response.json({ error: "Usage summary is temporarily unavailable" }, { status: 503 });
  }
}
