# Splitting the dev and production backends

Status: **a plan, not yet carried out.** Written 2026-11-13.

## Where we are

| | Local dev | Live site (`vercel --prod`) |
|---|---|---|
| Front end | Vite on localhost | Vercel project `web`, sorcerers-cave.vercel.app |
| Backend it talks to | `dev:animated-ptarmigan-315` (`apps/web/.env.local`) | **the same** `animated-ptarmigan-315` (its URL is baked into the live JS bundle) |

- The Vercel build command (root `vercel.json`) runs `npx convex deploy --cmd-url-env-var-name VITE_CONVEX_URL ...`. `convex deploy`
  uses the `CONVEX_DEPLOY_KEY` environment variable to pick the deployment, and it hands that deployment's URL to the front end build.
  The live bundle has the dev URL, so the key on the Vercel project is for the **dev** deployment.
- `npx convex dev` pushes the working tree to the same deployment all the time. A schema or function change therefore reaches the
  live site's backend before the matching front end is deployed.
- A second Convex deployment exists (the one the CLI reaches with `--prod`). Nothing uses it. It is stale: older functions, an empty
  `highScores` table, its own environment variables.

## Where we want to be

| | Backend | Reached by |
|---|---|---|
| Local dev, and `convex dev` | `dev:animated-ptarmigan-315` | your machine only |
| Live site | a **production** deployment | `vercel --prod` (Vercel Production environment) |
| Vercel previews (optional) | a throwaway preview deployment per branch | Vercel Preview environment |

After the split, `convex dev` can no longer touch what players use; production changes only when you run `vercel --prod`.

## Before you start: decide about the data

The live site's data (games, high scores, game stats, users) all sits in the dev deployment today. Two options:

- **A. Start production empty.** Simplest and cleanest: no dev and test games, no test bug reports. Players lose their saved games and
  the high-score table starts again (the 221 and any others would have to be re-added by hand).
- **B. Copy dev into production.** Keeps high scores, saved games, game stats and user accounts (the admin logins keep their passwords).
  It also copies dev and test junk (test games, bug reports). Either way, players' **sessions end** (see step 5), so an anonymous
  player's in-progress game can only be resumed by its four-letter code.

Pick one before step 5. Choose a quiet time for the cutover.

## Steps

### 1. Find the production deployment

In the Convex dashboard, open the `sorcerers-cave` project and its **Production** deployment (the one the CLI reaches with `--prod`).
Note its URL (`https://<name>.<region>.convex.cloud`). If you would rather start from a fresh one than reuse that stale one, create a
new production deployment in the dashboard and use that instead.

### 2. Give production its own environment variables

Set these on **production** (`--prod`). Nothing is copied automatically from dev.

| Variable | Value | Why |
|---|---|---|
| `JWT_PRIVATE_KEY`, `JWKS` | a **new** RS256 keypair (below) | sign-in tokens; production must not share dev's keys |
| `SITE_URL` | `https://sorcerers-cave.vercel.app` | the site's own address, used by Convex Auth |
| `FORCED_REDRAW_ENABLED` | `1` | matches dev, so games play the same |
| `SORCERER_TELEPORT_ENABLED` | `1` | matches dev |
| `TRAP_RULES_ENABLED` | `1` | matches dev |
| `GITHUB_ISSUES_TOKEN`, `GITHUB_ISSUES_REPO` | the same token and repo as dev | the bug-report icon files GitHub issues |

Not needed: `TEST_MODE_SECRET` (retired), `REVISED_COMBAT_ENABLED` (on by default now; set `0` only to turn it off),
`STRANGER_STRATEGY` (leave unset), `CONVEX_SITE_URL` (the deployment injects it).

Generate the keypair once (Node, with `jose` available, for example from `apps/web`):

```js
import { exportJWK, exportPKCS8, generateKeyPair } from "jose";
const keys = await generateKeyPair("RS256", { extractable: true });
const privateKey = await exportPKCS8(keys.privateKey);
const publicKey = await exportJWK(keys.publicKey);
console.log(`JWT_PRIVATE_KEY=${privateKey.trimEnd().replace(/\n/g, " ")}`);
console.log(`JWKS=${JSON.stringify({ keys: [{ use: "sig", ...publicKey }] })}`);
```

