# Deploy previews

Production stays on Render. Render runs `npm run build` and `npm start` (`node .output/server/index.mjs`). It does not read `netlify.toml`, and this setup adds no env vars Render has to set. A Render build does not set `APP_ENV=preview`, so nothing from that build is baked into the server.

Pull requests can deploy to Netlify Free. Each open PR gets a Neon branch in a **separate** Neon project. Do not point `NEON_PROJECT_ID` at the production database.

## One-time setup

1. Create a free Neon project in the region you want for previews. Free projects allow **10 branches**. The workflow deletes `preview/pr-<n>` when the PR closes. If a deploy is skipped because the cap is full, close old PRs or delete leftover branches in the Neon console.
2. Create a Netlify site **without continuous deployment** (deploy manually, or link the repo and then stop automatic builds). Plan: Free. The GitHub Action is the only deployer. A Git-triggered build would not have that PR's Neon URL, and two of them would share site environment variables.
3. Netlify production is fail-closed. `[context.production]` in `netlify.toml` runs `echo "Netlify production deploys disabled" && exit 1`. Also set the site's production branch to an unused branch, for example `netlify-prod-unused`, so Netlify does not try to publish `main`. Production remains Render.
4. Build settings come from `netlify.toml`: command `npm run build:preview`, publish directory `dist` (Nitro's Netlify preset writes functions under `.netlify/functions-internal` and static files to `dist`), Node 22. Variables in `netlify.toml` are build-time only. Netlify functions do not receive them.
5. GitHub Actions secrets, repository settings, not the git tree:
   - `NEON_API_KEY`
   - `NEON_PROJECT_ID` (the preview project, not production)
   - `NETLIFY_AUTH_TOKEN`
   - `NETLIFY_SITE_ID`
   - `BETTER_AUTH_SECRET` (a long random value, shared by preview deploys)
     Optional repository variable: `NEON_DATABASE_USERNAME`. The workflow defaults to `neondb_owner`, which is the role Neon Free creates. `create-branch-action` requires a role that already exists on the project.
6. Do not `netlify env:set` `DATABASE_URL`, `BETTER_AUTH_URL`, or `APP_ENV`. Those would be site-wide, so two open PRs could swap databases. The workflow passes them only to that PR's `netlify deploy --build` step. The preview build (`APP_ENV=preview`) bakes them into the **server** bundle. The client bundle is not rewritten. A set `BETTER_AUTH_URL` at runtime still wins over a blank baked value, which is how an explicit Render URL stays in charge — Render's own build never bakes.
7. Optional: `PREVIEW_TRUSTED_HOSTS`, a comma-separated host list such as `*--looktag-previews.netlify.app`. A bare `*` is rejected. Put it in the deploy step's environment if a preview needs it; a site-wide env var is visible to every function.

Forks do not receive these secrets. The workflow logs that and skips. A repo that has the Neon and Netlify secrets but is missing `BETTER_AUTH_SECRET` fails the deploy step instead of booting with a random secret.

## What a preview deploy does

`.github/workflows/neon-preview-branch.yml` runs on PR opened, synchronize, reopened, and closed. It requests `contents: read` and cancels in-progress runs for the same PR (`preview-pr-<n>`).

- Open or update: `neondatabase/create-branch-action` creates or reuses `preview/pr-<n>`. The workflow reads the Netlify site name and sets the origin to `https://pr-<n>--<site>.netlify.app`.
- `netlify deploy --alias pr-<n> --context deploy-preview --build` runs with that origin as `BETTER_AUTH_URL` and `APP_URL`, `APP_ENV=preview`, `VITE_AUTH_ENABLED=true`, `NETLIFY=true` (preset only), the branch's **pooled** `DATABASE_URL`, and `BETTER_AUTH_SECRET`. `--alias` and `--context deploy-preview` are the same deploy. The workflow unsets those keys on the deploy-preview and branch-deploy contexts first so an older site-wide value cannot override this build.
- `npm run build:preview` is `vite build` then `npm run db:migrate`. The migrate step uses the step's `DATABASE_URL`. The function uses the copy baked into the server.
- After the deploy, `npm run db:seed` runs only because `APP_ENV=preview`. The seed script refuses `RENDER=true` and `APP_ENV=production`.
- Close: `neondatabase/delete-branch-action` deletes `preview/pr-<n>`.

## Sign-in

`APP_ENV=preview` turns Google, Apple, and the Grok auth broker off. Email and password still create a real session (`authConfigured` stays on). The login screen hides the other buttons through the method gate, and the server rejects those methods even if Studio settings still have them on.

The trusted origin is `BETTER_AUTH_URL` (the `pr-<n>--<site>.netlify.app` alias). `NETLIFY`, `CONTEXT`, and `DEPLOY_PRIME_URL` are not available inside the function, so sign-in does not depend on them. If `BETTER_AUTH_SECRET` is missing, the server throws at startup instead of minting a new secret per instance.

## Files

Netlify functions have no durable disk. `STORAGE_PROVIDER` defaults to `local`, and on `APP_ENV=preview` every local read or write throws. Set `STORAGE_PROVIDER=s3` or `STORAGE_PROVIDER=r2` on the deploy if a preview must store objects. Photos in this release still live in Postgres, so a preview can boot without object storage.

## Cost

Netlify Free includes a hard cap of 300 credits per month. Deploy previews are 0 credits per deploy. Neon Free covers the preview branches within the 10-branch cap. Render's bill and build do not change.

## Local check

```sh
npm run build
NETLIFY=true APP_ENV=preview \
  BETTER_AUTH_URL=https://pr-9--looktag.netlify.app \
  APP_URL=https://pr-9--looktag.netlify.app \
  BETTER_AUTH_SECRET=local-preview-secret \
  npx vite build
```

The first command still writes `.output/server/index.mjs` and does not inline a preview origin. The second writes the Netlify output, skips the PGLite wasm copy, and puts the preview origin in the server function only.
