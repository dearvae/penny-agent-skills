#!/bin/bash
# 渲三种片尾版式的静帧给学员挑（用他自己的头像和姓名）。
#   bash scripts/ending-previews.sh <形象照路径> "<姓名>" "<英文名>" "<行动句>" "<联系方式>" [风格id]
# 产物：out/ending-previews/{card,namecard,photo}.png
set -e
cd "$(dirname "$0")/.."
PHOTO="$1"; NAME="${2:-你的名字}"; NAME_EN="${3:-}"; CTA="${4:-有问题，随时找我聊}"; CONTACT="${5:-}"; STYLE="${6:-classic}"
mkdir -p public/newlaunch/_preview out/ending-previews
if [ -n "$PHOTO" ] && [ -f "$PHOTO" ]; then
  ffmpeg -y -v error -i "$PHOTO" -vf "scale='min(1400,iw)':-2" public/newlaunch/_preview/headshot.jpg
  PHOTO_JSON='"photo":"headshot.jpg",'
else
  PHOTO_JSON=''
fi
PROPS=$(python3 -c "import json,sys;print(json.dumps({'styleId':sys.argv[1],'signoff':{'name':sys.argv[2],'nameEn':sys.argv[3],'cta':sys.argv[4],'contact':sys.argv[5],**({'photo':'headshot.jpg'} if sys.argv[6]=='1' else {})}},ensure_ascii=False))" "$STYLE" "$NAME" "$NAME_EN" "$CTA" "$CONTACT" "$([ -n "$PHOTO_JSON" ] && echo 1 || echo 0)")
for l in card namecard photo; do
  npx remotion still "EndingPreview-$l" "out/ending-previews/$l.png" --frame=70 --props="$PROPS" --log=error
  echo "✅ out/ending-previews/$l.png"
done
