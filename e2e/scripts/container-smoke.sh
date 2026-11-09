#!/usr/bin/env bash
set -euo pipefail

IMAGE=${1:?usage: container-smoke.sh <image>}
HERE=$(cd "$(dirname "$0")" && pwd)
PORT=${SMOKE_PORT:-18080}
NAME="whylint-smoke-$$"

cleanup() {
  docker rm -f "$NAME-app" "$NAME-db" >/dev/null 2>&1 || true
  docker network rm "$NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "Image runs as an unprivileged user"
uid=$(docker run --rm --entrypoint id "$IMAGE" -u)
if [ "$uid" = "0" ]; then echo "  FAIL  the image runs as root"; exit 1; fi
echo "  PASS  uid $uid"

docker network create "$NAME" >/dev/null
docker run -d --name "$NAME-db" --network "$NAME" \
  -e POSTGRES_USER=whylint -e POSTGRES_DB=whylint -e POSTGRES_HOST_AUTH_METHOD=trust \
  postgres:16-alpine >/dev/null
# Wait for TCP after Postgres finishes its socket-only setup.
for _ in $(seq 1 60); do
  docker exec "$NAME-db" pg_isready -h 127.0.0.1 -U whylint -d whylint >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$NAME-db" pg_isready -h 127.0.0.1 -U whylint -d whylint >/dev/null

DB_URL="postgresql://whylint@$NAME-db:5432/whylint"

echo "Release job"
first=$(docker run --rm --network "$NAME" -e DB_URL="$DB_URL" "$IMAGE" node dist/scripts/release.js)
echo "$first" | sed 's/^/  /'
grep -q 'Migrations applied' <<<"$first"
grep -q 'Pool seeded: [1-9]' <<<"$first"
second=$(docker run --rm --network "$NAME" -e DB_URL="$DB_URL" "$IMAGE" node dist/scripts/release.js)
echo "$second" | sed 's/^/  /'
grep -q 'already up to date' <<<"$second"
grep -q 'Pool seeded: 0' <<<"$second"
echo "  PASS  release job is repeatable"

docker run -d --name "$NAME-app" --network "$NAME" -p "127.0.0.1:$PORT:8080" \
  -e DB_URL="$DB_URL" \
  -e JWT_SECRET="$(openssl rand -hex 24)" \
  -e FRONTEND_URL="http://localhost:$PORT" \
  -e TRUST_PROXY=1 \
  "$IMAGE" >/dev/null

for _ in $(seq 1 60); do
  curl -sf "http://localhost:$PORT/api/v1/health" >/dev/null 2>&1 && break
  sleep 1
done
if ! curl -sf "http://localhost:$PORT/api/v1/health" >/dev/null; then
  echo "  FAIL  the container did not become healthy"
  docker logs "$NAME-app" 2>&1 | tail -30
  exit 1
fi

"$HERE/smoke-http.sh" "http://localhost:$PORT"
