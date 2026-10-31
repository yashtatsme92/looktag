# Deploy previews

Production stays on Render. Render runs `npm run build` and `npm start` (`node .output/server/index.mjs`). It does not read `netlify.toml`, and this setup adds no env vars Render has to set.

Pull requests can deploy to Netlify Free. Each open PR gets a Neon branch in a **separate** Neon project. Do not point `NEON_PROJECT_ID` at the production database.

## One-time setup

1. Create a free Neon project in the region you want for previews. Free projects allow **10 branches**. The workflow deletes `preview/pr-<n>` when the PR closes. If a deploy is skipped because the cap is full, close old PRs or delete leftover branches in the Neon console.
2. Create a Netlify site from this repo. Plan: Free.
3. Set the site's **production branch** to an unused branch, for example `netlify-prod-unused`. Netlify must not deploy `main`. Production remains Render.
4. Build settings come from `netlify.toml`: command `npm run build:preview`, publish directory `dist` (Nitro's Netlify preset writes functions under `.netlify/functions-internal` and static files to `dist`), Node 22.
5. GitHub Actions secrets, repository settings, not the git tree:
   - `NEON_API_KEY`
   - `NEON_PROJECT_ID` (the preview project, not production)
   - `NETLIFY_AUTH_TOKEN`
   - `NETLIFY_SITE_ID`
   Optional repository variable: `NEON_DATABASE_USERNAME`. The workflow defaults to `neondb_owner`, which is the role Neon Free creates. `create-branch-action` requires a role that already exists on the project.
6. On the Netlify site, set `BETTER_AUTH_SECRET` (a long random value). Previews have no fixed `BETTER_AUTH_URL`. The server uses `DEPLOY_PRIME_URL` (or `DEPLOY_URL`) when `NETLIFY=true` and `CONTEXT` is `deploy-preview` or `branch-deploy`. A set `BETTER_AUTH_URL` always wins, which is how Render stays unchanged.
7. Optional: `PREVIEW_TRUSTED_HOSTS`, a comma-separated host list such as `*--looktag-previews.netlify.app`. A bare `*` is rejected.

Forks do not receive these secrets. The workflow logs that and skips.

## What a preview deploy does

`.github/workflows/neon-preview-branch.yml` runs on PR opened, synchronize, reopened, and closed.

- Open or update: `neondatabase/create-branch-action` creates or reuses `preview/pr-<n>`, then `netlify deploy --alias pr-<n> --context deploy-preview --build` with that branch's **pooled** `DATABASE_URL`. `npm run build:preview` is `vite build` (preset follows `NETLIFY=true`) and then `npm run db:migrate`.
- After the deploy, `npm run db:seed` runs only because `APP_ENV=preview`. The seed script refuses `RENDER=true` and `APP_ENV=production`.
- Close: `neondatabase/delete-branch-action` deletes `preview/pr-<n>`.

## Sign-in

Deploy-preview and branch-deploy contexts set `APP_ENV=preview` and `VITE_AUTH_ENABLED=true`. Google, Apple, and the Grok auth broker are not registered. Email and password still create a real session (`authConfigured` stays on). The login screen hides the other buttons through the method gate, and the server rejects those methods even if Studio settings still have them on.

## Files

Netlify functions have no durable disk. `STORAGE_PROVIDER` defaults to `local`, and on `APP_ENV=preview` every local read or write throws. Set `STORAGE_PROVIDER=s3` or `STORAGE_PROVIDER=r2` on the Netlify site if a preview must store objects. Photos in this release still live in Postgres, so a preview can boot without object storage.

## Cost

Netlify Free includes a hard cap of 300 credits per month. Deploy previews are 0 credits per deploy. Neon Free covers the preview branches within the 10-branch cap. Render's bill and build do not change.

## Local check

```sh
npm run build
NETLIFY=true npx vite build
```

The first command still writes `.output/server/index.mjs`. The second writes the Netlify output and does not require the PGLite wasm copy.
