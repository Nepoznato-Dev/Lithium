import { mdRenderEnhancedSync, mdWikiLinksSync } from './core';

/**
 * Enhanced markdown renderer with Obsidian and GitHub Flavored Markdown support.
 *
 * Standard: headings, bold, italic, strikethrough, inline code, code fences,
 *           blockquotes, ordered/unordered/task lists, links, images, hr
 *
 * Obsidian: [[wiki links]], ![[embeds]], ==highlights==, callouts, footnotes,
 *           math ($ and $$), tags (#tag), comments (%%...%%)
 *
 * GitHub:   tables, auto-linked URLs, fenced code with language, alerts
 *           (NOTE, TIP, IMPORTANT, WARNING, CAUTION), collapsible details,
 *           @mentions, issue/PR references
 */

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Safe inline HTML tags to preserve (Obsidian + GitHub) */
const SAFE_TAGS = ['u', '/u', 'kbd', '/kbd', 'sup', '/sup', 'sub', '/sub', 'br', 'br/', 'mark', '/mark', 'ins', '/ins'];

/** Replace safe HTML tags with placeholders before escaping, restore after */
function protectHtml(text) {
  const stash = [];
  // Match self-closing or opening/closing tags like <u>, </u>, <br>, <br/>, <kbd>, etc.
  const protected_ = text.replace(/<(\/?\w+)(?:\s[^>]*)?\s*\/?>/g, (full, tag) => {
    const lower = tag.toLowerCase();
    if (SAFE_TAGS.includes(lower) || SAFE_TAGS.includes(full.replace(/<\/?|\s*\/?>/g, '').toLowerCase())) {
      const idx = stash.length;
      stash.push(full);
      return `⟦MDHTML${idx}⟧`;
    }
    return full;
  });
  return { protected_, stash };
}
function restoreHtml(text, stash) {
  return text.replace(/⟦MDHTML(\d+)⟧/g, (_, idx) => stash[Number(idx)]);
}

