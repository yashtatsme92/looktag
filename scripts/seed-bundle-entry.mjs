import { seedCatalog } from "../src/lib/looks/looks-shared.ts";
import { backfillLookCrops } from "./backfill-look-crops.mjs";
import { openDedicatedPool } from "../src/lib/providers/db/postgres.ts";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.log("[seed] DATABASE_URL not set — skipping. PGLite runs seedCatalog on first request.");
  process.exit(0);
}

const pool = openDedicatedPool(databaseUrl);
const client = await pool.connect();
try {
  const sql = (strings, ...values) => {
    let text = strings[0] ?? "";
    for (let index = 0; index < values.length; index += 1) {
      text += `$${index + 1}${strings[index + 1] ?? ""}`;
    }
    return client.query(text, values).then((result) => result.rows);
  };
  sql.query = async (text, params = []) => (await client.query(text, params)).rows;
  await seedCatalog(sql);
  const crops = await backfillLookCrops(sql);
  if (crops) console.log(`[seed] backfilled ${crops} centred look crop(s).`);
  console.log("[seed] catalog is up to date.");
} catch (error) {
  console.error("[seed] failed:", error?.message || error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
