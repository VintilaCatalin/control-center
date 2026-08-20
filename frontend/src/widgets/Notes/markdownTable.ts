export type TableAlignment = 'left' | 'center' | 'right' | null;

export interface MarkdownTableData {
  headers: string[];
  rows: string[][];
  alignments: TableAlignment[];
}

export interface MarkdownTableRange {
  start: number;
  end: number;
  raw: string;
  table: MarkdownTableData;
}

const separatorCell = /^:?-{3,}:?$/;

export function parseMarkdownTable(raw: string): MarkdownTableData | null {
  const lines = raw.replace(/\r\n/g, '\n').split('\n').filter((line) => line.trim());
  if (lines.length < 2) return null;
  const headers = splitTableRow(lines[0]);
  const separator = splitTableRow(lines[1]).map((cell) => cell.replace(/\s/g, ''));
  if (headers.length < 1 || separator.length !== headers.length || !separator.every((cell) => separatorCell.test(cell))) return null;
  const alignments = separator.map<TableAlignment>((cell) => cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : cell.startsWith(':') ? 'left' : null);
  const rows = lines.slice(2).map((line) => normalizeRow(splitTableRow(line), headers.length));
  return { headers, rows, alignments };
}

export function serializeMarkdownTable(table: MarkdownTableData): string {
  const width = Math.max(1, table.headers.length);
  const headers = normalizeRow(table.headers, width);
  const alignments = normalizeRow(table.alignments, width) as TableAlignment[];
  const separator = alignments.map((alignment) => alignment === 'center' ? ':---:' : alignment === 'right' ? '---:' : alignment === 'left' ? ':---' : '---');
  const row = (cells: string[]) => `| ${normalizeRow(cells, width).map(escapeCell).join(' | ')} |`;
  return [row(headers), row(separator), ...table.rows.map(row)].join('\n');
}

export function findMarkdownTable(text: string, cursor: number): MarkdownTableRange | null {
  const lines = lineRanges(text);
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (!lines[index].text.includes('|')) continue;
    const maybe = parseMarkdownTable(`${lines[index].text}\n${lines[index + 1].text}`);
    if (!maybe) continue;
    let last = index + 1;
    while (last + 1 < lines.length && lines[last + 1].text.trim() && lines[last + 1].text.includes('|')) last += 1;
    const start = lines[index].start;
    const end = lines[last].end;
    if (cursor >= start && cursor <= end) {
      const raw = text.slice(start, end);
      const table = parseMarkdownTable(raw);
      return table ? { start, end, raw, table } : null;
    }
    index = last;
  }
  return null;
}

export function findMarkdownTableByRaw(text: string, raw: string): MarkdownTableRange | null {
  // Marked usually includes the newline after a table in token.raw. Do not
  // replace that newline with the serialised grid or the following paragraph
  // would be glued directly onto the table's last row.
  const needle = raw.replace(/(?:\r?\n)+$/, '');
  const start = text.indexOf(needle);
  const table = parseMarkdownTable(needle);
  if (start >= 0 && table) return { start, end: start + needle.length, raw: needle, table };

  // preprocessWikilinks() changes [[links]] before Marked creates token.raw,
  // so an otherwise untouched table can occasionally fail the exact-text
  // lookup. Fall back to the table under the same structural shape rather
  // than making the visual editor silently do nothing.
  if (!table) return null;
  const lines = lineRanges(text);
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (!parseMarkdownTable(`${lines[index].text}\n${lines[index + 1].text}`)) continue;
    const probe = findMarkdownTable(text, lines[index].start + 1);
    if (probe && probe.table.headers.length === table.headers.length && probe.table.rows.length === table.rows.length) return probe;
  }
  return null;
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells: string[] = [];
  let current = '';
  let escaped = false;
  for (const char of trimmed) {
    if (escaped) {
      current += char === '|' ? '|' : `\\${char}`;
      escaped = false;
    } else if (char === '\\') {
      escaped = true;
    } else if (char === '|') {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (escaped) current += '\\';
  cells.push(current.trim());
  return cells;
}

function escapeCell(value: unknown): string {
  return String(value ?? '').replace(/\|/g, '\\|').trim();
}

function normalizeRow<T>(row: T[], width: number): T[] {
  return Array.from({ length: width }, (_, index) => row[index] ?? ('' as T));
}

function lineRanges(text: string): Array<{ text: string; start: number; end: number }> {
  const result: Array<{ text: string; start: number; end: number }> = [];
  let start = 0;
  for (let index = 0; index <= text.length; index += 1) {
    if (index === text.length || text[index] === '\n') {
      const end = index > start && text[index - 1] === '\r' ? index - 1 : index;
      result.push({ text: text.slice(start, end), start, end });
      start = index + 1;
    }
  }
  return result;
}
