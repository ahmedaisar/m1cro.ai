# m1cro.ai Platform Stack

## Decisions

- Application hosting and control plane: Vercel + Next.js App Router.
- Authentication: Better Auth, with email/password and the organization plugin enabled.
- Database: PostgreSQL via Neon (Vercel Marketplace) using Drizzle ORM and the postgres driver.
- Execution: Vercel Sandbox. A project execution environment is a separate VM boundary; the control plane remains responsible for ownership and authorization.
- Artifacts: Private Vercel Blob store (m1cro-artifacts).
- AI providers: Model/provider independent. Provider credentials remain encrypted and are never passed as ambient environment variables to untrusted project code.

## Data ownership

Postgres is the source of truth for users, sessions, organizations, memberships, projects, execution metadata, provider connections, usage and audit events. Sandbox filesystems are working environments, not the canonical database. Blob stores durable artifacts and exports.

The initial Drizzle schema includes Better Auth user/session/account/verification tables, organization/member/invitation tables, and m1cro project/runtime/provider/audit/usage tables.

## Required Vercel environment variables

- DATABASE_URL: Neon pooled PostgreSQL URL (required before enabling sign-in).
- BETTER_AUTH_SECRET: unique random secret, at least 32 bytes.
- BETTER_AUTH_URL: canonical deployment URL.
- NEXT_PUBLIC_APP_URL: canonical application URL.
- BLOB_READ_WRITE_TOKEN: private Vercel Blob token (Vercel-managed when the store is connected).

M1CRO_USERS_JSON and M1CRO_WEB_PASSWORD are legacy custom-auth settings. Better Auth does not read them. Do not remove the old variables until the new database has been provisioned, the schema migrated, a Better Auth account has been created and verified, and the new preview has passed end-to-end checks.

## Database setup

1. Install Neon from the Vercel Marketplace and connect it to the m1cro.ai project.
2. Ensure DATABASE_URL is available in Preview, Production and Development (use pooled connection string).
3. Run pnpm --dir apps/web exec drizzle-kit migrate from the repository root, or deploy the generated SQL migration through the database's migration workflow.
4. Redeploy the preview and verify sign-up, sign-in, sign-out and owner-scoped project access.

## Migration safety

The existing custom auth stores password hashes in M1CRO_USERS_JSON; those hashes are not imported into Better Auth automatically. Existing users must create a Better Auth account or complete a separately designed account migration. Do not silently delete the legacy credentials before the new sign-in path is verified.

## Execution isolation

The current project registry and runtime history still have JSONL-backed compatibility paths. The database tables establish the durable target schema; migration of all runtime/project records and per-project Sandbox provisioning must be completed and verified before claiming the whole product is database-backed or fully tenant-isolated.

The web project explicitly uses npm install from its apps/web project root. This keeps the Vercel deployment independent of the root workspace's CLI/runtime package dependency graph.
