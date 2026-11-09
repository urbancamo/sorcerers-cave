import { describe, expect, test } from 'vitest';
import { buildBody, buildLabels, buildTitle, MAX_BODY, neutralise, retryDelayMs, type IssueInput } from './bugReportIssue';

const input = (over: Partial<IssueInput> = {}): IssueInput => ({
  ref: 'ref123',
  description: 'The Dragon did not wake up',
  expected: 'It should wake',
  category: 'rules',
  testMode: false,
  client: { userAgent: 'UA/1.0', viewport: '1280x800', build: 'abc1234' },
  game: { code: 'ABCD', status: 'active', level: 2, turn: 14, x: 50, y: 51, color: 'blue', variants: { sibyl: true } },
  log: { game: { code: 'ABCD' }, moves: [{ seq: 0 }] },
  ...over,
});

describe('buildTitle', () => {
  test('prefixes the first line of the description', () => {
    expect(buildTitle('Line one\nLine two', false)).toBe('[bug-report] Line one');
  });
  test('truncates the first line at 80 characters', () => {
    const t = buildTitle('x'.repeat(200), false);
    expect(t).toBe('[bug-report] ' + 'x'.repeat(80));
  });
  test('Test Mode adds a [test-mode] prefix', () => {
    expect(buildTitle('Hello', true)).toBe('[test-mode] [bug-report] Hello');
  });
});

describe('buildLabels', () => {
  test('always bug-report plus the category label', () => {
    expect(buildLabels('crash', false)).toEqual(['bug-report', 'category:crash']);
  });
  test('adds test-mode only for a Test Mode game', () => {
    expect(buildLabels('rules', true)).toEqual(['bug-report', 'category:rules', 'test-mode']);
  });
});

describe('neutralise', () => {
  test('breaks @mentions with a zero-width space', () => {
    expect(neutralise('hi @octocat')).toBe('hi @​octocat');
  });
  test('escapes backticks', () => {
    expect(neutralise('a `b` c')).toBe('a \\`b\\` c');
  });
});

describe('buildBody', () => {
  test('quotes the description and expected behaviour and neutralises mentions', () => {
    const body = buildBody(input({ description: 'line1\n@someone line2 ```', expected: 'ok' }));
    expect(body).toContain('> line1\n> @​someone line2 \\`\\`\\`');
    expect(body).toContain('> ok');
    expect(body).not.toContain('@someone');
  });
  test('shows server-derived context', () => {
    const body = buildBody(input());
    for (const s of ['ABCD', 'active', '14', 'blue', 'abc1234', 'UA/1.0', '1280x800', 'ref123', 'sibyl']) {
      expect(body).toContain(s);
    }
    expect(body).toContain('replay');
  });
  test('never mentions a contact', () => {
    const body = buildBody({ ...input(), contact: 'me@example.com' } as IssueInput);
    expect(body).not.toContain('me@example.com');
  });
  test('includes the log in a details block when it fits', () => {
    const body = buildBody(input());
    expect(body).toContain('<details>');
    expect(body).toContain('"moves"');
  });
  test('omits the log, with a note, when the body would be too long', () => {
    const big = { moves: Array.from({ length: 5000 }, (_, i) => ({ seq: i, pad: 'y'.repeat(20) })) };
    const body = buildBody(input({ log: big }));
    expect(body.length).toBeLessThanOrEqual(MAX_BODY);
    expect(body).not.toContain('<details>');
    expect(body).toContain('too large');
  });
  test('works without a game', () => {
    const body = buildBody(input({ game: null, log: null }));
    expect(body).toContain('No game was attached');
  });
  test('escapes pipes and newlines in the user agent so the table stays intact', () => {
    const body = buildBody(input({ client: { userAgent: 'a|b\nc', viewport: '1x1', build: 'b' } }));
    expect(body).toContain('a\\|b c');
  });
});

describe('retryDelayMs', () => {
  const MIN = 60_000;
  test('transient failures back off 1, 5, 30 minutes then 2 hours', () => {
    expect(retryDelayMs(503, 1)).toBe(1 * MIN);
    expect(retryDelayMs(503, 2)).toBe(5 * MIN);
    expect(retryDelayMs(500, 3)).toBe(30 * MIN);
    expect(retryDelayMs(502, 4)).toBe(120 * MIN);
  });
  test('network errors and 429 are transient', () => {
    expect(retryDelayMs(null, 1)).toBe(1 * MIN);
    expect(retryDelayMs(429, 1)).toBe(1 * MIN);
  });
  test('Retry-After wins when it is longer', () => {
    expect(retryDelayMs(429, 1, 600)).toBe(10 * MIN);
    expect(retryDelayMs(429, 2, 1)).toBe(5 * MIN);
  });
  test('no retry after the fifth attempt', () => {
    expect(retryDelayMs(503, 5)).toBeNull();
  });
  test('client errors are permanent', () => {
    for (const s of [401, 403, 404, 422]) expect(retryDelayMs(s, 1)).toBeNull();
  });
});
