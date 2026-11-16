#!/bin/sh
# 用 Netlify CLI 部署构建好的静态产物（跳过 build），输出 deploy 元数据 JSON。
# 用法: NETLIFY_AUTH_TOKEN=xxx sh tool/netlify_deploy.sh <site> <static-dir> <out.json>
set -e
SITE="$1"
DIR="$2"
OUT="$3"
cd "$DIR"
netlify deploy --site "$SITE" --dir . --no-build --json --prod > "$OUT"
cat "$OUT"
