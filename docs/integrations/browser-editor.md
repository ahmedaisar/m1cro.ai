# Browser and editor integration foundation

**Status:** Canonical browser session deep links implemented. Native editor adapters and browser extensions remain future work.

## Session URL contract

A session is addressable through the workspace URL using the stable `session` query parameter:

```text
https://app.m1cro.ai/?session=<opaque-session-id>
```

The same parameter is used by the shared protocol helpers:

- `createSessionDeepLink(baseUrl, sessionId)` creates a canonical link.
- `readSessionDeepLink(url)` extracts the session ID or returns `null`.
- `RUNTIME_SESSION_QUERY_PARAM` names the stable query parameter.

The workspace restores the requested session after loading the authenticated user's session list, updates the URL when switching sessions, supports browser back/forward navigation, and exposes a copy-link action.

## Security contract

- A session URL is a locator, **not an authorization credential**.
- Opening a link still requires a valid Better Auth session.
- The server-side BFF and runtime enforce session ownership; possession of an ID does not grant access.
- Never place runtime bearer tokens, provider API keys, cookies or signed credentials in a URL.
- Editor/browser clients should open the workspace URL through the user's normal browser session rather than attempting to call the runtime host directly.

## Runtime client contract

Future first-party clients should reuse the versioned `m1cro.runtime` protocol and existing same-origin BFF boundary:

- Session metadata and history are fetched through authenticated workspace APIs.
- Live events use the sequenced Server-Sent Events envelope.
- Commands use the typed `RuntimeCommand` union.
- Approval and cancellation remain explicit user actions.
- Clients must handle reconnect/replay and deduplicate by per-session sequence.

The web BFF is the browser-facing transport. The runtime bearer token remains server-side and is never distributed to browser extensions or editor plugins.

## Planned follow-on work

1. VS Code extension: authenticate by opening the workspace in the browser, then attach through a short-lived, narrowly scoped handoff; do not reuse the runtime bearer token.
2. Browser extension: open the active workspace/session and provide contextual navigation without injecting credentials into page content.
3. Desktop deep-link registration and session handoff.
4. Remote attach/reconnect tests across browser refresh, multiple tabs and interrupted streams.

These adapters should remain thin clients. They must not implement a second agent loop or bypass the shared runtime protocol.
