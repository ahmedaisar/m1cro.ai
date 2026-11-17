import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { createHmac } from "node:crypto";
import { db } from "@/db";
import * as schema from "@/db/schema";

function requiredSecret(): string {
  const value = process.env.BETTER_AUTH_SECRET;
  if (!value || Buffer.byteLength(value, "utf8") < 32) {
    // Local development may use an ephemeral secret, but production/preview must fail closed.
    if (process.env.NODE_ENV === "production") {
      throw new Error("BETTER_AUTH_SECRET must be configured with at least 32 bytes");
    }
    throw new Error("BETTER_AUTH_SECRET must be configured with at least 32 bytes");
  }
  return value;
}

const authSecret = requiredSecret();
const configuredBaseURL = process.env.BETTER_AUTH_URL || undefined;

export const auth = betterAuth({
  appName: "m1cro.ai",
  ...(configuredBaseURL ? { baseURL: configuredBaseURL } : {}),
  secret: authSecret,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      organization: schema.organization,
      member: schema.member,
      invitation: schema.invitation,
    },
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
  },
  plugins: [organization(), nextCookies()],
  trustedOrigins: [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.BETTER_AUTH_URL,
    "https://*.vercel.app",
    "http://localhost:3000",
  ].filter((value): value is string => Boolean(value)),
  advanced: {
    cookiePrefix: "m1cro",
    useSecureCookies: process.env.NODE_ENV === "production",
  },
});

export interface AuthenticatedUser {
  id: string;
  email: string;
}

export async function getRequestUser(headers: Headers): Promise<AuthenticatedUser | null> {
  const result = await auth.api.getSession({ headers });
  if (!result?.user?.id || !result.user.email) return null;
  return { id: result.user.id, email: result.user.email };
}

export async function requestSessionIdentity(request: Request): Promise<AuthenticatedUser | null> {
  return getRequestUser(request.headers);
}

export function signRuntimePrincipal(principalId: string, runtimeToken: string): string {
  return createHmac("sha256", runtimeToken)
    .update("m1cro-principal:" + principalId)
    .digest("base64url");
}

export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    const requestUrl = new URL(request.url);
    return parsed.origin === requestUrl.origin;
  } catch {
    return false;
  }
}
