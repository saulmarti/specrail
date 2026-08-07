function parseValue(raw: string): unknown {
  const value = raw.trim();
  if (!value) return '';
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if (value.startsWith('[') || value.startsWith('{') || value.startsWith('"')) {
    try { return JSON.parse(value) as unknown; } catch { /* preserve literal */ }
  }
  return value;
}

export function parseDocument(content: string): { meta: Record<string, unknown>; body: string } {
  const normalized = String(content).replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) throw new Error('Task Markdown is missing frontmatter');
  const end = normalized.indexOf('\n---\n', 4);
  if (end < 0) throw new Error('Task Markdown has invalid frontmatter');
  const meta: Record<string, unknown> = {};
  for (const line of normalized.slice(4, end).split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const index = line.indexOf(':');
    if (index < 1) throw new Error(`Invalid frontmatter line: ${line}`);
    meta[line.slice(0, index).trim()] = parseValue(line.slice(index + 1));
  }
  return { meta, body: normalized.slice(end + 5) };
}

export function serializeDocument(meta: Record<string, unknown>, body: string): string {
  const lines = Object.entries(meta).map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  return `---\n${lines.join('\n')}\n---\n${String(body).replace(/^\n+/, '')}`;
}