/** Process inline formatting for a single line */
function inline(text, refLinks) {
  // 1. Protect safe HTML tags before escaping
  const { protected_: src, stash } = protectHtml(text);
  let out = escapeHtml(src);

  // Inline math $...$
  out = out.replace(/\$([^$\n]+?)\$/g, '<span class="md-math-inline">\\($1\\)</span>');

  // Images ![alt](url) with optional title
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (_, alt, url, title) => {
    const titleAttr = title ? ` title="${title}"` : '';
    return (url.startsWith('http') || url.startsWith('data:')
      ? `<img src="${url}" alt="${alt}"${titleAttr} style="max-width:100%;border-radius:8px" />`
      : alt);
  });

  // Links [text](url) with optional title
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (_, label, url, title) => {
    const titleAttr = title ? ` title="${title}"` : '';
    return (url.startsWith('http') || url.startsWith('/')
      ? `<a href="${url}"${titleAttr} target="_blank" rel="noreferrer" class="md-link">${label}</a>`
      : label);
  });

  // Reference-style links [text][ref] or [text][]
  if (refLinks) {
    out = out.replace(/\[([^\]]+)\]\[([^\]]*)\]/g, (_, label, ref) => {
      const key = (ref || label).toLowerCase();
      const entry = refLinks[key];
      if (!entry) return _;
      const titleAttr = entry.title ? ` title="${entry.title}"` : '';
      return `<a href="${entry.url}"${titleAttr} target="_blank" rel="noreferrer" class="md-link">${label}</a>`;
    });
  }

  // Wiki links [[Note]] or [[Note|alias]] or [[Note#Section]]
  out = out.replace(/\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g, (_, target, section, alias) => {
    const display = alias ? alias.trim() : target.trim();
    const sectionAttr = section ? ` data-section="${section.trim()}"` : '';
    return `<a href="#" data-wiki="${target.trim()}"${sectionAttr} class="md-wiki">${display}</a>`;
  });

  // Embeds ![[Note]] or ![[Note#Section]]
  out = out.replace(/!\[\[([^\]|#]+)(?:#([^\]|]+))?\]\]/g, (_, target, section) => {
    const sectionAttr = section ? ` data-section="${section.trim()}"` : '';
    return `<span class="md-embed" data-embed="${target.trim()}"${sectionAttr}>📎 ${target.trim()}${section ? ' → ' + section.trim() : ''}</span>`;
  });

  // Footnote references [^id]
  out = out.replace(/\[\^([^\]]+)\]/g, '<sup class="md-footnote-ref"><a href="#fn-$1" id="fnref-$1">$1</a></sup>');

  // @mentions (GitHub-style)
  out = out.replace(/@([a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)/g,
    '<a href="https://github.com/$1" target="_blank" rel="noreferrer" class="md-mention">@$1</a>');

  // Issue/PR references #123 (GitHub-style) — must run before tag regex
  out = out.replace(/(?<!\w)#(\d+)(?!\w)/g,
    '<a href="#" class="md-issue-ref">#$1</a>');

  // Auto-link bare URLs (not already in links)
  out = out.replace(/(?<!["=])(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noreferrer" class="md-link">$1</a>');

  // === Emphasis (order matters: bold-italic → bold → italic) ===
  // Asterisk-based
  out = out.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  // Underscore-based (word-boundary aware)
  out = out.replace(/(?<!\w)___([^_]+)___(?!\w)/g, '<strong><em>$1</em></strong>');
  out = out.replace(/(?<!\w)__([^_]+)__(?!\w)/g, '<strong>$1</strong>');
  out = out.replace(/(?<!\w)_([^_\s]+)_(?!\w)/g, '<em>$1</em>');

  // Strikethrough ~~text~~
  out = out.replace(/~~([^~]+)~~/g, '<del>$1</del>');

  // Inline code
  out = out.replace(/`([^`]+)`/g, '<code class="md-code">$1</code>');

  // ==highlight==
  out = out.replace(/==([^=]+)==/g, '<mark class="md-mark">$1</mark>');

  // Superscript ^text^ (Obsidian extended) — allow after word chars like X^2^
  out = out.replace(/(?<!\^)\^([^\s^]+)\^(?!\^)/g, '<sup class="md-sup">$1</sup>');

  // Subscript ~text~ (Obsidian extended) — single tilde only, ~~ is already consumed
  out = out.replace(/(?<!~)~(?!~)([^~\s]+)~(?!~)/g, '<sub class="md-sub">$1</sub>');

  // Tags #tag (Obsidian-style, but not in code/links)
  out = out.replace(/(?<=\s|^)#([a-zA-Z][a-zA-Z0-9_/-]*)/g,
    '<span class="md-tag">#$1</span>');

  // 2. Restore protected HTML tags
  out = restoreHtml(out, stash);

  return out;
}

/** Parse a table row into cells */
function parseTableRow(line) {
  return line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
}

/** Check if line is a table separator (supports with or without leading pipes) */
function isTableSep(line) {
  if (!line || !line.includes('-')) return false;
  // Must contain at least one | or be purely a separator like ---|---
  const stripped = line.trim();
  return /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(stripped);
}

/** Check if a line looks like a table header (contains | separators) */
function isTableHeader(line) {
  if (!line || !line.includes('|')) return false;
  // Must have at least one | that acts as a column separator
  return /\S\s*\||\|\s*\S/.test(line.trim());
}

/** Render a table from collected rows */
function renderTable(headerLine, sepLine, bodyLines, refLinks, sourceLine) {
  const headers = parseTableRow(headerLine);
  const aligns = parseTableRow(sepLine).map(s => {
    if (s.startsWith(':') && s.endsWith(':')) return 'center';
    if (s.endsWith(':')) return 'right';
    return 'left';
  });

  const slAttr = sourceLine != null ? ` data-source-line="${sourceLine}"` : '';
  let html = `<div class="md-table-wrap"${slAttr}><table class="md-table"><thead><tr>`;
  headers.forEach((h, i) => {
    const align = aligns[i] || 'left';
    html += `<th style="text-align:${align}">${inline(h, refLinks)}</th>`;
  });
  html += '</tr></thead><tbody>';

  bodyLines.forEach(row => {
    const cells = parseTableRow(row);
    html += '<tr>';
    cells.forEach((c, i) => {
      const align = aligns[i] || 'left';
      html += `<td style="text-align:${align}">${inline(c, refLinks)}</td>`;
    });
    html += '</tr>';
  });

  html += '</tbody></table></div>';
  return html;
}

/** Parse Obsidian callout type from blockquote */
function parseCallout(lines) {
  // Callout: > [!TYPE] or > [!TYPE] Title
  const match = lines[0]?.match(/^>\s*\[!(\w+)\](?:\s+(.*))?$/i);
  if (!match) return null;
  const type = match[1].toLowerCase();
  const title = match[2] || type.charAt(0).toUpperCase() + type.slice(1);
  const body = [];
  let i = 1;
  while (i < lines.length && /^>\s?/.test(lines[i])) {
    body.push(lines[i].replace(/^>\s?/, ''));
    i++;
  }
  return { type, title, body, endIdx: i };
}

/** Map callout type to icon and CSS class */
const CALLOUT_MAP = {
  note:      { icon: '📝', cls: 'md-callout-note' },
  tip:       { icon: '💡', cls: 'md-callout-tip' },
  important: { icon: '⭐', cls: 'md-callout-important' },
  warning:   { icon: '⚠️', cls: 'md-callout-warning' },
  caution:   { icon: '🔥', cls: 'md-callout-caution' },
  info:      { icon: 'ℹ️', cls: 'md-callout-info' },
  example:   { icon: '📌', cls: 'md-callout-example' },
  quote:     { icon: '💬', cls: 'md-callout-quote' },
  bug:       { icon: '🐛', cls: 'md-callout-bug' },
  fail:      { icon: '❌', cls: 'md-callout-fail' },
  success:   { icon: '✅', cls: 'md-callout-success' },
  question:  { icon: '❓', cls: 'md-callout-question' },
  abstract:  { icon: '📋', cls: 'md-callout-abstract' },
  todo:      { icon: '☑️', cls: 'md-callout-todo' },
};

/** Render markdown source to an HTML string.
 *  Always uses the enhanced JS renderer (the WASM core lacks Obsidian/GFM features).
 *  Every block-level element gets a data-source-line attribute for click-to-source. */
export function renderMarkdown(source) {
  try {
    const native = mdRenderEnhancedSync(source);
    if (native !== null) return native;
    return renderMarkdownJs(source);
  } catch (err) {
    console.error('[markdown] render error:', err);
    return renderMarkdownJs(source);
  }
}

function renderMarkdownJs(source) {
  const lines = (source || '').split(/\r?\n/);
  const html = [];
  const footnotes = {};
  const refLinks = {};
  let i = 0;

  // First pass: collect footnote definitions and reference-style links, tracking original line numbers
  const contentLines = [];
  const lineMap = [];
  for (let j = 0; j < lines.length; j++) {
    const fnMatch = lines[j].match(/^\[\^([^\]]+)\]:\s+(.*)$/);
    const refMatch = lines[j].match(/^\[([^\]^!][^\]]*)\]:\s+(\S+)(?:\s+"([^"]*)")?$/);
    if (fnMatch) {
      footnotes[fnMatch[1]] = fnMatch[2];
    } else if (refMatch) {
      refLinks[refMatch[1].toLowerCase()] = { url: refMatch[2], title: refMatch[3] || '' };
    } else {
      contentLines.push(lines[j]);
      lineMap.push(j);
    }
  }

  // Remove Obsidian comments %%...%%
  const cleaned = contentLines.join('\n').replace(/%%[\s\S]*?%%/g, '');
  const cleanedLines = cleaned.split('\n');
  /** Get data-source-line attribute for the current block at cleanedLines index idx */
  const sl = idx => ` data-source-line="${lineMap[idx] ?? idx}"`;
  i = 0;

  while (i < cleanedLines.length) {
    const line = cleanedLines[i];

    // Display math $$...$$
    if (/^\$\$/.test(line)) {
      const startI = i;
      const buffer = [line.replace(/^\$\$/, '')];
      i += 1;
      while (i < cleanedLines.length && !/^\$\$/.test(cleanedLines[i])) {
        buffer.push(cleanedLines[i]);
        i += 1;
      }
      if (i < cleanedLines.length) buffer.push(cleanedLines[i].replace(/\$\$$/, ''));
      i += 1;
      html.push(`<div class="md-math-block"${sl(startI)}>\\[${buffer.join('\n')}\\]</div>`);
      continue;
    }

    // Code fence with optional language
    if (/^```/.test(line)) {
      const startI = i;
      const lang = line.replace(/^```/, '').trim();
      const buffer = [];
      i += 1;
      while (i < cleanedLines.length && !/^```/.test(cleanedLines[i])) { buffer.push(cleanedLines[i]); i += 1; }
      i += 1;
      const langAttr = lang ? ` data-lang="${lang}"` : '';
      const langLabel = lang ? `<span class="md-code-lang">${escapeHtml(lang)}</span>` : '';
      html.push(`<div class="md-pre-wrap"${sl(startI)}${langAttr}>${langLabel}<pre class="md-pre"><code>${escapeHtml(buffer.join('\n'))}</code></pre></div>`);
      continue;
    }

    // Heading (ATX-style: # Heading)
    const heading = line.match(/^(#{1,6})\s+(.*?)(?:\s+#+)?$/);
    if (heading) {
      const level = heading[1].length;
      const id = heading[2].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      html.push(`<h${level} id="${id}" class="md-h md-h${level}"${sl(i)}>${inline(heading[2], refLinks)}</h${level}>`);
      i += 1;
      continue;
    }

    // Horizontal rule
    if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) { html.push(`<hr class="md-hr"${sl(i)} />`); i += 1; continue; }

    // Collapsible details (GitHub-style)
    if (/^<details>/i.test(line)) {
      const buffer = [];
      i += 1;
      while (i < cleanedLines.length && !/<\/details>/i.test(cleanedLines[i])) {
        buffer.push(cleanedLines[i]);
        i += 1;
      }
      i += 1;
      const summaryMatch = buffer[0]?.match(/^<summary>(.*)<\/summary>$/i);
      const summary = summaryMatch ? summaryMatch[1] : 'Details';
      const content = summaryMatch ? buffer.slice(1).join('\n') : buffer.join('\n');
      html.push(`<details class="md-details"${sl(i)}><summary>${inline(summary, refLinks)}</summary><div class="md-details-body">${renderMarkdownJs(content)}</div></details>`);
      continue;
    }

    // Table detection: header line with | and next line is separator
    if (isTableHeader(line) && i + 1 < cleanedLines.length && isTableSep(cleanedLines[i + 1])) {
      const headerLine = line;
      i += 1;
      const sepLine = cleanedLines[i];
      i += 1;
      const bodyRows = [];
      while (i < cleanedLines.length && cleanedLines[i].includes('|') && /\S/.test(cleanedLines[i])) {
        bodyRows.push(cleanedLines[i]);
        i += 1;
      }
      html.push(renderTable(headerLine, sepLine, bodyRows, refLinks, lineMap[i - bodyRows.length - 2] ?? i));
      continue;
    }

    // Blockquote / Callout
    if (/^>\s?/.test(line)) {
      const bqStart = i;
      const quoteLines = [];
      while (i < cleanedLines.length && /^>\s?/.test(cleanedLines[i])) {
        quoteLines.push(cleanedLines[i]);
        i += 1;
      }
      const callout = parseCallout(quoteLines);
      if (callout) {
        const cfg = CALLOUT_MAP[callout.type] || { icon: '📝', cls: 'md-callout-note' };
        html.push(`<div class="md-callout ${cfg.cls}"${sl(bqStart)}><span class="md-callout-icon">${cfg.icon}</span><div class="md-callout-title">${inline(callout.title, refLinks)}</div><div class="md-callout-body">${callout.body.map(l => inline(l, refLinks)).join('<br/>')}</div></div>`);
      } else {
        const content = quoteLines.map(l => l.replace(/^>\s?/, ''));
        html.push(`<blockquote class="md-quote"${sl(bqStart)}>${content.map(l => inline(l, refLinks)).join('<br/>')}</blockquote>`);
      }
      continue;
    }

    // Task list
    if (/^\s*[-*+]\s+\[( |x|X)\]\s+/.test(line)) {
      const taskStart = i;
      const buffer = [];
      while (i < cleanedLines.length && /^\s*[-*+]\s+\[( |x|X)\]\s+/.test(cleanedLines[i])) {
        const match = cleanedLines[i].match(/^\s*[-*+]\s+\[( |x|X)\]\s+(.*)$/);
        const done = match[1].toLowerCase() === 'x';
        buffer.push(`<li class="md-task ${done ? 'done' : ''}"><span class="md-task-box">${done ? '☑' : '☐'}</span>${inline(match[2], refLinks)}</li>`);
        i += 1;
      }
      html.push(`<ul class="md-list md-tasks"${sl(taskStart)}>${buffer.join('')}</ul>`);
      continue;
    }

    // Unordered list (with basic nesting support)
    if (/^\s*[-*+]\s+/.test(line) && !/^\s*[-*+]\s+\[( |x|X)\]/.test(line)) {
      const ulStart = i;
      const buffer = [];
      const baseIndent = line.match(/^(\s*)/)[1].length;
      while (i < cleanedLines.length && /^\s*[-*+]\s+/.test(cleanedLines[i]) && !/^\s*[-*+]\s+\[( |x|X)\]/.test(cleanedLines[i])) {
        const indent = cleanedLines[i].match(/^(\s*)/)[1].length;
        const content = cleanedLines[i].replace(/^\s*[-*+]\s+/, '');
        if (indent > baseIndent) {
          buffer.push(`<li class="md-subitem">${inline(content, refLinks)}</li>`);
        } else {
          buffer.push(`<li>${inline(content, refLinks)}</li>`);
        }
        i += 1;
      }
      html.push(`<ul class="md-list"${sl(ulStart)}>${buffer.join('')}</ul>`);
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const olStart = i;
      const buffer = [];
      while (i < cleanedLines.length && /^\s*\d+\.\s+/.test(cleanedLines[i])) {
        buffer.push(`<li>${inline(cleanedLines[i].replace(/^\s*\d+\.\s+/, ''), refLinks)}</li>`);
        i += 1;
      }
      html.push(`<ol class="md-list"${sl(olStart)}>${buffer.join('')}</ol>`);
      continue;
    }

    // Blank line
    if (/^\s*$/.test(line)) { i += 1; continue; }

    // Paragraph (collect until blank/structural line)
    const paraStart = i;
    const buffer = [line];
    i += 1;
    while (
      i < cleanedLines.length &&
      !/^\s*$/.test(cleanedLines[i]) &&
      !/^(#{1,6})\s/.test(cleanedLines[i]) &&
      !/^```/.test(cleanedLines[i]) &&
      !/^>\s?/.test(cleanedLines[i]) &&
      !/^\s*[-*+]\s+/.test(cleanedLines[i]) &&
      !/^\s*\d+\.\s+/.test(cleanedLines[i]) &&
      !(isTableHeader(cleanedLines[i]) && i + 1 < cleanedLines.length && isTableSep(cleanedLines[i + 1])) &&
      !/^\$\$/.test(cleanedLines[i]) &&
      !/^<details>/i.test(cleanedLines[i])
    ) { buffer.push(cleanedLines[i]); i += 1; }
    html.push(`<p class="md-p"${sl(paraStart)}>${buffer.map(l => inline(l, refLinks)).join('<br/>')}</p>`);
  }

  // Append footnotes section if any
  if (Object.keys(footnotes).length > 0) {
    html.push('<section class="md-footnotes"><hr class="md-hr" /><ol>');
    Object.entries(footnotes).forEach(([id, text]) => {
      html.push(`<li id="fn-${id}">${inline(text, refLinks)} <a href="#fnref-${id}" class="md-footnote-back">↩</a></li>`);
    });
    html.push('</ol></section>');
  }

  return html.join('\n');
}

/** Extract all [[wiki link]] targets from a note body. */
export function wikiLinks(source) {
  const native = mdWikiLinksSync(source);
  if (native !== null) return native;
  const found = new Set();
  const regex = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
  let match;
  while ((match = regex.exec(source || '')) !== null) found.add(match[1].trim());
  return [...found];
}

/**
 * Smart heading transform: replaces any existing # prefix on each line with
 * the requested level, or strips it when the line already has that level.
 */
export function applyHeading(lineText, level) {
  const stripped = lineText.replace(/^#{1,6}\s+/, '');
  const current = (lineText.match(/^(#{1,6})\s/) || [])[1]?.length || 0;
  if (current === level) return stripped;
  return `${'#'.repeat(level)} ${stripped}`;
}
