#!/usr/bin/env bash
# Smoke test for deployed site — checks that key pages return 200
# Usage: ./scripts/smoke-test.sh https://elupedia.fr
set -euo pipefail

BASE_URL="${1:?Usage: $0 <base-url>}"

PATHS=(
  "/"
  "/a-propos"
  "/donnees-personnelles"
)

ERRORS=0

for path in "${PATHS[@]}"; do
  url="${BASE_URL}${path}"
  status=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  if [ "$status" = "200" ]; then
    echo "OK  $status $url"
  else
    echo "FAIL $status $url"
    ERRORS=$((ERRORS + 1))
  fi
done

if [ "$ERRORS" -gt 0 ]; then
  echo ""
  echo "$ERRORS page(s) failed."
  exit 1
else
  echo ""
  echo "All pages OK."
fi
