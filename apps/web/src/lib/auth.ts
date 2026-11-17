import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "m1cro_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;
export interface AuthenticatedUser { id: string; email: string; }
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
function validIdentity(value: unknown): value is AuthenticatedUser {
  if (!value || typeof value !== "object") return false;
  const user = value as Record<string, unknown>;
  return typeof user.id === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(user.id)
    && typeof user.email === "string" && user.email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email);
}
function parseUsers(): Array<{ id: string; email: string; passwordHash: string }> {
  const raw = process.env.M1CRO_USERS_JSON;
  if (!raw) return [];
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error("M1CRO_USERS_JSON must be valid JSON"); }
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) throw new Error("M1CRO_USERS_JSON must contain 1-100 users");
  const seen = new Set<string>();
  return value.map(item => {
    if (!item || typeof item !== "object") throw new Error("Invalid user entry in M1CRO_USERS_JSON");
    const user = item as Record<string, unknown>;
    const identity = { id: user.id, email: typeof user.email === "string" ? user.email.trim().toLowerCase() : "" };
    if (!validIdentity(identity) || typeof user.passwordHash !== "string" || !/^scrypt\$[A-Za-z0-9_-]{16,64}\$[A-Za-z0-9_-]{80,100}$/.test(user.passwordHash)) {
      throw new Error("Each configured user needs a safe id, valid email and scrypt passwordHash");
    }
    if (seen.has(identity.id) || seen.has(identity.email)) throw new Error("Duplicate user id or email in M1CRO_USERS_JSON");
    seen.add(identity.id); seen.add(identity.email);
    return { ...identity, passwordHash: user.passwordHash };
  });
}
function verifyPassword(candidate: string, encoded: string): boolean {
  const [, salt, expected] = encoded.split("$");
  if (!salt || !expected || candidate.length > 1024) return false;
  try {
    const actual = scryptSync(candidate, Buffer.from(salt, "base64url"), 64).toString("base64url");
    return safeEqual(actual, expected);
  } catch { return false; }
}
export function authenticateUser(email: string, password: string): AuthenticatedUser | null {
  const normalized = email.trim().toLowerCase();
  if (password.length > 1024 || !normalized || normalized.length > 254) return null;
  const users = parseUsers();
  if (users.length) {
    const user = users.find(item => item.email === normalized);
    return user && verifyPassword(password, user.passwordHash) ? { id: user.id, email: user.email } : null;
  }
  const legacyPassword = process.env.M1CRO_WEB_PASSWORD;
  if (legacyPassword && safeEqual(password, legacyPassword)) {
    return { id: "local-user", email: normalized || "owner@local" };
  }
  return null;
}
export function createSessionToken(user: AuthenticatedUser = { id: "local-user", email: "owner@local" }): string {
  if (!validIdentity(user)) throw new Error("Invalid session identity");
  const payload = Buffer.from(JSON.stringify({ version: 2, issuedAt: Date.now(), sub: user.id, email: user.email })).toString("base64url");
  return payload + "." + sign(payload);
}
export function getSessionIdentity(token: string | undefined | null): AuthenticatedUser | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  let expected: string;
  try { expected = sign(parts[0]); } catch { return null; }
  if (!safeEqual(parts[1], expected)) return null;
  try {
    const value = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as { version?: unknown; issuedAt?: unknown; sub?: unknown; email?: unknown };
    if (![1, 2].includes(Number(value.version)) || typeof value.issuedAt !== "number") return null;
    const age = Date.now() - value.issuedAt;
    if (age < -60_000 || age > SESSION_MAX_AGE_SECONDS * 1000) return null;
    if (value.version === 1) return { id: "local-user", email: "owner@local" };
    const user = { id: value.sub, email: value.email };
    return validIdentity(user) ? user : null;
  } catch { return null; }
}
function cookieToken(request: Request): string | null {
  const header = request.headers.get("cookie") ?? "";
  return header.split(";").map(value => value.trim()).find(value => value.startsWith(SESSION_COOKIE + "="))?.slice(SESSION_COOKIE.length + 1) ?? null;
}
export function requestHasSession(request: Request): boolean { return getSessionIdentity(cookieToken(request)) !== null; }
export function requestSessionIdentity(request: Request): AuthenticatedUser | null { return getSessionIdentity(cookieToken(request)); }
export function signRuntimePrincipal(principalId: string, runtimeToken: string): string {
  return createHmac("sha256", runtimeToken).update("m1cro-principal:" + principalId).digest("base64url");
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
