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

`npm run db:seed:prune` is a dry run unless you pass `--confirm`. It deletes looks that are not in the ledger. Image, crop, and offers are columns on that look row, so they go away with the row. They are not deleted from any other table. Seeded rows stay. Non-seed houses are listed as audit-only and are not deleted.

Looks owned by a real user (any user id other than `editorial` or a `label-*` house) are kept. Deleting them requires `--include-user-looks` and `--confirm`. That removes published looks, not just leftover test data. The dry run prints how many of those looks each user id has, and a warning. It does not print emails.

The command refuses `NODE_ENV=production`. It also refuses unless every host node-pg would connect to is loopback (`localhost`, `127.0.0.1`, `::1`) or a unix socket: `?host=` overrides the URL host, then `PGHOST`, then localhost, and a comma-separated list is checked one host at a time. `--allow-production` overrides that. Do not point it at a real database.

`npm run db:seed:prune -- --remote-dry-run` is the only way to point this command at a remote `DATABASE_URL` (for example Neon) without `--allow-production`. It opens `begin read only` and finishes with `rollback`. It never deletes or writes. `--confirm` and `--include-user-looks` are refused in this mode, before any connection, including when `--allow-production` is also passed. The report lists ids and counts for users other than the seed admin (`admin@looktag.studio`, or `ADMIN_EMAIL` when that is set), not-seeded looks, not-seeded houses, not-seeded image paths and uploads, and data-URL images (`data:<owner>`). It does not print emails, image bytes, or `DATABASE_URL`. Deletion is unchanged: it still requires a loopback host or a unix socket unless `--allow-production` is passed, and `--remote-dry-run` does not loosen that.

A fresh `db:migrate` then `db:seed` audits as 0 not-seeded rows.
