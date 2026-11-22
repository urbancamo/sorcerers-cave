import { parseMarkdown, type Block, type Span } from "./markdown";
import { plainText } from "./markdown";

/**
 * Markdown story -> PDF, in the browser, on demand. The library is loaded only when a PDF is requested (dynamic import),
 * so it never weighs on the game's first load. A4, serif body, left-aligned paragraphs with italic and bold runs,
 * a centred title, headings and rules for the fixed post-material, and page numbers.
 */
const MM = { margin: 25, top: 28, bottom: 24 };
const BODY = { size: 11, lead: 6.1, para: 3.4 };

type Word = { text: string; style: "normal" | "italic" | "bold" | "bolditalic" };

const styleOf = (s: Span): Word["style"] => (s.strong && s.em ? "bolditalic" : s.strong ? "bold" : s.em ? "italic" : "normal");
const words = (spans: Span[]): Word[] =>
  spans.flatMap((s) => (s.text.match(/\S+|\s+/g) ?? []).map((t) => ({ text: t, style: styleOf(s) })));

export const pdfFilename = (title: string): string => `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "short-story"}.pdf`;

export async function buildStoryPdf(markdown: string, footer = "The Sorcerer's Cave"): Promise<{ output: () => ArrayBuffer; pages: number; filename: string; save: () => void }> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const blocks = parseMarkdown(markdown);
  const pageW = doc.internal.pageSize.getWidth(), pageH = doc.internal.pageSize.getHeight();
  const width = pageW - 2 * MM.margin;
  let y = MM.top;

  const font = (style: Word["style"], size: number) => { doc.setFont("times", style); doc.setFontSize(size); };
  const room = (h: number) => { if (y + h > pageH - MM.bottom) { doc.addPage(); y = MM.top; } };

  /** Lay out styled words into wrapped lines, then draw them. */
  const flow = (spans: Span[], size: number, lead: number, opts: { center?: boolean; bold?: boolean; indent?: number } = {}) => {
    const ws = words(spans).map((w) => (opts.bold ? { ...w, style: (w.style === "italic" ? "bolditalic" : "bold") as Word["style"] } : w));
    const lines: Word[][] = [[]];
    let x = 0;
    const max = width - (opts.indent ?? 0);
    for (const w of ws) {
      font(w.style, size);
      const wd = doc.getTextWidth(w.text);
      const space = /^\s+$/.test(w.text);
      if (!space && x + wd > max && lines[lines.length - 1]!.length) { lines.push([]); x = 0; }
      if (space && x === 0) continue; // no leading space on a wrapped line
      lines[lines.length - 1]!.push(w);
      x += wd;
    }
    for (const line of lines) {
      room(lead);
      const total = line.reduce((n, w) => { font(w.style, size); return n + doc.getTextWidth(w.text); }, 0);
      let px = MM.margin + (opts.indent ?? 0) + (opts.center ? (max - total) / 2 : 0);
      for (const w of line) { font(w.style, size); doc.text(w.text, px, y); px += doc.getTextWidth(w.text); }
      y += lead;
    }
  };

  let title = "";
  for (const b of blocks as Block[]) {
    if (b.type === "title") {
      title ||= b.spans.map((s) => s.text).join("");
      y += 6;
      flow(b.spans, 22, 10, { center: true, bold: true });
      y += 10;
    } else if (b.type === "heading") {
      room(14); y += b.level === 2 ? 5 : 3;
      flow(b.spans, b.level === 2 ? 13 : 11.5, 6.5, { bold: true });
      y += 2;
    } else if (b.type === "rule") {
      room(10); y += 3; doc.setDrawColor(150); doc.setLineWidth(0.2);
      doc.line(pageW / 2 - 15, y, pageW / 2 + 15, y); y += 7;
    } else if (b.type === "quote") {
      flow(b.spans, BODY.size, BODY.lead, { indent: 8 }); y += BODY.para;
    } else {
      flow(b.spans, BODY.size, BODY.lead); y += BODY.para;
    }
  }

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p); font("italic", 9); doc.setTextColor(120);
    doc.text(footer, MM.margin, pageH - 12);
    doc.text(`${p} / ${pages}`, pageW - MM.margin, pageH - 12, { align: "right" });
  }
  void plainText;
  return { output: () => doc.output("arraybuffer"), pages, filename: pdfFilename(title), save: () => doc.save(pdfFilename(title)) };
}

/** Build the PDF and hand it to the browser as a download. */
export async function downloadStoryPdf(markdown: string, footer?: string): Promise<void> {
  (await buildStoryPdf(markdown, footer)).save();
}
