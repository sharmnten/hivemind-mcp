/** Three UTF-8 bytes per estimated token; includes JSON metadata, never truncates facts. */
export function boundContext<T>(rows: readonly T[], tokenBudget: number): T[] {
  const maxBytes = Math.max(2, Math.floor(tokenBudget) * 3);
  const result: T[] = [];
  let bytes = 2;
  for (const row of rows) {
    const size =
      Buffer.byteLength(JSON.stringify(row), "utf8") + (result.length ? 1 : 0);
    if (bytes + size > maxBytes) break;
    result.push(row);
    bytes += size;
  }
  return result;
}
