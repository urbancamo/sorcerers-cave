import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';
import { asUser } from './game.test';

const modules = import.meta.glob('./**/*.*s');

const CLIENT = { userAgent: 'UA/1.0', viewport: '1280x800', build: 'abc1234' };
const report = (over: Record<string, unknown> = {}) => ({
  description: 'The Dragon did not wake up',
  category: 'rules' as const,
  client: CLIENT,
  ...over,
});

const ENV = { token: process.env.GITHUB_ISSUES_TOKEN, repo: process.env.GITHUB_ISSUES_REPO };

beforeEach(() => {
  vi.useFakeTimers(); // submit schedules createIssue; keep it from running behind the test's back
  process.env.GITHUB_ISSUES_TOKEN = 'ghp_secret_token';
  delete process.env.GITHUB_ISSUES_REPO;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  if (ENV.token === undefined) delete process.env.GITHUB_ISSUES_TOKEN; else process.env.GITHUB_ISSUES_TOKEN = ENV.token;
  if (ENV.repo === undefined) delete process.env.GITHUB_ISSUES_REPO; else process.env.GITHUB_ISSUES_REPO = ENV.repo;
});

async function withGame(t: ReturnType<typeof convexTest>, as: Awaited<ReturnType<typeof asUser>>['as'], testMode = false) {
  const id = await as.mutation(api.game.newGame, { seed: 1, picks: [0] });
  if (testMode) {
    await t.run(async (ctx) => {
      const g = await ctx.db.get(id);
      await ctx.db.patch(id, { state: { ...(g!.state as object), testMode: true } });
    });
  }
  return id;
}

const jobs = (t: ReturnType<typeof convexTest>) => t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect());
const rows = (t: ReturnType<typeof convexTest>) => t.run((ctx) => ctx.db.query('bugReports').collect());

describe('bugReport.submit', () => {
  test('rejects an unauthenticated caller', async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.bugReport.submit, report())).rejects.toThrow();
  });

  test('stores a pending row and schedules the issue', async () => {
    const t = convexTest(schema, modules);
    const { as } = await asUser(t);
    const gameId = await withGame(t, as);
    const res = await as.mutation(api.bugReport.submit, report({ gameId, expected: 'it wakes', contact: 'me@example.com' }));
    const [row] = await rows(t);
    expect(res.ref).toBe(row!._id);
    expect(res.code).toMatch(/^[A-Z]{4}$/);
    expect(row).toMatchObject({ status: 'pending', attempts: 0, testMode: false, code: res.code, contact: 'me@example.com', category: 'rules' });
    expect(await jobs(t)).toHaveLength(1);
  });

  test('accepts a report with no game', async () => {
    const t = convexTest(schema, modules);
    const { as } = await asUser(t);
    const res = await as.mutation(api.bugReport.submit, report());
    expect(res.code).toBeNull();
    expect(await rows(t)).toHaveLength(1);
  });

  test.each([
    ['too short', { description: 'short' }],
    ['too long', { description: 'x'.repeat(5001) }],
    ['expected too long', { expected: 'x'.repeat(2001) }],
    ['contact too long', { contact: 'x'.repeat(201) }],
    ['control characters', { description: 'bad \u0000 description here' }],
    ['user agent too long', { client: { ...CLIENT, userAgent: 'x'.repeat(401) } }],
  ])('rejects %s', async (_name, over) => {
    const t = convexTest(schema, modules);
    const { as } = await asUser(t);
    await expect(as.mutation(api.bugReport.submit, report(over))).rejects.toThrow();
    expect(await rows(t)).toHaveLength(0);
  });

  test('trims the description before measuring it', async () => {
    const t = convexTest(schema, modules);
    const { as } = await asUser(t);
    await expect(as.mutation(api.bugReport.submit, report({ description: '   short   ' }))).rejects.toThrow();
  });

  test("rejects another user's game", async () => {
    const t = convexTest(schema, modules);
    const owner = await asUser(t);
    const other = await asUser(t);
    const gameId = await withGame(t, owner.as);
    await expect(other.as.mutation(api.bugReport.submit, report({ gameId }))).rejects.toThrow();
    expect(await rows(t)).toHaveLength(0);
  });

  test('takes testMode from the stored game state', async () => {
    const t = convexTest(schema, modules);
    const { as } = await asUser(t);
    const gameId = await withGame(t, as, true);
    await as.mutation(api.bugReport.submit, report({ gameId }));
    expect((await rows(t))[0]!.testMode).toBe(true);
  });

  test('allows five reports an hour and rejects the sixth, then allows one after the hour', async () => {
    const t = convexTest(schema, modules);
    const { as } = await asUser(t);
    for (let i = 0; i < 5; i++) await as.mutation(api.bugReport.submit, report());
    await expect(as.mutation(api.bugReport.submit, report())).rejects.toThrow(/Too many reports/);
    vi.advanceTimersByTime(61 * 60 * 1000);
    await as.mutation(api.bugReport.submit, report());
    expect(await rows(t)).toHaveLength(6);
  });

  test("one user's reports do not use up another's limit", async () => {
    const t = convexTest(schema, modules);
    const a = await asUser(t);
    const b = await asUser(t);
    for (let i = 0; i < 5; i++) await a.as.mutation(api.bugReport.submit, report());
    await b.as.mutation(api.bugReport.submit, report());
    expect(await rows(t)).toHaveLength(6);
  });
});

