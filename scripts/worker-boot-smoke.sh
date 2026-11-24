#!/usr/bin/env bash
# The production image copies only .output (no node_modules) and runs
# `node .output/voice-worker/index.mjs` and `node .output/parser-worker/index.mjs`.
# Prove both bundles boot on their own: copy each into an empty directory, start
# it with throwaway env, and require its startup line. Run after `bun run build`.
#
# The web bundle gets the same treatment plus two static checks:
#  - apps/web/src/boot.ts is imported for side effects only, and the app's
#    package.json keeps everything else tree-shakable — if the boot exception
#    (`"sideEffects": ["./src/boot.ts"]`) is ever dropped, rolldown silently
#    removes the kernel/alert-mailer/SLO registrations from the build. Grep the
#    built bundle for a boot-only literal ("slo-alert:") to fail loudly.
#  - the kernel/ai/observability load-once guards (map §5 rule 10) must exist
#    exactly once per bundle — a second copy would throw at boot (false split).
set -u
fail=0
rand() { head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n'; }

# exactly-once grep: pattern must occur N times in file (or dir tree)
expect_count() { # want, pattern, path...
  local want=$1 pattern=$2; shift 2
  local got
  got=$(grep -rho "$pattern" "$@" 2>/dev/null | wc -l | tr -d ' ')
  if [ "$got" != "$want" ]; then
    echo "::error::expected $want occurrence(s) of '$pattern', found $got in $*"; fail=1
  else
    echo "ok: '$pattern' x$want"
  fi
}

boot() { # name, output-dir, expected line, env...
  local name=$1 out=$2 want=$3; shift 3
  local dir log
  dir=$(mktemp -d)
  log="$dir/boot.log"
  cp -R "$out/." "$dir/"
  (cd "$dir" && env "$@" node -e \
    "setTimeout(()=>process.exit(0),8000);import('./index.mjs').catch(e=>{console.error(e);process.exit(1)})" \
    >"$log" 2>&1)
  if grep -qE "ERR_MODULE_NOT_FOUND|ERR_PACKAGE_IMPORT_NOT_DEFINED|Cannot find (package|module)" "$log" \
    || ! grep -q "$want" "$log"; then
    echo "::error::$name did not boot without node_modules"; cat "$log"; fail=1
  else
    echo "$name boots without node_modules"
  fi
  rm -rf "$dir"
}

boot voice-worker .output/voice-worker "voice_worker.started" \
  DATABASE_URL=postgres://127.0.0.1:1/none SESSION_SECRET="$(rand)" \
  SIP_SERVER=127.0.0.1 SIP_PORT=5060 SIP_USER=smoke SIP_PASSWORD="$(rand)" SIP_DOMAIN=smoke.invalid
boot parser-worker .output/parser-worker "parser worker listening" PARSER_TOKEN="$(rand)" PORT=0

# Web: boot.ts compiled in + one load-once guard per platform package, then boot.
if [ ! -f apps/web/.output/server/index.mjs ]; then
  echo "::error::apps/web/.output/server missing — run bun run build first"; fail=1
else
  expect_count 1 "slo-alert:" apps/web/.output/server/_ssr
  for pkg in kernel ai observability; do
    expect_count 1 "__atsPackageInstances?.\\[\"$pkg\"\\]" apps/web/.output/server/_ssr apps/web/.output/server/_chunks apps/web/.output/server/_libs apps/web/.output/server/*.mjs
  done
  boot web-server apps/web/.output/server "Listening on" \
    DATABASE_URL=postgres://127.0.0.1:1/none SESSION_SECRET="$(rand)" PORT=0
fi
exit $fail
