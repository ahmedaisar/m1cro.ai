import { auth } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return auth.handler(new Request(new URL("/api/auth/sign-out", request.url), {
    method: "POST",
    headers: request.headers,
  }));
}
