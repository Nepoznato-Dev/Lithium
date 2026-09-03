export function parseFrontmatter(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return { meta: {}, body: source };
  const meta = {};
  match[1].split(/\r?\n/).forEach(line => {
    const m = line.match(/^(\w[\w-]*)\s*:\s*(.+)$/);
    if (m) {
      const val = m[2].trim();
      if (val.startsWith('[') && val.endsWith(']')) {
        meta[m[1]] = val.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, ''));
      } else {
        meta[m[1]] = val.replace(/^['"]|['"]$/g, '');
      }
    }
  });
  return { meta, body: source.slice(match[0].length).trim() };
}

export function extractTags(source) {
  const tags = new Set();
  const { meta } = parseFrontmatter(source);
  if (Array.isArray(meta.tags)) meta.tags.forEach(t => tags.add(t.toLowerCase()));
  const body = source.replace(/^---[\s\S]*?---\r?\n?/, '');
  const re = /(?<=\s|^)#([a-zA-Z][a-zA-Z0-9_/-]*)/g;
  let m;
  while ((m = re.exec(body))) tags.add(m[1].toLowerCase());
  return [...tags];
}

export function extractHeadings(source) {
  const body = source.replace(/^---[\s\S]*?---\r?\n?/, '');
  const headings = [];
  body.split(/\r?\n/).forEach((line, idx) => {
    const m = line.match(/^(#{1,6})\s+(.+?)(?:\s+#+)?$/);
    if (m) headings.push({ level: m[1].length, text: m[2], line: idx });
  });
  return headings;
}

export function backlinkContext(source, targetName) {
  const lines = source.replace(/^---[\s\S]*?---\r?\n?/, '').split(/\r?\n/);
  const results = [];
  lines.forEach((line, idx) => {
    if (line.includes(`[[${targetName}]]`) || line.includes(`[[${targetName}|`)) {
      results.push({ line: idx, text: line.trim() });
    }
  });
  return results;
}
