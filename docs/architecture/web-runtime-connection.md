# Web runtime connection

**Status:** Initial single-user authenticated web client and server-side runtime bridge implemented. Multi-user identity and remote executor isolation remain future work.

## Server environment

The browser never receives the runtime bearer token. Configure these values only in the Next.js server environment:

| Variable | Required | Purpose |
|---|---|---|
| M1CRO_WEB_PASSWORD | Yes | Single-user password gate for the web workspace |
| M1CRO_WEB_SESSION_SECRET | Yes | Random secret, at least 32 characters, used to sign 8-hour HTTP-only sessions |
| M1CRO_RUNTIME_URL | Yes | Base URL of the separately running runtime host |
| M1CRO_RUNTIME_TOKEN | Yes | Bearer token accepted by that runtime host; at least 32 characters |

Generate secrets with a cryptographically secure generator, for example `openssl rand -hex 32`. Never commit secrets or prefix them with NEXT_PUBLIC_.

The web server exposes a same-origin BFF under /api/runtime. It checks the signed HTTP-only cookie, restricts paths to the versioned sessions API, forwards the runtime bearer token server-side, and streams SSE responses through to the browser. POST commands require same-origin requests and JSON bodies. Remote runtime URLs must use HTTPS in production.

## Local development

Run the runtime host in one terminal with M1CRO_RUNTIME_TOKEN, M1CRO_PROVIDER, and M1CRO_WORKSPACE_ROOT configured. Run the web app in another terminal with M1CRO_RUNTIME_URL pointing at the host, the same M1CRO_RUNTIME_TOKEN, M1CRO_WEB_PASSWORD and M1CRO_WEB_SESSION_SECRET. The default local runtime host binds to 127.0.0.1:8787 and the web app to localhost:3000.

## Security and deployment boundary

- The current password gate is single-user only. It is not an account system, organization identity provider, or multi-tenant authorization model.
- Use a strong password and secret. Add edge-level rate limiting / bot protection before exposing the login route publicly; the initial app does not yet have a distributed rate limiter.
- Keep M1CRO_RUNTIME_TOKEN server-side. The browser communicates only with the same-origin BFF.
- Deploy the runtime host as a separate Node service or trusted private runtime. The Vercel Next.js project builds the web frontend/BFF; it does not turn the runtime host package into a persistent Vercel process.
- For remote runtime hosting, bind the runtime behind a TLS reverse proxy, restrict inbound access to the web BFF/private network where possible, and replace the local single-user token authenticator with a real identity-aware gateway before multi-user use.
- The UI currently supports creating/selecting sessions, rendering persisted user/assistant/tool transcript messages, streaming text/tool events, approving/rejecting pending tool calls, cancelling a turn and reconnecting to event history. Projects are represented by a project identifier; project discovery and repository provisioning are not implemented yet.
