/** SQL text for db.statement. Literals are stripped. Bound parameters are never appended. */
export function stripSqlValues(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/'(?:''|[^'])*'/g, "?")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000);
}
