#!/bin/bash
# Reclaim :3000 before the server tries to bind it.
#
# This is `deploy.sh`'s port check, moved to where it is actually needed. That
# one runs on deploys; this one runs on EVERY start, including the 3am
# `Restart=always` one — which is the start that was failing. A hand-run
# `npm start` in the repo is all it takes to squat the port, and the shape of
# the failure is nasty: systemd's instance cannot bind, restarts, cannot bind,
# and spins. On 2026-08-20 it had spun 4,580 times while the site answered 200
# the whole way, served by the squatter — so nothing looked wrong from outside
# until the squatter's shell closed.
#
# Runs as `ubuntu` under the unit's sandbox, so no `sudo` (NoNewPrivileges
# blocks setuid anyway). That is a feature, not a shortfall: the documented
# failure is always an ubuntu-owned dev server, and a script that can only kill
# its own user's processes cannot go wrong in an interesting way.
#
# Always exits 0. A port this cannot clear must surface as the server's own
# EADDRINUSE, not as a confusing ExecStartPre failure.
set -u
PORT="${PORT:-3000}"

busy=$(ss -tlnH "sport = :$PORT" 2>/dev/null)
[ -z "$busy" ] && exit 0

pids=$(ss -tlnpH "sport = :$PORT" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u)

if [ -z "$pids" ]; then
  # The socket is there but its owner is not ours to see — a root or other-user
  # process. Nothing to do but say so; the bind will fail and the journal will
  # now explain why instead of just repeating EADDRINUSE.
  echo "port :$PORT is held by a process this unit cannot see (not owned by ubuntu)" >&2
  exit 0
fi

for pid in $pids; do
  # Anything systemd started is in the unit's cgroup and is systemd's to reap.
  # Killing it here would race the restart it is already performing.
  if grep -qs 'jipbap' "/proc/$pid/cgroup"; then continue; fi
  echo "reclaiming :$PORT from pid $pid: $(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null)" >&2
  kill "$pid" 2>/dev/null || true
done

# Give the listeners time to unbind. TIME_WAIT does not apply to a listening
# socket, so this is process teardown only and finishes fast.
for _ in 1 2 3 4 5 6 7 8 9 10; do
  [ -z "$(ss -tlnH "sport = :$PORT" 2>/dev/null)" ] && exit 0
  sleep 0.5
done

for pid in $pids; do
  grep -qs 'jipbap' "/proc/$pid/cgroup" && continue
  kill -0 "$pid" 2>/dev/null || continue
  echo "pid $pid ignored SIGTERM on :$PORT — sending SIGKILL" >&2
  kill -9 "$pid" 2>/dev/null || true
done
sleep 1
exit 0