describe('bugReport screenshot', () => {
  const store = (t: ReturnType<typeof convexTest>, size: number, type: string) =>
    t.run((ctx) => ctx.storage.store(new Blob([new Uint8Array(size)], { type })));

  test('generateUploadUrl needs a signed-in caller', async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.bugReport.generateUploadUrl, {})).rejects.toThrow(/sign-in/i);
    const { as } = await asUser(t);
    expect(typeof (await as.mutation(api.bugReport.generateUploadUrl, {}))).toBe('string');
  });

  test('keeps an image and links it from the issue body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ number: 7, html_url: 'https://github.com/x/y/issues/7' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const t = convexTest(schema, modules);
    const { as } = await asUser(t);
    const screenshotId = await store(t, 100, 'image/jpeg');
    const { ref } = await as.mutation(api.bugReport.submit, report({ screenshotId }));
    await t.action(internal.bugReport.createIssue, { id: ref as never });
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body).body as string;
    expect(body).toMatch(/### Screenshot\n\n!\[Screenshot of the game window\]\(https?:\/\/\S+\)/);
  });

  test('a report without one has no Screenshot section', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ number: 8, html_url: 'u' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const t = convexTest(schema, modules);
    const { as } = await asUser(t);
    const { ref } = await as.mutation(api.bugReport.submit, report());
    await t.action(internal.bugReport.createIssue, { id: ref as never });
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).body).not.toContain('### Screenshot');
  });

  test('drops, and deletes, a file that is too large — the report still goes through', async () => {
    const t = convexTest(schema, modules);
    const { as } = await asUser(t);
    // (convex-test records no content type, so the type check itself is not exercised here)
    for (const [size, type] of [[11 * 1024 * 1024, 'image/jpeg']] as const) {
      const screenshotId = await store(t, size, type);
      const { ref } = await as.mutation(api.bugReport.submit, report({ screenshotId }));
      expect((await t.run((ctx) => ctx.db.get(ref as never))) as { screenshotId?: string }).not.toHaveProperty('screenshotId', screenshotId);
      expect(await t.run((ctx) => ctx.db.system.get('_storage', screenshotId))).toBeNull();
    }
  });
});

