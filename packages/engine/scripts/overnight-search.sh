#!/bin/zsh
# Overnight search for the highest-scoring escaped game (see src/scoreSearch.search.ts).
#   scripts/overnight-search.sh [hours] [shards]     defaults: 7 hours, 12 shards (leave a couple of cores free)
# Safe to stop and re-run: every shard resumes from its own output file. Keeps the Mac awake with caffeinate.
# When it ends:  SEARCH_MERGE=search-out-score npm run search   (then check src/fixtures/best-score-search.json)
cd "$(dirname "$0")/.." || exit 1
HOURS=${1:-7}
SHARDS=${2:-12}
mkdir -p search-out-score
for ((s = 0; s < SHARDS; s++)); do
  SEARCH_HOURS=$HOURS SEARCH_SHARD=$s SEARCH_SHARDS=$SHARDS SEARCH_OUT=search-out-score \
    nohup caffeinate -i npx --no-install vitest run -c vitest.search.config.ts src/scoreSearch.search.ts \
    > search-out-score/shard-$s.log 2>&1 &
done
echo "started $SHARDS shards for $HOURS hours at $(date)"
