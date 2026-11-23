# Usage metering foundation

**Status:** Append-only inference usage records, authenticated monthly summary and runtime-stream capture are implemented for OpenAI-compatible providers (including Runpod). Credit conversion, quotas and billing are intentionally not enabled yet.

## Ledger contract

The existing `usage_records` table stores one row per metric. Inference usage is recorded as:

- `inference.requests`
- `inference.input_tokens`
- `inference.output_tokens`

Each row stores the owner, optional organization/project, quantity, and non-secret metadata containing the request ID, provider and model.

Rows use a deterministic SHA-256 primary key derived from owner ID, request ID and metric. Retrying the same usage write therefore cannot count the same metric twice; inserts use `ON CONFLICT DO NOTHING`.

Usage values must be non-negative safe integers. Provider/model IDs and request IDs are required. API keys, prompts, completions and other content are never written to usage metadata.

## API

`GET /api/usage` requires an authenticated Better Auth session and returns the current UTC calendar month's totals for the signed-in user only.

Example response:

```json
{
  "periodStart": "2026-11-01T00:00:00.000Z",
  "periodEnd": "2026-12-01T00:00:00.000Z",
  "metrics": {
    "requests": 0,
    "inputTokens": 0,
    "outputTokens": 0
  }
}
```

Responses are private and use `Cache-Control: no-store`. The endpoint does not accept an owner ID from the caller.

## Important release boundary

- The ledger writer is a server-side primitive for the hosted inference gateway; no client can write usage directly.
- The authenticated web BFF consumes internal `usage.report` frames from the runtime event stream and records them for the signed-in owner. Usage frames are removed from the public stream after a successful write; failed writes are passed through for diagnosis and do not interrupt generation.
- OpenAI-compatible streaming requests ask for `stream_options.include_usage`; only provider-reported `prompt_tokens` and `completion_tokens` are recorded. If a provider omits authoritative usage, no token count is guessed.
- Usage events carry a stable per-turn/per-tool-round request ID. Replayed SSE events and retried writes are safe because the ledger primary key is deterministic.
- No credits are calculated. Token-to-credit conversion must be approved as a product/pricing decision.
- No quota is enforced, and no subscription or Stripe state is inferred.
- The seven existing Drizzle migrations, including creation of `usage_records`, must be applied and verified before this endpoint can work against the shared Neon database.

## Next steps

1. Add authoritative usage extraction for Anthropic and Ollama adapters where their provider responses expose reliable counts.
2. Add reconciliation/alerting for ledger write failures and interrupted streams before enabling paid usage.
3. Approve credit conversion and plan limits.
4. Add transactional credit reservations and quota enforcement before starting paid inference.
5. Integrate Stripe subscription lifecycle and a usage dashboard.
