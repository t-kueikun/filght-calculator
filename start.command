#!/bin/bash
cd -- "$(dirname -- "$0")" || exit 1
if ! command -v python3 >/dev/null 2>&1; then
  echo 'Python 3.10+ is required: https://www.python.org/downloads/'
  read -r -p 'Press Enter to close.'
  exit 1
fi
python3 launch.py
result=$?
if [ "$result" -ne 0 ]; then
  echo 'Startup failed. Check the error message above.'
  read -r -p 'Press Enter to close.'
fi
exit "$result"
