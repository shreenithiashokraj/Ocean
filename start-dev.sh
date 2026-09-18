#!/usr/bin/env bash
# Self-daemonizing launcher for the Next.js dev server.
# Double-forks to fully detach from the controlling shell so it survives
# after the launching Bash tool session ends.
cd /home/z/my-project
rm -f dev.log dev.pid
nohup ./node_modules/.bin/next dev -p 3000 >> dev.log 2>&1 &
DEV_PID=$!
disown $DEV_PID 2>/dev/null
# Write pidfile for later management
echo $DEV_PID > dev.pid
# Give it a moment to fork the actual next process, then exit launcher
sleep 1
exit 0
