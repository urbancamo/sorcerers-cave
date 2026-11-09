import { internalAction, internalMutation, internalQuery, mutation, type QueryCtx } from './_generated/server';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { ConvexError, v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import { unpackCoord, type GameState } from '@sorcerers-cave/engine';
import { gameLog } from './game';
import { buildBody, buildLabels, buildTitle, retryDelayMs, type Category, type IssueInput } from './bugReportIssue';

// In-game bug reports (spec .agent-os/specs/2026-11-09-bug-report-tool). `submit` stores the report and
// schedules `createIssue`, which files it as a GitHub issue. The report is saved before GitHub is
// contacted, so an outage can never lose one. Env (Convex deployment only, never VITE_-prefixed):
// GITHUB_ISSUES_TOKEN (fine-grained PAT, Issues read/write on one repo) and GITHUB_ISSUES_REPO
// (defaults to urbancamo/sorcerers-cave). See apps/web/OPTIONS.md.

const DEFAULT_REPO = 'urbancamo/sorcerers-cave';
const HOUR = 60 * 60 * 1000;
const MAX_PER_HOUR = 5;
// Control characters other than tab and newline.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

const categoryValidator = v.union(v.literal('rules'), v.literal('display'), v.literal('crash'), v.literal('other'));

const reject = (message: string): never => { throw new ConvexError(message); };

function text(value: string | undefined, name: string, min: number, max: number): string | undefined {
  if (value === undefined) return undefined;
  const t = value.trim();
  if (t.length < min) reject(`${name} is too short (at least ${min} characters).`);
  if (t.length > max) reject(`${name} is too long (at most ${max} characters).`);
  if (CONTROL.test(t)) reject(`${name} contains characters that are not allowed.`);
  return t;
}

/** File a bug report. The game context (code, test mode) is read from the stored game, never trusted from the client. */
export const submit = mutation({
  args: {
    gameId: v.optional(v.id('games')),
    description: v.string(),
    expected: v.optional(v.string()),
    category: categoryValidator,
    contact: v.optional(v.string()),
    client: v.object({ userAgent: v.string(), viewport: v.string(), build: v.string() }),
  },
  handler: async (ctx, args) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) return reject('Sign-in required.');
    const description = text(args.description, 'Description', 10, 5000)!;
    const expected = text(args.expected, 'Expected behaviour', 0, 2000) || undefined;
    const contact = text(args.contact, 'Contact', 0, 200) || undefined;
    const client = {
      userAgent: text(args.client.userAgent, 'Browser', 0, 400) ?? '',
      viewport: text(args.client.viewport, 'Viewport', 0, 30) ?? '',
      build: text(args.client.build, 'Build', 0, 40) ?? '',
    };

    let code: string | undefined;
    let testMode = false;
    if (args.gameId) {
      const game = await ctx.db.get(args.gameId);
      if (!game || game.ownerId !== ownerId) return reject('That game is not yours to report on.'); // IDOR guard
      code = game.code ?? undefined;
      testMode = !!(game.state as GameState).testMode;
    }

    const now = Date.now();
    const recent = await ctx.db
      .query('bugReports')
      .withIndex('by_owner_and_created', (q) => q.eq('ownerId', ownerId).gte('createdAt', now - HOUR))
      .take(MAX_PER_HOUR);
    if (recent.length >= MAX_PER_HOUR) reject('Too many reports; please try again later.');

    const id = await ctx.db.insert('bugReports', {
      ownerId, gameId: args.gameId, code, testMode, description, expected, category: args.category, contact, client,
      status: 'pending', attempts: 0, createdAt: now, updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.bugReport.createIssue, { id });
    return { ref: id as string, code: code ?? null };
  },
});

