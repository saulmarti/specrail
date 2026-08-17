#!/usr/bin/env bash
set -euo pipefail
SOURCE="$0"
while [ -L "$SOURCE" ]; do
  DIR=$(CDPATH= cd -- "$(dirname -- "$SOURCE")" && pwd)
  LINK=$(readlink "$SOURCE")
  case "$LINK" in /*) SOURCE="$LINK";; *) SOURCE="$DIR/$LINK";; esac
done
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$SOURCE")" && pwd)
PKG_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
CLI="$PKG_ROOT/dist/src/cli.js"
SERVER="$PKG_ROOT/dist/src/runtime-server.js"
BUILD_FILE="$PKG_ROOT/dist/.specrail-build-id"
case "${SPEC_RAIL_DISABLE_RUNTIME:-}" in 1|true|TRUE|yes|YES) exec node "$CLI" "$@";; esac

# Commands that bootstrap/update the package itself stay outside the resident runtime.
CMD=${1:-}
case "$CMD" in install|update|version|--version|-v|--help|-h|'') exec node "$CLI" "$@";; esac
command -v curl >/dev/null 2>&1 || exec node "$CLI" "$@"
[ -f "$BUILD_FILE" ] || exec node "$CLI" "$@"
BUILD_ID=$(tr -d '\r\n' < "$BUILD_FILE")
[ -n "$BUILD_ID" ] || exec node "$CLI" "$@"
BUILD_SHORT=${BUILD_ID:0:16}

ROOT_ARG=""
ARGS=("$@")
for ((i=0;i<${#ARGS[@]};i++)); do
  if [ "${ARGS[$i]}" = "--root" ] && (( i + 1 < ${#ARGS[@]} )); then ROOT_ARG=${ARGS[$((i+1))]}; break; fi
done
if [ -n "$ROOT_ARG" ]; then
  ROOT=$(git -C "$ROOT_ARG" rev-parse --show-toplevel 2>/dev/null || (CDPATH= cd -- "$ROOT_ARG" && pwd -P))
  REQUEST_ARGS=("${ARGS[@]}")
else
  ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd -P)
  REQUEST_ARGS=("${ARGS[@]}" --root "$ROOT")
fi
# Canonicalize the repository path so /var/... and /private/var/... on macOS
# identify the same resident runtime.
ROOT=$(CDPATH= cd -- "$ROOT" && pwd -P)
RUNTIME_DIR="$ROOT/.ai/runtime"
META="$RUNTIME_DIR/specrail-runtime-${BUILD_SHORT}.json"
START_LOCK="$RUNTIME_DIR/specrail-start-${BUILD_SHORT}.lock"
# Darwin's sockaddr_un path is very short (~104 bytes). Repository-local
# sockets fail in normal macOS temp/worktree paths, so keep only the socket in
# a short private system directory; metadata/locks remain repo-local.
SOCKET_BASE=${SPEC_RAIL_RUNTIME_SOCKET_DIR:-"/tmp/specrail-$(id -u)"}
mkdir -p "$RUNTIME_DIR" "$SOCKET_BASE"
chmod 700 "$SOCKET_BASE" 2>/dev/null || true
if command -v shasum >/dev/null 2>&1; then
  ROOT_KEY=$(printf '%s' "$ROOT" | shasum -a 256 | awk '{print substr($1,1,16)}')
elif command -v sha256sum >/dev/null 2>&1; then
  ROOT_KEY=$(printf '%s' "$ROOT" | sha256sum | awk '{print substr($1,1,16)}')
else
  ROOT_KEY=$(printf '%s' "$ROOT" | cksum | awk '{print $1 "-" $2}')
fi
SOCKET="$SOCKET_BASE/r-${ROOT_KEY}-${BUILD_SHORT}.sock"

health(){ curl -fsS --max-time 0.35 --unix-socket "$SOCKET" http://specrail/v1/health >/dev/null 2>&1; }
pid_alive(){ [ -n "${1:-}" ] && kill -0 "$1" 2>/dev/null; }
runtime_pid(){ sed -n 's/.*"pid"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p' "$META" 2>/dev/null | head -n 1 || true; }
runtime_process_alive(){
  local pid cmdline
  pid=$(runtime_pid); pid_alive "$pid" || return 1
  cmdline=$(ps -p "$pid" -o command= 2>/dev/null || true)
  case "$cmdline" in *"$SERVER"*"$SOCKET"*) return 0;; *) return 1;; esac
}
runtime_endpoint_available(){ health || { [ -S "$SOCKET" ] && runtime_process_alive; }; }
lock_stale(){
  local owner created now
  owner=$(cat "$START_LOCK/pid" 2>/dev/null || true); created=$(cat "$START_LOCK/created_at" 2>/dev/null || true); now=$(date +%s)
  if [ -z "$owner" ] || ! pid_alive "$owner"; then return 0; fi
  case "$created" in ''|*[!0-9]*) return 1;; esac
  [ $((now-created)) -gt 30 ]
}
release_own_lock(){ if [ -d "$START_LOCK" ] && [ "$(cat "$START_LOCK/pid" 2>/dev/null || true)" = "$$" ]; then rm -rf "$START_LOCK"; fi; }
acquire_start_lock(){
  local tries=0 owner=""
  while ! mkdir "$START_LOCK" 2>/dev/null; do
    owner=$(cat "$START_LOCK/pid" 2>/dev/null || true)
    if lock_stale; then rm -rf "$START_LOCK" 2>/dev/null || true; continue; fi
    if runtime_endpoint_available; then return 1; fi
    tries=$((tries+1))
    if [ "$tries" -ge 50 ]; then
      owner=$(cat "$START_LOCK/pid" 2>/dev/null || true)
      if lock_stale; then rm -rf "$START_LOCK" 2>/dev/null || true; tries=0; continue; fi
      return 1
    fi
    sleep 0.02
  done
  printf '%s\n' "$$" > "$START_LOCK/pid"
  date +%s > "$START_LOCK/created_at"
  return 0
}
ensure_runtime(){
  if runtime_endpoint_available; then return 0; fi
  if acquire_start_lock; then
    trap release_own_lock EXIT INT TERM
    rm -f "$SOCKET"
    SPEC_RAIL_RUNTIME_IDLE_MS=${SPEC_RAIL_RUNTIME_IDLE_MS:-900000} nohup node "$SERVER" --root "$ROOT" --socket "$SOCKET" --meta "$META" </dev/null >/dev/null 2>&1 &
    local tries=0
    until health; do tries=$((tries+1)); if [ "$tries" -gt 100 ]; then release_own_lock; trap - EXIT INT TERM; return 1; fi; sleep 0.02; done
    release_own_lock; trap - EXIT INT TERM
    return 0
  fi
  local tries=0
  until runtime_endpoint_available; do tries=$((tries+1)); [ "$tries" -gt 100 ] && return 1; sleep 0.02; done
}

if [ "$CMD" = "runtime-status" ]; then
  if health; then curl -fsS --unix-socket "$SOCKET" http://specrail/v1/health; elif runtime_process_alive; then printf '{"ok":true,"runtime":"busy","pid":%s,"buildId":"%s"}\n' "$(runtime_pid)" "$BUILD_ID"; else printf '{"ok":false,"runtime":"stopped","buildId":"%s"}\n' "$BUILD_ID"; fi
  exit 0
fi
if [ "$CMD" = "runtime-stop" ]; then
  if health; then curl -fsS --unix-socket "$SOCKET" -X POST http://specrail/v1/shutdown; else printf '{"ok":true,"runtime":"already-stopped","buildId":"%s"}\n' "$BUILD_ID"; fi
  exit 0
fi
ensure_runtime || exec node "$CLI" "$@"

REQUEST_TIMEOUT_SECONDS=${SPEC_RAIL_RUNTIME_REQUEST_TIMEOUT_SECONDS:-180}
CURL_ARGS=(--silent --show-error --max-time "$REQUEST_TIMEOUT_SECONDS" --unix-socket "$SOCKET" -X POST http://specrail/v1/execute --data-urlencode "cwd=$PWD")
# The resident process must preserve per-invocation CLI semantics. Pass only the
# environment keys SpecRail itself reads; do not serialize the caller's full environment.
ENV_KEYS=(AI_FLOW_CODEGRAPH_COMMAND AI_FLOW_SESSION_ID CODEX_THREAD_ID CODEX_SESSION_ID CHATGPT_THREAD_ID AI_FLOW_HOME SPEC_RAIL_HOST SPEC_RAIL_PACKAGE_ROOT HOME PATH)
for key in "${ENV_KEYS[@]}"; do CURL_ARGS+=(--data-urlencode "env=$key=${!key-}"); done
for value in "${REQUEST_ARGS[@]}"; do CURL_ARGS+=(--data-urlencode "arg=$value"); done
TMP="$RUNTIME_DIR/.specrail-response-$$"
trap 'rm -f "$TMP"' EXIT INT TERM
set +e
HTTP=$(curl "${CURL_ARGS[@]}" -o "$TMP" -w '%{http_code}')
CURL_STATUS=$?
set -e
if [ "$CURL_STATUS" -eq 28 ]; then
  printf 'specrail: resident runtime request timed out after %ss; command was not retried because it may have mutated state: %s\n' "$REQUEST_TIMEOUT_SECONDS" "$*" >&2
  exit 124
fi
if [ "$CURL_STATUS" -ne 0 ]; then
  cat "$TMP" >&2
  printf 'specrail: resident runtime transport failed (curl exit %s); command was not retried automatically: %s\n' "$CURL_STATUS" "$*" >&2
  exit "$CURL_STATUS"
fi
case "$HTTP" in
  2*) cat "$TMP"; exit 0;;
  409) rm -f "$SOCKET"; exec node "$CLI" "$@";;
  *) cat "$TMP" >&2; exit 1;;
esac