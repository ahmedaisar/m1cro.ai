# Runtime project registry and workspace provisioning

## Trust boundary

The browser submits a registered `projectId` only. It never supplies a workspace path. The runtime resolves the project record after authenticating the bearer token and verifies that the authenticated principal owns the project before creating a session or running tools.

## Storage

- `M1CRO_DATA_DIR/projects.jsonl` is the append-only project metadata registry.
- `M1CRO_PROJECTS_DIR` contains generated project workspace directories; it defaults to `${M1CRO_DATA_DIR}/projects`.
- Each created project gets a random ID and a private `0700` directory. Registry files are private (`0600`).
- The `default` project is seeded from the operator-configured `M1CRO_WORKSPACE_ROOT` and is not created from a client-provided path.

## API

- `GET /v1/projects` lists projects owned by the authenticated principal.
- `POST /v1/projects` accepts `{ "name": "..." }` and creates a project directory beneath the configured projects root.
- `POST /v1/sessions` accepts a registered `projectId`; unregistered or non-owned projects are rejected.

## Filesystem safety

Project names are restricted to a conservative character set. Workspace paths are generated from random IDs, resolved on the server, and checked against the real projects-root path. The registry rejects symbolic-link roots and project directories whose resolved path escapes the configured root. The web BFF allowlists the project endpoints and retains the runtime bearer token server-side.

## Operational note

The JSONL registry is appropriate for the current single-runtime, single-writer deployment. A horizontally scaled multi-user service should move project/session metadata to a transactional database and use isolated per-project execution sandboxes before public multi-tenant exposure.
