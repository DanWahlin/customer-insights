#!/usr/bin/env bash
set -euo pipefail

# Keep forwarded application and database ports private. The API has no
# internet-facing authentication and must never be made public by setup.
if [[ -n "${CODESPACE_NAME:-}" ]]; then
  gh codespace ports visibility 3000:private 4200:private 5432:private -c "$CODESPACE_NAME"
fi
