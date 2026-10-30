// A local stand-in for an external stranger level's endpoint (stage 6.6): an HTTP server speaking the contract in apps/web/OPTIONS.md
// (POST { version, requestId, strategyId, strategyVersion, kind, context } with a bearer secret; answer { version: 1, decision }) that
// answers with a built-in strategy's hooks, and can be told to misbehave so the fallback paths are measured and not just believed.
//
// It sees exactly what a real endpoint would: the plain-data context, with no `evaluate`. A strategy that searches by rollout
// (`expert`) therefore answers here as its first candidate, `standard`'s; this stub proves the plumbing, not a model's strength.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { getStrategy, standardStrategy, type StrangerStrategy } from "@sorcerers-cave/engine";

/** How the stub misbehaves. Each rate is a probability per request, tried in the order hang, error, malformed, illegal. */
export interface Faults {
  delayMs?: number;      // added to every answer
  jitterMs?: number;     // plus up to this much more, at random
  hang?: number;         // never answers
  error?: number;        // answers 500
  malformed?: number;    // answers 200 with a body that is not JSON
  illegal?: number;      // answers a well-formed decision that breaks the rules
  seed?: number;         // fixes which requests misbehave
}

export interface Stub { url: string; secret: string; served: number; close(): Promise<void> }

const mulberry32 = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** The strategy's answer for a request, with `standard`'s hook for any it leaves out. */
function decide(strategy: StrangerStrategy, kind: string, context: never): unknown {
  switch (kind) {
    case "loadout": return strategy.assignArtefacts(context);
    case "deploy": return (strategy.deploy ?? standardStrategy.deploy!)(context);
    case "engage": return (strategy.engage ?? standardStrategy.engage!)(context);
    case "redeploy": return (strategy.redeploy ?? standardStrategy.redeploy!)(context);
    case "casualty": return (strategy.chooseCasualty ?? standardStrategy.chooseCasualty!)(context);
    default: throw new Error(`unknown kind ${kind}`);
  }
}

export async function startStub(o: { strategy?: StrangerStrategy; secret?: string; faults?: Faults } = {}): Promise<Stub> {
  const strategy = o.strategy ?? getStrategy("expert"), secret = o.secret ?? "lab-secret", faults = o.faults ?? {};
  const rand = mulberry32(faults.seed ?? 1);
  const stub: Stub = { url: "", secret, served: 0, close: async () => {} };
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      if (req.method !== "POST" || req.headers.authorization !== `Bearer ${secret}`) { res.writeHead(401).end(); return; }
      stub.served++;
      const roll = rand(), wait = (faults.delayMs ?? 0) + rand() * (faults.jitterMs ?? 0);
      const [hang, error, malformed, illegal] = [faults.hang ?? 0, faults.error ?? 0, faults.malformed ?? 0, faults.illegal ?? 0];
      if (roll < hang) return;                                                   // the caller's deadline is the only way out
      setTimeout(() => {
        if (roll < hang + error) { res.writeHead(500).end(); return; }
        if (roll < hang + error + malformed) { res.writeHead(200).end("not json"); return; }
        let body: { kind: string; context: never };
        try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { res.writeHead(400).end(); return; }
        const decision = roll < hang + error + malformed + illegal ? {} : decide(strategy, body.kind, body.context);
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ version: 1, decision }));
      }, wait);
    });
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  stub.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/decide`;
  stub.close = () => new Promise<void>((ok) => { server.closeAllConnections(); server.close(() => ok()); });
  return stub;
}
