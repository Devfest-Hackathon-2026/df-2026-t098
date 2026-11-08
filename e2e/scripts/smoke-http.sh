#!/usr/bin/env bash
# HTTP smoke checks for a running WhyLint instance that serves the Angular app and the API on one
# origin (the container image, or `node dist/src/main.js` with FRONTEND_DIST set).
#
#   e2e/scripts/smoke-http.sh http://localhost:8080
#
# The base URL must equal the server's FRONTEND_URL: it is sent as the Origin of the signup request.
# The script creates one throwaway account. Run it only against a disposable database.
set -uo pipefail

BASE=${1:?usage: smoke-http.sh <base-url>}
BASE=${BASE%/}
pass=0
fail=0

ok() { echo "  PASS  $1"; pass=$((pass + 1)); }
bad() { echo "  FAIL  $1"; fail=$((fail + 1)); }

# check <name> <expected text in headers+body, case-insensitive> <curl args...>
check() {
  local name=$1 want=$2
  shift 2
  local out
  out=$(curl -s -i --max-time 15 "$@" 2>&1)
  if grep -qiF -- "$want" <<<"$out"; then ok "$name"; else bad "$name (wanted: $want)"; head -1 <<<"$out" | sed 's/^/        /'; fi
}

# refuse <name> <unwanted text> <curl args...>
refuse() {
  local name=$1 unwanted=$2
  shift 2
  local out
  out=$(curl -s -i --max-time 15 "$@" 2>&1)
  if grep -qiF -- "$unwanted" <<<"$out"; then bad "$name (found: $unwanted)"; else ok "$name"; fi
}

HTML=(-H 'Accept: text/html')

echo "Probes"
check "liveness answers" '"status":"ok"' "$BASE/api/v1/health"
check "readiness reaches the database" 'HTTP/1.1 200' "$BASE/api/v1/health/ready"
check "probes are not cached" 'cache-control: no-store' "$BASE/api/v1/health"

echo "Angular app on the API origin"
check "root returns the app shell" '<app-root' "${HTML[@]}" "$BASE/"
check "deep link returns the app shell" '<app-root' "${HTML[@]}" "$BASE/login"
check "the shell revalidates" 'cache-control: no-cache' "${HTML[@]}" "$BASE/"
bundle=$(curl -s --max-time 15 "${HTML[@]}" "$BASE/" | grep -o 'main-[A-Za-z0-9_-]*\.js' | head -1)
if [ -n "$bundle" ]; then
  check "hashed bundle is served" 'HTTP/1.1 200' "$BASE/$bundle"
  check "hashed bundle is immutable" 'immutable' "$BASE/$bundle"
else
  bad "the shell references a main-*.js bundle"
fi
check "a missing script is a 404" 'HTTP/1.1 404' "${HTML[@]}" "$BASE/chunk-MISSING1.js"
refuse "a missing script is not the shell" '<app-root' "${HTML[@]}" "$BASE/chunk-MISSING1.js"
check "an unknown API path is a 404" 'HTTP/1.1 404' "${HTML[@]}" "$BASE/api/v1/nope"
refuse "an unknown API path is not the shell" '<app-root' "${HTML[@]}" "$BASE/api/v1/nope"

echo "Headers"
check "nosniff" 'x-content-type-options: nosniff' "${HTML[@]}" "$BASE/"
check "frame protection" 'x-frame-options: DENY' "${HTML[@]}" "$BASE/"
check "HSTS (NODE_ENV=production)" 'strict-transport-security' "${HTML[@]}" "$BASE/"
refuse "no X-Powered-By" 'x-powered-by' "$BASE/api/v1/health"

echo "Question pool"
check "guests receive seeded pool questions" '"questions"' "$BASE/api/v1/learning/feed/pool?language=en&limit=3"

echo "Same-origin sign-up and session"
user="smoke$RANDOM$RANDOM"
body=$(printf '{"username":"%s","email":"%s@example.com","password":"%sAa1!"}' "$user" "$user" "$(openssl rand -hex 12)")
signup=$(curl -s -i --max-time 15 -X POST "$BASE/api/v1/auth/signup" \
  -H "Origin: $BASE" -H 'Content-Type: application/json' -d "$body")
if head -1 <<<"$signup" | grep -q ' 201'; then ok "sign-up from the app origin succeeds"; else bad "sign-up from the app origin succeeds"; head -1 <<<"$signup" | sed 's/^/        /'; fi
token=$(grep -i '^set-cookie: access_token=' <<<"$signup" | sed -E 's/^[Ss]et-[Cc]ookie: access_token=([^;]*).*/\1/' | tr -d '\r')
if grep -qi '^set-cookie: access_token=.*HttpOnly' <<<"$signup" && grep -qi '^set-cookie: access_token=.*Secure' <<<"$signup" && grep -qi '^set-cookie: access_token=.*SameSite=Lax' <<<"$signup"; then
  ok "session cookie is HttpOnly, Secure and SameSite=Lax"
else
  bad "session cookie is HttpOnly, Secure and SameSite=Lax"
fi
if [ -n "$token" ]; then
  check "the new session reads its profile" "$user" -H "Cookie: access_token=$token" "$BASE/api/v1/auth/me"
  check "the new session reads its progress" 'HTTP/1.1 200' -H "Cookie: access_token=$token" "$BASE/api/v1/learning/progress"
else
  bad "the sign-up response carries a session cookie"
fi
check "a foreign Origin cannot sign up" 'HTTP/1.1 403' -X POST "$BASE/api/v1/auth/signup" \
  -H 'Origin: https://attacker.example' -H 'Content-Type: application/json' -d "$body"
check "private routes reject guests" 'HTTP/1.1 401' "$BASE/api/v1/auth/me"

echo
echo "Smoke result: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
