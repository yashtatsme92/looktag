import { assertProductionDatabase } from "../../../../scripts/pg-pool.mjs";

/** Exit before listen when production has no database and no explicit opt-in. */
export function refuseEphemeralDatabase(): void {
  try {
    assertProductionDatabase({
      NODE_ENV: process.env.NODE_ENV,
      DATABASE_URL: process.env.DATABASE_URL,
      LOOKTAG_ALLOW_EPHEMERAL_DB: process.env.LOOKTAG_ALLOW_EPHEMERAL_DB,
      ALLOW_EPHEMERAL_DB: process.env.ALLOW_EPHEMERAL_DB,
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

refuseEphemeralDatabase();
