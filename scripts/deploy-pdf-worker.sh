#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../pdf-worker"
exec fly deploy
