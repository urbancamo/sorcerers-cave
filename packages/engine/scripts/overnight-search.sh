#!/bin/zsh
# Overnight search for the highest-scoring escaped game (see src/scoreSearch.search.ts).
#   scripts/overnight-search.sh [start] [hours] [shards]   start a run; defaults: 7 hours, 12 shards (leave a couple of cores free)
#   scripts/overnight-search.sh resume               carry on a stopped/crashed/rebooted run to its ORIGINAL end time
#   scripts/overnight-search.sh status               shards running, items done, best score, time left
#   scripts/overnight-search.sh stop                 stop the shards (resume later with `resume`)
#   SEARCH_SALT=2 scripts/overnight-search.sh        a different salt is a different, independent run (default 1)
#   FRESH=1 scripts/overnight-search.sh              archive any earlier output (search-out-score.<date>) and start clean
# Restartable: each shard appends one line per finished item and resumes after its last one; the end time is kept in run.json,
# so a restart never extends the run. A start or resume refuses if the engine source has changed since the run began (the results
# would mix two rule sets) — use FRESH=1 then. Keeps the Mac awake with caffeinate.
# When it ends:  scripts/pin-results.sh   (merges, writes the fixtures, the web bundle and the tables, and runs the tests)
cd "$(dirname "$0")/.." || exit 1
OUT=search-out-score
CMD=${1:-}
[[ $CMD == start ]] && { shift; CMD=; }   # `start` is accepted as a word; hours and shards follow
setopt nullglob
running() { pgrep -f "^npm exec vitest run -c vitest.search.config.ts src/scoreSearch.search.ts" 2>/dev/null | wc -l | tr -d ' '; }
# Fingerprint of the engine source, committed or not: a resumed run must be on the same rules it started on.
fingerprint() { { git ls-files -s src; git diff HEAD -- src; } | shasum | cut -c1-12; }
jget() { python3 -c "import json,sys;print(json.load(open('$OUT/run.json')).get('$1',''))" 2>/dev/null; }

# A run.json that does not parse (a launch that went wrong) is reported as such, and FRESH=1 replaces it.
if [[ -f $OUT/run.json ]] && ! python3 -c "import json;json.load(open('$OUT/run.json'))" 2>/dev/null; then
  [[ $CMD == stop || -n ${FRESH:-} ]] || { echo "$OUT/run.json is unreadable (a failed launch?). Start again with FRESH=1 scripts/overnight-search.sh [hours] [shards]"; exit 1; }
fi

case $CMD in
  stop)
    # Stop the shards AND their vitest worker processes (children of the shard, so a plain pkill on the launch line leaves them
    # running, orphaned, and still writing results).
    ROOTS=($(pgrep -f "vitest.search.config.ts src/scoreSearch.search.ts"))
    [[ ${#ROOTS} -gt 0 ]] || { echo "nothing running"; exit 0; }
    ALL=($ROOTS); QUEUE=($ROOTS)
    while [[ ${#QUEUE} -gt 0 ]]; do
      KIDS=($(pgrep -P ${(j:,:)QUEUE})); ALL+=($KIDS); QUEUE=($KIDS)
    done
    ALL=(${(u)ALL})
    kill $ALL 2>/dev/null; sleep 2; kill -9 $ALL 2>/dev/null
    echo "stopped (${#ALL} processes); scripts/overnight-search.sh resume to carry on"
    exit 0 ;;
  status)
    [[ -f $OUT/run.json ]] || { echo "no run in $OUT"; exit 0; }
    END=$(jget endsAtEpoch); NOW=$(date +%s)
    echo "shards running: $(running) of $(jget shards)   started $(jget startedAt)   engine $(jget engineCommit)"
    [[ -n $END ]] && echo "time left: $(( (END - NOW) / 60 )) min (negative = past the end)"
    cat /dev/null $OUT/shard-*.jsonl | python3 -c "
import sys,json
n=0;b=-1;e=0
for l in sys.stdin:
    try: r=json.loads(l)
    except Exception: continue
    n+=1;b=max(b,r['score']);e+=r['score']>=0
print(f'items done: {n}   reached the surface: {e}   best score: {b}')"
    exit 0 ;;
esac

if [[ $(running) -gt 0 ]]; then echo "a search is already running (scripts/overnight-search.sh status | stop)"; exit 1; fi

if [[ -n ${FRESH:-} && -d $OUT ]]; then
  mv $OUT "$OUT.$(date +%Y%m%d-%H%M%S)" && echo "archived the earlier output"
fi

if [[ $CMD == resume || ( -f $OUT/run.json && -z ${FRESH:-} ) ]]; then
  [[ -f $OUT/run.json ]] || { echo "nothing to resume in $OUT"; exit 1; }
  HOURS=$(jget hours); SHARDS=$(jget shards); export SEARCH_SALT=$(jget salt); ENDS=$(jget endsAtEpoch)
  if [[ $(jget engineFingerprint) != $(fingerprint) ]]; then
    echo "the engine source has changed since this run began, so resuming would mix results from two rule sets."
    echo "Start a clean run with:  FRESH=1 scripts/overnight-search.sh   (the old output is kept, archived)"
    exit 1
  fi
  if [[ -z $ENDS || $(date +%s) -ge $ENDS ]]; then echo "this run's time is up; pin it with scripts/pin-results.sh (or FRESH=1 for a new one)"; exit 0; fi
  echo "resuming $SHARDS shards, $(( (ENDS - $(date +%s)) / 60 )) minutes left"
else
  HOURS=${1:-7}; SHARDS=${2:-12}
  [[ $HOURS == <-> && $SHARDS == <-> && $SHARDS -gt 0 && $HOURS -gt 0 ]] || { echo "usage: overnight-search.sh [start] [hours] [shards]   (whole numbers, e.g. 7 12)"; exit 1; }
  export SEARCH_SALT=${SEARCH_SALT:-1}
  mkdir -p $OUT
  ENDS=$(( $(date +%s) + HOURS * 3600 ))
  # Provenance, written once: when, how big, which salt, which engine, and when the run ends.
  cat > $OUT/run.json <<JSON
{
  "startedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "hours": $HOURS,
  "endsAtEpoch": $ENDS,
  "shards": $SHARDS,
  "salt": $SEARCH_SALT,
  "engineCommit": "$(git rev-parse --short HEAD)",
  "engineFingerprint": "$(fingerprint)",
  "uncommittedEngineFiles": $(git status --porcelain -- src | wc -l | tr -d ' '),
  "machine": "$(uname -srm), $(sysctl -n hw.ncpu 2>/dev/null || echo '?') cores"
}
JSON
fi

for ((s = 0; s < SHARDS; s++)); do
  SEARCH_DEADLINE=$(( ENDS * 1000 )) SEARCH_SHARD=$s SEARCH_SHARDS=$SHARDS SEARCH_OUT=$OUT \
    nohup caffeinate -i npx --no-install vitest run -c vitest.search.config.ts src/scoreSearch.search.ts \
    >> $OUT/shard-$s.log 2>&1 &
done
echo "started $SHARDS shards until $(date -r $ENDS)"
