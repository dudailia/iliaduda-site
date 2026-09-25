#!/bin/sh
# Mobile Lighthouse against a local server, one line per run.
#   sh scripts/lh-local.sh http://127.0.0.1:4701 "/lab/a /" 2 out-dir
BASE=$1; ROUTES=$2; RUNS=${3:-2}; OUT=${4:-/tmp/lh-local}
mkdir -p "$OUT"
LH=$(ls -d node_modules/.pnpm/lighthouse@*/node_modules/lighthouse/cli/index.js | head -1)
for p in $ROUTES; do for i in $(seq 1 $RUNS); do
  n=$(echo "$p" | tr '/' '_'); [ "$n" = "_" ] && n=_home
  node "$LH" "$BASE$p" --form-factor=mobile --screenEmulation.mobile --throttling-method=simulate --chrome-flags="--headless=new" --output=json --output-path="$OUT/m$n-$i.json" --quiet
  node -e 'const r=require(process.argv[1]);const c=r.categories,a=r.audits;console.log(process.argv[1].split("/").pop(),"perf",Math.round(c.performance.score*100),"a11y",Math.round(c.accessibility.score*100),"LCP",Math.round(a["largest-contentful-paint"].numericValue),"TBT",Math.round(a["total-blocking-time"].numericValue),"CLS",a["cumulative-layout-shift"].numericValue.toFixed(4),"KB",Math.round(a["total-byte-weight"].numericValue/1024))' "$OUT/m$n-$i.json"
done; done
