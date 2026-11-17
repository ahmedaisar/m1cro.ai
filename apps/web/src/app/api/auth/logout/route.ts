import { auth } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const url = new URL("/api/auth/sign-out", request.url);
  return auth.handler(new Request(url, { method: "POST", headers: request.headers }));
}
