import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "m1cro_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;
function secret(): string | null {
  const value = process.env.M1CRO_WEB_SESSION_SECRET;
  return value && value.length >= 32 ? value : null;
}
function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left), b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
function sign(payload: string): string {
  const key = secret();
  if (!key) throw new Error("M1CRO_WEB_SESSION_SECRET must contain at least 32 characters");
  return createHmac("sha256", key).update(payload).digest("base64url");
}
export function createSessionToken(): string {
  const payload = Buffer.from(JSON.stringify({ version: 1, issuedAt: Date.now() })).toString("base64url");
  return payload + "." + sign(payload);
}
export function verifySessionToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
  let expected: string;
  try { expected = sign(parts[0]); } catch { return false; }
  if (!safeEqual(parts[1], expected)) return false;
  try {
    const value = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as { version?: unknown; issuedAt?: unknown };
    if (value.version !== 1 || typeof value.issuedAt !== "number") return false;
    const age = Date.now() - value.issuedAt;
    return age >= -60_000 && age <= SESSION_MAX_AGE_SECONDS * 1000;
  } catch { return false; }
}
export function requestHasSession(request: Request): boolean {
  const header = request.headers.get("cookie") ?? "";
  const token = header.split(";").map(value => value.trim()).find(value => value.startsWith(SESSION_COOKIE + "="))?.slice(SESSION_COOKIE.length + 1);
  return verifySessionToken(token ?? null);
}
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    const protocol = (request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "")).split(",")[0].trim();
    return !!host && parsed.host === host && parsed.protocol === protocol + ":";
  } catch { return false; }
}
export function sessionCookie(token: string, secure: boolean): string {
  return SESSION_COOKIE + "=" + encodeURIComponent(token) + "; HttpOnly; SameSite=Strict; Path=/; Max-Age=" + SESSION_MAX_AGE_SECONDS + (secure ? "; Secure" : "");
}
export function clearedSessionCookie(secure: boolean): string {
  return SESSION_COOKIE + "=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0" + (secure ? "; Secure" : "");
}
export function passwordMatches(candidate: string, expected: string): boolean { return safeEqual(candidate, expected); }
