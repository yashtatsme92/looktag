/** SQL text for db.statement. Literals are stripped. Bound parameters (`$1`) stay. */
export function stripSqlValues(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/'(?:''|[^'])*'/g, "?")
    .replace(/(?<!\$)\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g, "?")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000);
}
