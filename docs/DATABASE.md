# Database

Production uses `DATABASE_URL` (Neon or any Postgres). Dev and CI use embedded PGLite when that variable is unset. See [PROVIDERS.md](./PROVIDERS.md) for the driver switch.

## What is allowed in the database

`npm run db:seed` inserts only seed data that ships in this repo:

- houses, lines, and styles from `src/lib/labels/seed.ts` (the house set from #98 and later seed edits)
- creator and editorial looks from `src/lib/looks/seed.ts` (the creator looks from #100 and the editorial set)
- the SQL migrations, including the `seeded_items` ledger

It does not copy uploads, fixture dumps, e2e runs, or a developer's local database. Crops are computed by the seed (`backfillLookCrops`), not copied from an old environment.

Every seeded row is recorded in `seeded_items`: editorial looks, `house-*` looks, houses, products (`lookId:tagId`), and image paths. A data URL is never stored in the ledger as bytes.

## Audit and prune

`npm run db:seed:audit` lists every look, house, product, and image row and marks it seeded or not. It prints counts and ids only. It never prints `DATABASE_URL` or image bytes.

`npm run db:seed:prune` is a dry run unless you pass `--confirm`. It deletes looks that are not in the ledger, which removes the image, crop, and offers stored on those rows. Seeded rows stay. It refuses to run when `NODE_ENV=production` unless `--allow-production` is also passed. Do not point it at a real database.

A fresh `db:migrate` then `db:seed` audits as 0 not-seeded rows.
