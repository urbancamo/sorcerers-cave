// Pure helpers that turn a stored bug report into a GitHub issue, and decide how a failed attempt is
// retried. No Convex or network access here, so it is unit-testable on its own (bugReportIssue.test.ts).

// GitHub's issue body limit is 65,536 characters; stay safely below it.
export const MAX_BODY = 60_000;
export const MAX_ATTEMPTS = 5;

export type Category = 'rules' | 'display' | 'crash' | 'other';

export interface IssueInput {
  ref: string;
  description: string;
  expected?: string;
  category: Category;
  testMode: boolean;
  client: { userAgent: string; viewport: string; build: string };
  // Read from the stored game on the server, never from the client.
  game: { code?: string | null; status: string; level: number; turn: number; x: number; y: number; color?: string | null; variants?: Record<string, unknown> } | null;
  log: unknown;
}

const ZWSP = '​';

/** Player text is untrusted: stop @mentions notifying anyone and backticks opening code spans. */
export function neutralise(text: string): string {
  return text.replace(/@/g, `@${ZWSP}`).replace(/`/g, '\\`');
}

const quote = (text: string) => neutralise(text).split(/\r?\n/).map((l) => `> ${l}`).join('\n');

// A markdown table cell: no pipes, no newlines.
const cell = (text: string) => neutralise(text).replace(/\|/g, '\\|').replace(/\s*[\r\n]+\s*/g, ' ');

export function buildTitle(description: string, testMode: boolean): string {
  const first = description.trim().split(/\r?\n/)[0]!.slice(0, 80);
  return `${testMode ? '[test-mode] ' : ''}[bug-report] ${neutralise(first)}`;
}

export function buildLabels(category: Category, testMode: boolean): string[] {
  return ['bug-report', `category:${category}`, ...(testMode ? ['test-mode'] : [])];
}

export function buildBody(input: IssueInput): string {
  const { game, client } = input;
  const variants = game?.variants ? Object.entries(game.variants).filter(([, on]) => on).map(([k]) => k).join(', ') : '';
  const rows: [string, string][] = [
    ['Report', input.ref],
    ['Game code', game?.code ?? 'none'],
    ['Status', game?.status ?? 'n/a'],
    ['Level', game ? String(game.level) : 'n/a'],
    ['Turn', game ? String(game.turn) : 'n/a'],
    ['Area', game ? `(${game.x}, ${game.y})` : 'n/a'],
    ['Party colour', game?.color ?? 'n/a'],
    ['Variants', variants || 'none'],
    ['Test mode', input.testMode ? 'yes' : 'no'],
    ['Build', client.build],
    ['Browser', client.userAgent],
    ['Viewport', client.viewport],
  ];
  const parts = [
    '### What happened',
    quote(input.description),
    ...(input.expected ? ['### What was expected', quote(input.expected)] : []),
    '### Context',
    '| | |\n|---|---|\n' + rows.map(([k, v]) => `| ${k} | ${cell(v)} |`).join('\n'),
    '### How to reproduce',
    game?.code
      ? `Replay game \`${game.code}\` from the title screen (replay by code) and step to turn ${game.turn}.`
      : 'No game was attached to this report.',
  ];
  const head = parts.join('\n\n');
  if (input.log == null) return head;
  const detail = `\n\n<details>\n<summary>Game log (replayable)</summary>\n\n\`\`\`json\n${JSON.stringify(input.log)}\n\`\`\`\n\n</details>`;
  if (head.length + detail.length <= MAX_BODY) return head + detail;
  return `${head}\n\n_The game log was too large to include here; replay by game code instead._`;
}

const MINUTE = 60_000;
const BACKOFF = [1 * MINUTE, 5 * MINUTE, 30 * MINUTE, 120 * MINUTE];

/**
 * Delay before the next attempt, or null when the failure is permanent or attempts are used up.
 * `status` is the HTTP status, or null for a network error; `attempt` is how many attempts have now been made.
 */
export function retryDelayMs(status: number | null, attempt: number, retryAfterSec?: number): number | null {
  const transient = status === null || status === 429 || status >= 500;
  if (!transient || attempt >= MAX_ATTEMPTS) return null;
  const backoff = BACKOFF[Math.min(attempt, BACKOFF.length) - 1]!;
  return Math.max(backoff, (retryAfterSec ?? 0) * 1000);
}
