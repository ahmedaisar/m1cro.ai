# Runpod Serverless inference adapter

**Status:** Provider adapter, model discovery, runtime provider selection and encrypted workspace configuration implemented. Platform-managed gateway routing, metering and quotas remain future work.

## Endpoint contract

For Runpod Serverless vLLM endpoints, m1cro uses the OpenAI-compatible base URL:

```text
https://api.runpod.ai/v2/<ENDPOINT_ID>/openai/v1
```

The provider uses:

- `GET /models` for model discovery.
- `POST /chat/completions` for streaming chat completions.
- `Authorization: Bearer <RUNPOD_API_KEY>` for server-side authentication.

The adapter is built on the existing `OpenAICompatibleProvider`, so request serialization, SSE parsing, retry policy, tool-call assembly and model-ID preservation stay shared with other OpenAI-compatible providers.

## Workspace configuration

The workspace provider settings now include **Runpod Serverless**. Enter the exact deployed model ID, the endpoint URL in the format above, and your Runpod API key. The runtime validates that the URL uses the official `api.runpod.ai` host and expected endpoint path. Provider credentials are encrypted at rest by the existing AES-256-GCM provider configuration store; status responses never return the key.

For a server-managed default provider, configure the runtime environment:

- `M1CRO_PROVIDER=runpod`
- `M1CRO_RUNPOD_ENDPOINT_ID=<endpoint-id>`
- `RUNPOD_API_KEY=<server-side-secret>`
- `RUNPOD_MODEL_ID=<exact-deployed-model-id>` (or `M1CRO_MODEL`)

Keep the API key server-side. Do not add it to `NEXT_PUBLIC_*` variables or client code.

## Usage

```ts
import { RunpodServerlessProvider } from "@m1cro/providers";

const provider = new RunpodServerlessProvider({
  endpointId: process.env.RUNPOD_ENDPOINT_ID!,
  apiKey: process.env.RUNPOD_API_KEY!,
});

const models = await provider.discoverModels();
```

Do not prefix the endpoint ID with a URL or place the API key in browser code. Configure the key only in a trusted server/runtime environment.

## Current boundary

This change adds a tested provider adapter; it does not yet:
- Provision or manage Runpod endpoints.
- Configure a platform-owned key in the hosted runtime.
- Expose a user-facing hosted model picker.
- Record token usage or debit credits.
- Enforce subscription quotas or billing.
- Claim every model deployed on Runpod supports tool calling. Capability metadata remains unknown unless supplied by the provider.

## Next implementation steps

1. Wire the adapter into the server-side hosted inference gateway with endpoint/model allowlists.
2. Capture provider usage metadata and persist an idempotent usage ledger event.
3. Add per-user credit reservations and quota checks before inference.
4. Connect subscriptions and billing after plan limits and credit conversion rules are approved.
5. Add operational limits, provider timeout policy, queue/cold-start handling and failure reconciliation.
