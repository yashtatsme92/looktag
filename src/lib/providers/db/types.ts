/** Which database backend is active. "neon" is accepted as an alias of "postgres". */
export type DbSource = "postgres" | "pglite";

/**
 * Minimal shared SQL surface, satisfied by both Postgres and PGLite.
 * Tagged-template and `.query()` forms resolve to an array of row objects.
 */
export interface Sql {
  <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]>;
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}
