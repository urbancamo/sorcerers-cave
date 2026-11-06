#!/bin/zsh
# After an overnight search: turn the shard output into the pinned results and check them.
#   scripts/pin-results.sh [dir]        default dir: search-out-score
# 1. merge: replays candidates on the engine, writes src/fixtures/best-score-search.json and top-score-games.json (top 25 per rule
#    set, any missing moves re-derived), src/fixtures/search-index.json (every escaped search) and docs/testing/search-scenario-tables.md
# 2. regenerates the web app's replay bundle (apps/web/src/data/scenario-games.json, codes B001...S025)
# 3. runs the pinned engine tests and the web tests that read those files
set -e
cd "$(dirname "$0")/.."
DIR=${1:-search-out-score}
SEARCH_MERGE=$DIR npx --no-install vitest run -c vitest.search.config.ts src/scoreSearch.search.ts
npx --no-install vitest run -u src/conformance-vectors.test.ts -t "scenario games"
npx --no-install vitest run src/scoreSearch.pinned.test.ts src/conformance-vectors.test.ts
(cd ../../apps/web && npx --no-install vitest run src/game)
python3 -c "import json;d=json.load(open('src/fixtures/best-score-search.json'));print('pinned best:',d['score'],d['rules'],d['picks'],'seed',d['seed'])"
