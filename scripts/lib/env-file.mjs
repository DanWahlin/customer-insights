export function updateEnvironmentText(source, updates) {
  const remaining = new Map(Object.entries(updates));
  const lines = source.split(/\r?\n/).map(line => {
    if (!line || line.trimStart().startsWith('#')) return line;
    const separator = line.indexOf('=');
    if (separator < 1) return line;
    const key = line.slice(0, separator).trim();
    if (!remaining.has(key)) return line;
    const value = remaining.get(key);
    remaining.delete(key);
    return `${key}=${value}`;
  });
  while (lines.length && lines.at(-1) === '') lines.pop();
  for (const [key, value] of remaining) lines.push(`${key}=${value}`);
  return `${lines.join('\n')}\n`;
}
