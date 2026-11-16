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
