/**
 * Optional hint: Neon's `-pooler` host cannot hold a session advisory lock.
 * Migrate reads this; the lock helper itself stays driver-free.
 */
export { migrationLockMode } from "../../../../scripts/pg-pool.mjs";

