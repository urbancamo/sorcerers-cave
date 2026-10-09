// pnpm --filter @sorcerers-cave/pairing-lab battle -- runs/NAME.json#3555 [--out DIR|FILE.html] [--open]
//   Replays one stored battle and writes a single self-contained HTML page that shows it round by round on a card table,
//   using the game's card art. Needs a run file made by `report` (it holds every scenario in full).
//   --scenario N    the scenario number, if the reference has no #N
//   --out PATH      a folder (default runs/battles) or a .html file
//   --assets DIR    the asset folder holding manifest.json (default: docs/assets, found by searching upwards)
//   --width PX      card thumbnail width (default 240)
//   --no-art        draw plain cards instead of the card art
//   --open          open the page in the default browser
import { execFile } from "node:child_process";
import { writeBattleHtml } from "./battleCmd";

const USAGE = "usage: battle RUN.json#SCENARIO [--out DIR|FILE.html] [--assets DIR] [--width PX] [--no-art] [--open]\n   or: battle RUN.json --scenario SCENARIO";
const BOOLEAN = new Set(["no-art", "open", "help"]);

const argv = process.argv.slice(2).filter((a) => a !== "--");
const flags = new Map<string, string>();
let ref: string | undefined;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]!;
  if (a.startsWith("--")) {
    const name = a.slice(2);
    if (BOOLEAN.has(name)) flags.set(name, "1");
    else flags.set(name, argv[++i] ?? "");
  } else if (!ref) ref = a;
}

if (flags.has("help") || !ref) { console.log(USAGE); process.exit(ref || flags.has("help") ? 0 : 1); }

try {
  const r = writeBattleHtml({
    ref: ref!, scenario: flags.get("scenario"), out: flags.get("out"), art: !flags.has("no-art"),
    assetDir: flags.get("assets"), width: flags.has("width") ? Number(flags.get("width")) : undefined,
  });
  console.log(`wrote ${r.path}  (${Math.round(r.bytes / 1024)} KB, scenario ${r.scenario}, ${r.cardsWithArt} cards with art)`);
  if (!flags.has("no-art") && r.cardsWithArt === 0) console.log("note: no card art was found (the asset folder or an image tool such as sips or ImageMagick is missing), so plain cards are drawn");
  if (flags.has("open")) {
    const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
    execFile(cmd, [r.path], () => {});
  }
} catch (e) {
  console.error(`battle: ${(e as Error).message}`);
  process.exit(1);
}
