/** Stand-in used only when LOOKTAG_BUNDLE_PGLITE=0. The real driver is not in the image. */
export class PGlite {
  constructor() {
    throw new Error("PGLite is not included in this build. Set DATABASE_URL to a Postgres server.");
  }
}
