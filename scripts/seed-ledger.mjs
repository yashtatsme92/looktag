/**
 * Identity helpers for the seed ledger. IDs only — never image bytes.
 * A data URL or any other oversized source becomes `data:<owner>`, so audit
 * output cannot leak a photo.
 */

/** @param {string} src @param {string} ownerId */
export function imageKey(src, ownerId) {
  if (!src) return "";
  if (src.startsWith("data:") || src.length > 240) return `data:${ownerId}`;
  return src;
}

/** @param {string} lookId @param {string} tagId */
export function productKey(lookId, tagId) {
  return `${lookId}:${tagId}`;
}

/**
 * @param {Set<string>} ledger kind and id joined by a null byte
 * @param {string} id
 */
export function lookIsSeeded(ledger, id) {
  return (
    ledger.has(`editorial_look\0${id}`) ||
    ledger.has(`house_look\0${id}`) ||
    ledger.has(`look\0${id}`)
  );
}

/** @param {Array<{ kind: string, id: string }>} rows */
export function ledgerSet(rows) {
  return new Set(rows.map((row) => `${row.kind}\0${row.id}`));
}
