#!/usr/bin/env bash
# Firefox and WebKit for the guest projects of playwright.config.ts, with the system libraries they need
set -euo pipefail
cd "$(dirname "$0")/../apps/texpile-editor"
pnpm exec playwright install --with-deps firefox webkit
