/**
 * A deliberately small markdown reader for stories: the stored text is markdown, and the PDF (and any on-screen view)
 * is built from these blocks. Supported: a `# Title`, `##`/`###` headings (used by the fixed post-material), paragraphs,
 * `---` rules, `> ` quotes, `*emphasis*` and `**strong**`. Anything else is plain paragraph text.
 */
export type Span = { text: string; em?: boolean; strong?: boolean };
export type Block =
  | { type: "title"; spans: Span[] }
  | { type: "heading"; level: 2 | 3; spans: Span[] }
  | { type: "paragraph"; spans: Span[] }
  | { type: "quote"; spans: Span[] }
  | { type: "rule" };

/** Split one line of text into plain, emphasised and strong runs. Unbalanced markers are kept as literal text. */
export function spans(text: string): Span[] {
  const out: Span[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_/g;
  let last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ text: m[1], strong: true });
    else out.push({ text: (m[2] ?? m[3])!, em: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out.length ? out : [{ text }];
}

export function parseMarkdown(md: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ type: "paragraph", spans: spans(para.join(" ").trim()) });
    para = [];
  };
  for (const raw of md.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    let m: RegExpMatchArray | null;
    if (!line) flush();
    else if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) { flush(); blocks.push({ type: "rule" }); }
    else if ((m = line.match(/^#\s+(.*)$/))) { flush(); blocks.push({ type: "title", spans: spans(m[1]!) }); }
    else if ((m = line.match(/^(#{2,3})\s+(.*)$/))) { flush(); blocks.push({ type: "heading", level: m[1]!.length as 2 | 3, spans: spans(m[2]!) }); }
    else if ((m = line.match(/^>\s?(.*)$/))) { flush(); blocks.push({ type: "quote", spans: spans(m[1]!) }); }
    else para.push(line);
  }
  flush();
  return blocks;
}

/** The plain text of a block list, for word counts and tests. */
export const plainText = (blocks: Block[]): string =>
  blocks.map((b) => (b.type === "rule" ? "" : b.spans.map((s) => s.text).join(""))).filter(Boolean).join("\n\n");