async function loadForIssue(ctx: QueryCtx, id: Id<'bugReports'>) {
  const report = await ctx.db.get(id);
  if (!report) return null;
  const row = report.gameId ? await ctx.db.get(report.gameId) : null;
  if (!row) return { report, game: null, log: null };
  const s = row.state as GameState;
  const at = s.areas[s.partyArea];
  const { x, y } = at ? unpackCoord(at.coord) : { x: 0, y: 0 };
  return {
    report,
    game: { code: row.code, status: row.status, level: s.level, turn: s.turn, x, y, color: row.color, variants: row.variants as Record<string, unknown> | undefined },
    log: await gameLog(ctx, row),
  };
}

export const getForIssue = internalQuery({
  args: { id: v.id('bugReports') },
  handler: (ctx, { id }) => loadForIssue(ctx, id),
});

export const markCreated = internalMutation({
  args: { id: v.id('bugReports'), issueNumber: v.number(), issueUrl: v.string() },
  handler: async (ctx, { id, issueNumber, issueUrl }) => {
    await ctx.db.patch(id, { status: 'created', issueNumber, issueUrl, lastError: undefined, updatedAt: Date.now() });
  },
});

/** Record a failed attempt; with `retryInMs` the report stays pending and is scheduled again, otherwise it is failed for good. */
export const markFailed = internalMutation({
  args: { id: v.id('bugReports'), error: v.string(), retryInMs: v.optional(v.number()) },
  handler: async (ctx, { id, error, retryInMs }) => {
    const row = await ctx.db.get(id);
    if (!row || row.status === 'created') return;
    const retry = retryInMs !== undefined;
    await ctx.db.patch(id, { status: retry ? 'pending' : 'failed', attempts: row.attempts + 1, lastError: error, updatedAt: Date.now() });
    if (retry) await ctx.scheduler.runAfter(retryInMs, internal.bugReport.createIssue, { id });
  },
});

/** Never let the credential reach a stored error message. */
const scrub = (s: string, token: string) => s.split(token).join('[redacted]').slice(0, 300);

export const createIssue = internalAction({
  args: { id: v.id('bugReports') },
  handler: async (ctx, { id }): Promise<null> => {
    const data: { report: Doc<'bugReports'>; game: IssueInput['game']; log: unknown } | null = await ctx.runQuery(internal.bugReport.getForIssue, { id });
    if (!data || data.report.status === 'created') return null; // nothing to do, or already filed (no duplicate issue)
    const { report } = data;

    const token = process.env.GITHUB_ISSUES_TOKEN;
    if (!token) {
      await ctx.runMutation(internal.bugReport.markFailed, { id, error: 'not configured' });
      return null;
    }
    const repo = process.env.GITHUB_ISSUES_REPO || DEFAULT_REPO;
    const input: IssueInput = {
      ref: report.code ? `${id} (${report.code})` : id,
      description: report.description, expected: report.expected, category: report.category as Category,
      testMode: report.testMode, client: report.client, game: data.game, log: data.log,
    };

    const attempt = report.attempts + 1;
    let status: number | null = null;
    let message = '';
    let retryAfter: number | undefined;
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'sorcerers-cave-bug-reporter',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: buildTitle(report.description, report.testMode), body: buildBody(input), labels: buildLabels(report.category as Category, report.testMode) }),
      });
      status = res.status;
      const payload = await res.json().catch(() => ({}));
      if (res.status === 201) {
        await ctx.runMutation(internal.bugReport.markCreated, { id, issueNumber: payload.number, issueUrl: payload.html_url });
        return null;
      }
      message = typeof payload?.message === 'string' ? payload.message : '';
      const ra = Number(res.headers.get('Retry-After'));
      retryAfter = Number.isFinite(ra) && ra > 0 ? ra : undefined;
    } catch (e) {
      status = null; // network error: transient
      message = e instanceof Error ? e.message : String(e);
    }
    const error = scrub(status === null ? `network error: ${message}` : `HTTP ${status}: ${message}`, token);
    const retryInMs = retryDelayMs(status, attempt, retryAfter) ?? undefined;
    await ctx.runMutation(internal.bugReport.markFailed, { id, error, retryInMs });
    return null;
  },
});
