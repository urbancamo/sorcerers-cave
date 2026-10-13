// pnpm --filter @sorcerers-cave/pairing-lab async [scenarios] [level] [lo-hi strangers] [faults, e.g. error=0.1,delayMs=20,hang=0.02]
// Fights on an external level through the full asynchronous path, against a local stub endpoint that can be made to misbehave.
import { formatAsync, measureAsync } from "./asyncBench";
import { startStub, type Faults } from "./stubEndpoint";

const scenarios = Number(process.argv[2] ?? 30), level = process.argv[3] ?? "ext-easy";
const [lo, hi] = (process.argv[4] ?? "4-12").split("-").map(Number) as [number, number];
const faults = Object.fromEntries((process.argv[5] ?? "").split(",").filter(Boolean).map((kv) => { const [k, v] = kv.split("="); return [k, Number(v)]; })) as Faults;

const stub = await startStub({ faults });
try {
  console.log(`stub at ${stub.url}, faults ${JSON.stringify(faults)}`);
  console.log(formatAsync(await measureAsync({ level, scenarios, deck: "kit", band: [lo, hi], endpoint: { url: stub.url, secret: stub.secret } })));
} finally {
  await stub.close();
}
