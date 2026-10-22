const OID_INT8 = 20;
const OID_DATE = 1082;
const OID_INTERVAL = 1186;
const identity = (value: string) => value;

type Parsers = Record<number, (value: string) => unknown>;

/** Open an in-memory database. The only file that loads the PGLite driver. */
export async function openMemoryPglite(parsers?: Parsers) {
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = parsers ? new PGlite({ parsers }) : new PGlite();
  await pg.waitReady;
  return pg;
}

/** Open the embedded database with the app's int8/date/interval parsers. */
export async function openPglite() {
  return openMemoryPglite({
    [OID_INT8]: Number,
    [OID_DATE]: identity,
    [OID_INTERVAL]: identity,
  });
}

export type EmbeddedDb = Awaited<ReturnType<typeof openPglite>>;
