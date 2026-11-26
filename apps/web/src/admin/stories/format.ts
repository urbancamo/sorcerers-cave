/** Dollars for the dashboard: cents precision for amounts, a little more for the tiny per-call ones. */
export const usd = (n: number | null | undefined): string => (n === null || n === undefined ? '–' : n < 1 ? `$${n.toFixed(n < 0.1 ? 3 : 2)}` : `$${n.toFixed(2)}`);

export const seconds = (ms: number | null): string => (ms === null ? '–' : `${(ms / 1000).toFixed(1)} s`);

/** Save text as a file in the browser. */
export function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A story the pipeline turned down, as a Markdown file: why and when first, then the text exactly as it was rejected. */
export function rejectedStoryFile(r: { reason: string | null; at: number | null; text: string; label: string }): { name: string; markdown: string } {
  const when = r.at ? new Date(r.at) : new Date();
  const stamp = when.toISOString().slice(0, 16).replace(/[T:]/g, '-');
  const markdown = [
    `<!-- Rejected story: ${r.label}, ${when.toISOString()} -->`,
    `<!-- Why: ${(r.reason ?? 'not recorded').replace(/-->/g, '- ->')} -->`,
    '',
    r.text.trim(),
    '',
  ].join('\n');
  return { name: `rejected-story-${stamp}.md`, markdown };
}

export const saveRejected = (r: Parameters<typeof rejectedStoryFile>[0]) => {
  const f = rejectedStoryFile(r);
  download(f.name, new Blob([f.markdown], { type: 'text/markdown' }));
};
