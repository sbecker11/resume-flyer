#!/bin/zsh
# Stop this repo's local resume-flyer dev processes, then start
# `node scripts/start-dev.mjs` in the background. Other apps (and other
# checkouts) are left alone. Logs: logs/local-dev.log
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$ROOT/logs/local-dev.log"

belongs_to_this_app() {
  local cmd="$1"
  local pid="$2"
  case "$cmd" in
    *cursor-agent*|*extension-host*|*Cursor\ Helper*|*"restart-local.sh"*)
      return 1
      ;;
  esac
  case "$cmd" in
    *"$ROOT/server.mjs"*|*"$ROOT/scripts/start-dev.mjs"*)
      return 0
      ;;
  esac
  # Relative `node scripts/start-dev.mjs` does not contain $ROOT, so it is
  # included here and then limited to this checkout by cwd.
  case "$cmd" in
    *vite*|*nodemon*|*"server.mjs"*|*"scripts/start-dev.mjs"*|*"npm run dev"*|*"npm run start"*|*"npm run node-server"*|*"scripts/open-app.mjs"*)
      ;;
    *)
      return 1
      ;;
  esac
  local cwd
  cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | awk '/^n/ { sub(/^n/, ""); print; exit }')"
  [[ "$cwd" == "$ROOT" || "$cwd" == "$ROOT/"* ]]
}

# Desktop `do shell script` uses PATH=/usr/bin:/bin:/usr/sbin:/sbin and does not
# load ~/.zshrc, so the nvm `node` function is missing and `nohup node` exits
# immediately with "node: No such file or directory".
ensure_node_on_path() {
  if command -v node >/dev/null 2>&1 && command -v npx >/dev/null 2>&1; then
    return 0
  fi

  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [[ -s "$NVM_DIR/nvm.sh" ]]; then
    set +u
    # shellcheck disable=SC1091
    source "$NVM_DIR/nvm.sh" --no-use
    if ! nvm use default --silent >/dev/null 2>&1; then
      local latest
      latest="$(ls -1 "$NVM_DIR/versions/node" 2>/dev/null | tail -1 || true)"
      if [[ -n "${latest:-}" ]]; then
        nvm use "$latest" --silent >/dev/null 2>&1 || true
      fi
    fi
    set -u
  fi

  if command -v node >/dev/null 2>&1 && command -v npx >/dev/null 2>&1; then
    return 0
  fi

  local dir
  for dir in /opt/homebrew/bin /usr/local/bin; do
    if [[ -x "$dir/node" && -x "$dir/npx" ]]; then
      export PATH="$dir:$PATH"
      return 0
    fi
  done

  echo "Could not find node (nvm, /opt/homebrew/bin, or /usr/local/bin). resume-flyer was not started." >&2
  exit 1
}

typeset -a victims
while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  local_pid="${line%% *}"
  local_cmd="${line#"$local_pid"}"
  local_cmd="${local_cmd#"${local_cmd%%[![:space:]]*}"}"
  if belongs_to_this_app "$local_cmd" "$local_pid"; then
    victims+=("$local_pid")
  fi
done < <(ps -axww -o pid=,command= | sed 's/^ *//')

if (( ${#victims} )); then
  echo "Stopping resume-flyer pids: ${victims[*]}"
  kill -TERM "${victims[@]}" 2>/dev/null || true
  for _ in {1..20}; do
    typeset -a alive
    alive=()
    for pid in "${victims[@]}"; do
      if kill -0 "$pid" 2>/dev/null; then
        alive+=("$pid")
      fi
    done
    (( ${#alive} == 0 )) && break
    sleep 0.25
  done
  for pid in "${victims[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      echo "Force-stopping pid $pid"
      kill -KILL "$pid" 2>/dev/null || true
    fi
  done
else
  echo "No local resume-flyer instance is running."
fi

if [[ "${1:-}" == "--stop-only" ]]; then
  exit 0
fi

ensure_node_on_path
echo "Starting a new resume-flyer instance with $(command -v node) ($(node -v))."
mkdir -p -- "$ROOT/logs" || {
  echo "Could not create $ROOT/logs, so resume-flyer was not started." >&2
  exit 1
}
{
  printf '\n===== %s starting node scripts/start-dev.mjs =====\n' "$(date '+%Y-%m-%d %H:%M:%S')"
} >>"$LOG"

# Detach so a Desktop applet's `do shell script` can exit without SIGHUP
# stopping the servers. NO_HUP and disown keep zsh from signaling the job;
# nohup ignores hangup on the node process itself.
cd "$ROOT" || {
  echo "Could not cd to $ROOT, so resume-flyer was not started." >&2
  exit 1
}
setopt NO_HUP
nohup node scripts/start-dev.mjs >>"$LOG" 2>&1 </dev/null &
pid=$!
disown "$pid" 2>/dev/null || true

sleep 0.4
if ! kill -0 "$pid" 2>/dev/null; then
  echo "resume-flyer exited during startup. Log: $LOG" >&2
  exit 1
fi
echo "Started resume-flyer pid $pid. Log: $LOG"
