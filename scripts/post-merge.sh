#!/bin/bash
set -e

npm install --no-audit --no-fund --legacy-peer-deps
# Clear Vite dep cache so stale pre-bundled deps don't cause 500 errors
rm -rf node_modules/.vite
