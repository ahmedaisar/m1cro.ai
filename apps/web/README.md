# m1cro.ai Web Workspace

The first web client shell is a standalone Next.js App Router application. It is intentionally a presentation foundation: project/session cards are sample UI data, and the runtime status remains offline until the session bridge is implemented.

## Local development

From the repository root:

```bash
npm --prefix apps/web ci
npm --prefix apps/web run dev
```

Production build:

```bash
npm --prefix apps/web ci
npm --prefix apps/web run build
```

## Vercel project settings

Create a Vercel project connected to this repository with:

- **Root Directory:** `apps/web`
- **Framework Preset:** Next.js
- **Install Command:** `npm ci`
- **Build Command:** `npm run build`
- **Node.js:** 22.x

The web app is deliberately kept outside the root pnpm workspace so its Vercel deployment can use an isolated npm lockfile without changing the fast CLI/runtime dependency graph.

## Next integration milestone

Connect authenticated project/session APIs to the shared versioned runtime protocol. The web app must attach to the same runtime used by the CLI; it must not implement a second agent loop. Do not expose local filesystem or process execution through public Next.js routes. Remote execution requires the isolated sandbox lifecycle and explicit authorization model.
