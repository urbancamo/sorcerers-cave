#!/bin/zsh
# Overnight search for the highest-scoring escaped game (see src/scoreSearch.search.ts).
#   scripts/overnight-search.sh [hours] [shards]     defaults: 7 hours, 12 shards (leave a couple of cores free)
#   SEARCH_SALT=2 scripts/overnight-search.sh        a different salt is a different, independent run (default 1)
# Safe to stop and re-run: every shard resumes from its own output file. Keeps the Mac awake with caffeinate.
# When it ends:  scripts/pin-results.sh   (merges, writes the fixtures, the web bundle and the tables, and runs the tests)
# Writes search-out-score/run.json — what the run needs to be reproduced; the merge copies it into the fixtures.
cd "$(dirname "$0")/.." || exit 1
HOURS=${1:-7}
SHARDS=${2:-12}
export SEARCH_SALT=${SEARCH_SALT:-1}
mkdir -p search-out-score
# Provenance, written once (a resumed run keeps the original): when, how big, which salt, which engine.
if [[ ! -f search-out-score/run.json ]]; then
  cat > search-out-score/run.json <<JSON
{
  "startedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "hours": $HOURS,
  "shards": $SHARDS,
  "salt": $SEARCH_SALT,
  "engineCommit": "$(git rev-parse --short HEAD)",
  "uncommittedEngineFiles": $(git status --porcelain -- src | wc -l | tr -d ' '),
  "machine": "$(uname -srm), $(sysctl -n hw.ncpu 2>/dev/null || echo '?') cores"
}
JSON
fi
for ((s = 0; s < SHARDS; s++)); do
  SEARCH_HOURS=$HOURS SEARCH_SHARD=$s SEARCH_SHARDS=$SHARDS SEARCH_OUT=search-out-score \
    nohup caffeinate -i npx --no-install vitest run -c vitest.search.config.ts src/scoreSearch.search.ts \
    > search-out-score/shard-$s.log 2>&1 &
done
echo "started $SHARDS shards for $HOURS hours at $(date)"