Then set the values (`--` stops the key's leading dashes being read as options):

```bash
cd apps/web
npx convex env set JWT_PRIVATE_KEY --prod -- "<the private key, on one line>"
npx convex env set JWKS --prod -- '<the JWKS json>'
npx convex env set SITE_URL https://sorcerers-cave.vercel.app --prod
npx convex env set FORCED_REDRAW_ENABLED 1 --prod
npx convex env set SORCERER_TELEPORT_ENABLED 1 --prod
npx convex env set TRAP_RULES_ENABLED 1 --prod
# GITHUB_ISSUES_TOKEN / GITHUB_ISSUES_REPO likewise
npx convex env list --prod        # check
```

Do not paste the private key into chat or commit it.

### 3. Deploy the code to production

```bash
cd apps/web
git checkout main && git pull
npx convex deploy                 # asks you to confirm the production deployment; read the URL it prints
```

In the dashboard, check that the functions and the schema are there (`settings`, `adminUsers`, `analytics`, `highScores`, ...).

### 4. Create an administrator on production (option A only)

Option B copies the existing admin accounts, so skip this.

```bash
npx convex run admin:seedUser '{"username":"<name>","password":"<a new password>","roles":["SYSTEM"]}' --prod
```

The password lands in your shell history; use a one-off password and change it. Then sign in at `<site>/login` once step 7 is done.

### 5. Copy the data across (option B only)

```bash
npx convex export --path dev-backup.zip              # from the dev deployment
npx convex import --prod --replace-all dev-backup.zip
```

- `--replace-all` wipes production first. Check the prompt names the production deployment.
- Production signs tokens with the new keys from step 2, so **every existing session stops working**. Admin users sign in again with the
  same passwords. Anonymous players get a new anonymous identity and can resume a saved game only with its four-letter code.
- Delete test games and bug reports afterwards in the dashboard if you do not want them.

### 6. Point Vercel at production

1. In the production deployment's dashboard: **Settings → URL & Deploy Key → Production deploy key**. Copy it.
2. In Vercel: **Project `web` → Settings → Environment Variables**. Set `CONVEX_DEPLOY_KEY` to that key, scoped to **Production only**.
3. For previews, either:
   - add a Convex **Preview deploy key** scoped to **Preview** only (each preview branch then gets its own throwaway backend), or
   - leave `CONVEX_DEPLOY_KEY` unset for Preview, so a preview build fails rather than touching real data.
   Do not leave the old dev key on Preview or Production.

### 7. Deploy the front end and check it

```bash
vercel --prod
```

Check that the live bundle now names the **production** deployment, not `animated-ptarmigan-315`:

```bash
curl -s https://sorcerers-cave.vercel.app/ | grep -o 'assets/main-[^"]*\.js'
curl -s https://sorcerers-cave.vercel.app/assets/<that file> | grep -o 'https://[a-z0-9-]*\.[a-z0-9-]*\.convex\.cloud'
```

Then try: the welcome page loads, a game can be started and saved, `/login` works, and the System tab shows Multiplayer **OFF** (it is a
new database, or a copy with the switch at its dev value, so check). Turn Multiplayer on if you want it, and play a solo game to the end
and save the score.

### 8. Tidy up

- `.env.local` stays as it is: local dev and `convex dev` use the dev deployment only.
- Optional: in `turbo.json`, add `"globalPassThroughEnv": ["CONVEX_DEPLOY_KEY"]` to silence Turbo's warning about the unlisted variable.
- Update `apps/web/OPTIONS.md` and the README so they say which deployment each command targets (`--prod` means production now).
- Rollback, if it goes wrong: set `CONVEX_DEPLOY_KEY` on Vercel back to the old dev key and run `vercel --prod` again. Dev still holds the
  old data (it is not changed by this plan).

## Working in the new setup

| I want to... | Do this |
|---|---|
| try a change | `convex dev` and the local front end (dev backend only) |
| release | merge to `main`, then `vercel --prod` (runs `convex deploy` to production, then builds the front end) |
| change a production environment variable | `npx convex env set NAME value --prod` |
| look at production data | `npx convex data <table> --prod` (run it yourself; my tooling blocks production reads) |

Because production only changes on release, a schema or function change should still be compatible with the front end that is
live while it deploys: add optional fields and new functions first, remove old ones in a later release.
