# Runtime lifecycle and provider configuration

## Runtime lifecycle

The web BFF manages the named `m1cro-runtime` Vercel Sandbox using the `@vercel/sandbox` SDK and a short-lived Vercel OIDC token. The runtime is demand-started:

1. The BFF checks the configured runtime health endpoint.
2. If healthy, it proxies the request without waking the sandbox.
3. If unavailable, it retrieves the named persistent sandbox, resumes it from its latest snapshot when stopped, and starts the runtime process if its health endpoint is not listening.
4. The BFF waits for the protocol health check before forwarding the original request.

The sandbox's filesystem and private JSONL stores are retained by Vercel persistent snapshots. The sandbox still has a finite execution timeout and may stop when idle; automatic resume is not the same as an always-on service. Runtime wake-up is serialized within a warm web function instance and uses health checks to avoid duplicate starts. A transactional distributed lease is still required before horizontally scaling this manager across many web instances.

## Provider configuration

The workspace supports OpenAI-compatible, Anthropic, and Ollama providers. The authenticated web BFF forwards provider settings to the runtime; the browser does not receive the runtime bearer token.

- Provider API keys are accepted only by the authenticated provider configuration endpoint.
- The runtime encrypts the provider configuration with AES-256-GCM before writing `M1CRO_DATA_DIR/provider-config.json.enc`.
- `M1CRO_PROVIDER_CONFIG_KEY` is a 32-byte key represented as 64 hex characters. Store it as a Vercel Sensitive environment variable and pass it only to the runtime process at startup.
- The encrypted file is created with private permissions. The encryption key and plaintext API key are never returned by provider status.
- Provider configuration changes apply to newly created agent sessions. Existing agents keep the provider instance they were created with.
- If no API key is configured for an authenticated provider, the runtime still starts and reports the missing credential rather than failing its entire health check.

The provider status endpoint reports provider, model, endpoint, whether authentication is required, and whether a credential is configured. It does not claim provider connectivity has been tested. Actual inference still requires a valid provider key and a reachable endpoint.

## Operational limits

Vercel Sandbox is a resumable execution environment, not a continuously running managed service. For production use with concurrent users, move runtime lifecycle coordination to a durable control plane with distributed leases, durable session/project storage, and an isolated execution environment per trust boundary. The current JSONL registry remains single-writer.


**Required Vercel setting:** enable Secure Backend Access with OIDC Federation under Project Settings → Security for the m1cro.ai project. The runtime manager expects the team issuer mode.


## Runtime start coordination and provider verification

Runtime wake-up now uses an atomic directory lease inside the named sandbox before starting the detached runtime process. Concurrent Vercel Function instances that resume the same sandbox wait for the first starter and reuse the healthy process instead of launching duplicate runtime hosts. A stale lease can be reclaimed after its bounded age.

The authenticated `POST /v1/provider/probe` endpoint performs a short, one-message inference against the saved provider configuration. The workspace exposes this as **Test saved connection**. The response contains only success/failure, model identifier, latency, and a safe error code/status; it never returns the provider credential or raw provider response. The probe consumes a small amount of model usage.


## Multi-user identity boundary

The web workspace accepts environment-managed accounts through the web project's Sensitive `M1CRO_USERS_JSON` variable, an array of `{ id, email, passwordHash }` records. Generate each password hash with Node.js: `node -e 'const {scryptSync,randomBytes}=require("node:crypto");const salt=randomBytes(16);console.log("scrypt$"+salt.toString("base64url")+"$"+scryptSync(process.argv[1],salt,64).toString("base64url"))' 'YOUR_PASSWORD'`. Store only the resulting hash in the JSON; never put plaintext passwords in this variable. IDs must be stable URL-safe identifiers. The BFF passes only the multi-user-enabled flag—not the account directory or password hashes—to the runtime sandbox. The web session cookie carries a signed, expiring subject and email. The BFF signs the subject with the runtime bearer secret before forwarding it; the runtime verifies that signature and uses the subject as the project/session owner. Browser-supplied principal headers are never forwarded.

When managed accounts are configured, the BFF sets `M1CRO_MULTI_USER_ENABLED=1` on runtime startup, so the shared default workspace is not provisioned. Each user creates their own registered project, and project/session access checks use that user's stable ID. Existing single-user `M1CRO_WEB_PASSWORD` deployments remain supported as a compatibility fallback. The multi-user mode is activated on the next runtime process start; resume/restart the named sandbox after changing the account configuration. This is an application identity and filesystem workspace boundary, not a kernel-level sandbox: all users still share one runtime process and OS account. Do not expose it to mutually untrusted users until per-user execution isolation and an external identity provider are implemented.
