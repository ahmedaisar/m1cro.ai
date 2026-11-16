import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import WorkspaceClient from "@/components/workspace-client";

export default async function HomePage() {
  const jar = await cookies();
  if (!verifySessionToken(jar.get(SESSION_COOKIE)?.value)) redirect("/login");
  return <WorkspaceClient />;
}
