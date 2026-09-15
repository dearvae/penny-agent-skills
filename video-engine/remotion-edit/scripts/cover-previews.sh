#!/bin/bash
# 渲封面。两种用法：
#   挑版式（首次）：bash scripts/cover-previews.sh preview <slug> '<props.json>'      → out/cover-previews/{hero,split,plain,portrait}.png（1920）
#   正式出图：      bash scripts/cover-previews.sh render  <slug> '<props.json>' <layout> → public/newlaunch/<slug>/cover.png（首帧）+ cover_1440.png（小红书）
# props.json 例：{"styleId":"luxe","kicker":"THE SERRA","title":"永久地契\n只有133户","sub":"28 层 · 走路 8 分钟到地铁","image":"shots/tower.jpg","headshot":"shots/agent.png","name":"李岩","tag":"R0000000A"}
# image / headshot 是 public/newlaunch/<slug>/ 下的相对路径；挑版式时 slug 可用 _preview（先把图拷进 public/newlaunch/_preview/）。
set -e
cd "$(dirname "$0")/.."
MODE="$1"; SLUG="$2"; PROPS="$3"; LAYOUT="$4"
[ -z "$MODE" ] || [ -z "$SLUG" ] || [ -z "$PROPS" ] && { echo "用法见文件头部"; exit 1; }
P=$(python3 -c "import json,sys;d=json.loads(sys.argv[1]);d['slug']=sys.argv[2];print(json.dumps(d,ensure_ascii=False))" "$PROPS" "$SLUG")
if [ "$MODE" = "preview" ]; then
  mkdir -p out/cover-previews
  for l in hero split plain portrait; do
    npx remotion still "Cover-$l-1920" "out/cover-previews/$l.png" --props="$P" --log=error && echo "✅ out/cover-previews/$l.png"
  done
elif [ "$MODE" = "render" ]; then
  [ -z "$LAYOUT" ] && { echo "render 要给 layout（hero/split/plain/portrait）"; exit 1; }
  npx remotion still "Cover-$LAYOUT-1920" "public/newlaunch/$SLUG/cover.png" --props="$P" --log=error && echo "✅ public/newlaunch/$SLUG/cover.png（首帧 + 视频号）"
  npx remotion still "Cover-$LAYOUT-1440" "public/newlaunch/$SLUG/cover_1440.png" --props="$P" --log=error && echo "✅ public/newlaunch/$SLUG/cover_1440.png（小红书）"
fi
