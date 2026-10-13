// The call to an external stranger level's endpoint (stage 6.3), with no Convex in it so the lab can run the very same client against its
// stub (stage 6.6). The contract is documented in apps/web/OPTIONS.md.
import type { PendingKind } from "@sorcerers-cave/engine";

/** The version of the request/response contract with the endpoint. */
export const CONTRACT_VERSION = 1;

/** What one request asks of the endpoint. */
export interface Job { requestId: string; kind: PendingKind; context: unknown; strategyId: string; strategyVersion: number; deadlineMs: number }

/** Where the endpoint is and the secret it expects; both unset in a deployment that has not configured one. */
export interface Endpoint { url: string | undefined; secret: string | undefined }

/** Ask the endpoint under the level's deadline. Never throws: a failure comes back as its recorded reason. */
export async function askEndpoint(job: Job, { url, secret }: Endpoint): Promise<{ raw: unknown } | { failure: string }> {
  if (!url) return { failure: "endpoint not configured" };
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Raced rather than relying on the abort signal alone, so an endpoint (or fetch) that ignores it is still cut off.
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { timedOut = true; reject(new Error("timeout")); controller.abort(); }, job.deadlineMs);
  });
  const call = async (): Promise<{ raw: unknown } | { failure: string }> => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(secret ? { Authorization: `Bearer ${secret}` } : {}) },
      body: JSON.stringify({ version: CONTRACT_VERSION, requestId: job.requestId, strategyId: job.strategyId, strategyVersion: job.strategyVersion, kind: job.kind, context: job.context }),
      signal: controller.signal,
    });
    if (!res.ok) return { failure: `endpoint answered ${res.status}` };
    let body: { version?: unknown; decision?: unknown };
    try { body = await res.json(); } catch { return { failure: "endpoint answer was not JSON" }; }
    if (!body || typeof body !== "object" || body.version !== CONTRACT_VERSION) return { failure: "endpoint answer has the wrong version" };
    if (body.decision === undefined || body.decision === null) return { failure: "endpoint answer has no decision" };
    return { raw: body.decision };
  };
  try {
    return await Promise.race([call(), deadline]);
  } catch (e) {
    return { failure: timedOut ? "timeout" : e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

