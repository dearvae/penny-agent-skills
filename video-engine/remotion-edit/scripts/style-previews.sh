#!/bin/bash
# 出 5 种视觉风格的样片，给学员建档时挑风格用。
#   bash scripts/style-previews.sh          # 一张对比图 + 5 条 12.5 秒样片（各配默认 BGM）
#   bash scripts/style-previews.sh --sheet  # 只出对比图（几秒钟）
# 产物在 out/style-previews/
set -e
cd "$(dirname "$0")/.."
mkdir -p out/style-previews
npx remotion still StyleSheet out/style-previews/对比图.png --log=error
echo "✅ out/style-previews/对比图.png"
[ "$1" = "--sheet" ] && exit 0
for s in classic warm fresh luxe bold; do
  npx remotion render "StylePreview-$s" "out/style-previews/$s.mp4" --log=error
  echo "✅ out/style-previews/$s.mp4"
done