describe('bugReport.createIssue', () => {
  const ok = () => new Response(JSON.stringify({ number: 42, html_url: 'https://github.com/urbancamo/sorcerers-cave/issues/42' }), { status: 201 });

  async function setup(testMode = false) {
    const t = convexTest(schema, modules);
    const { as } = await asUser(t);
    const gameId = await withGame(t, as, testMode);
    const { ref } = await as.mutation(api.bugReport.submit, report({ gameId, contact: 'me@example.com' }));
    return { t, id: ref as never };
  }

  test('posts the issue and records its number and url', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok());
    vi.stubGlobal('fetch', fetchMock);
    const { t, id } = await setup();
    await t.action(internal.bugReport.createIssue, { id });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.github.com/repos/urbancamo/sorcerers-cave/issues');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer ghp_secret_token');
    expect(init.headers.Accept).toBe('application/vnd.github+json');
    const sent = JSON.parse(init.body);
    expect(sent.title).toBe('[bug-report] The Dragon did not wake up');
    expect(sent.labels).toEqual(['bug-report', 'category:rules']);
    expect(sent.body).not.toContain('me@example.com');
    expect(sent.body).toContain('"moves"');
    expect((await rows(t))[0]).toMatchObject({ status: 'created', issueNumber: 42, issueUrl: 'https://github.com/urbancamo/sorcerers-cave/issues/42', attempts: 0 });
  });

  test('uses GITHUB_ISSUES_REPO when set', async () => {
    process.env.GITHUB_ISSUES_REPO = 'someone/else';
    const fetchMock = vi.fn().mockResolvedValue(ok());
    vi.stubGlobal('fetch', fetchMock);
    const { t, id } = await setup();
    await t.action(internal.bugReport.createIssue, { id });
    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.github.com/repos/someone/else/issues');
  });

  test('a Test Mode game gets the test-mode label and title prefix', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok());
    vi.stubGlobal('fetch', fetchMock);
    const { t, id } = await setup(true);
    await t.action(internal.bugReport.createIssue, { id });
    const sent = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(sent.labels).toContain('test-mode');
    expect(sent.title.startsWith('[test-mode] ')).toBe(true);
  });

  test('a transient failure is retried and then succeeds', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('{"message":"unavailable"}', { status: 503 }))
      .mockResolvedValueOnce(ok());
    vi.stubGlobal('fetch', fetchMock);
    const { t, id } = await setup();
    await t.action(internal.bugReport.createIssue, { id });
    let row = (await rows(t))[0]!;
    expect(row).toMatchObject({ status: 'pending', attempts: 1 });
    expect(row.lastError).toContain('503');
    expect((await jobs(t)).filter((j) => j.state.kind === 'pending')).toHaveLength(2); // the first run + the retry
    await t.action(internal.bugReport.createIssue, { id });
    row = (await rows(t))[0]!;
    expect(row).toMatchObject({ status: 'created', issueNumber: 42 });
  });

  test('a network error counts as transient', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('socket hang up')));
    const { t, id } = await setup();
    await t.action(internal.bugReport.createIssue, { id });
    expect((await rows(t))[0]).toMatchObject({ status: 'pending', attempts: 1 });
  });

  test('a permanent failure stops without retry and never leaks the token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"message":"Bad credentials ghp_secret_token"}', { status: 401 })));
    const { t, id } = await setup();
    const before = (await jobs(t)).length;
    await t.action(internal.bugReport.createIssue, { id });
    const row = (await rows(t))[0]!;
    expect(row.status).toBe('failed');
    expect(row.lastError).toContain('401');
    expect(row.lastError).not.toContain('ghp_secret_token');
    expect(await jobs(t)).toHaveLength(before);
  });

  test('gives up after five attempts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })));
    const { t, id } = await setup();
    for (let i = 0; i < 5; i++) await t.action(internal.bugReport.createIssue, { id });
    expect((await rows(t))[0]).toMatchObject({ status: 'failed', attempts: 5 });
  });

  test('without a token it fails as not configured and makes no request', async () => {
    delete process.env.GITHUB_ISSUES_TOKEN;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { t, id } = await setup();
    await t.action(internal.bugReport.createIssue, { id });
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await rows(t))[0]).toMatchObject({ status: 'failed', lastError: 'not configured' });
  });

  test('an already-created report is not posted twice', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok());
    vi.stubGlobal('fetch', fetchMock);
    const { t, id } = await setup();
    await t.action(internal.bugReport.createIssue, { id });
    await t.action(internal.bugReport.createIssue, { id });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
