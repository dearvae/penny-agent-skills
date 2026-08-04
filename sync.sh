#!/bin/bash
# 把本机 .claude/skills/ 里的最新版同步到这个分发仓库（排除档案和客户数据）。
# 用法：./sync.sh 然后 git diff 看一眼，再 commit + push。
set -e
cd "$(dirname "$0")"
SRC="../.claude/skills"

rsync -a --delete --exclude='references/profiles/' --exclude='.DS_Store' \
  "$SRC/agent-shot/" agent-shot/
mkdir -p agent-shot/references/profiles
cp "$SRC/agent-shot/references/profiles/README.md" agent-shot/references/profiles/

rsync -a --delete --exclude='references/clients/' --exclude='.DS_Store' \
  "$SRC/newlaunch-shot/" newlaunch-shot/

rsync -a --delete --exclude='__pycache__' --exclude='.DS_Store' \
  ../skills/propnex-forms/ propnex-forms/

rsync -a --delete --exclude='.DS_Store' \
  "$HOME/.claude/skills/pg-cobroke/" pg-cobroke/

echo "同步完成。检查改动：git diff --stat"

# ── video-engine 模板：从工作目录同步引擎本体 ──
# 模板自有文件（Root.tsx / newsIndex / newlaunchIndex / generated/index.ts /
# scripts/demo.md / README.md / .env.minimax.example）不在同步范围，不会被冲掉。
RE=../remotion-edit
for f in AutoVideo.tsx Ending.tsx ProgressCheck.tsx theme.ts sfx.ts WordCaptions.tsx DataAnim.tsx \
         NewsVideo.tsx NewsEnding.tsx NewLaunchVideo.tsx NewLaunchEnding.tsx index.css index.ts; do
  cp "$RE/src/$f" video-engine/remotion-edit/src/
done
rsync -a --exclude='*.md' --exclude='vo/' --exclude='__pycache__' \
  "$RE/scripts/" video-engine/remotion-edit/scripts/
cp "$RE/SCRIPT_FORMAT.md" "$RE/package.json" "$RE/package-lock.json" \
   "$RE/tsconfig.json" "$RE/remotion.config.ts" video-engine/remotion-edit/
rsync -a --delete "$RE/public/sfx/" video-engine/remotion-edit/public/sfx/
rsync -a --delete "$RE/public/music/" video-engine/remotion-edit/public/music/
rsync -a --exclude='.env.minimax' --exclude='__pycache__' --exclude='output/' \
  --exclude='assets/' --exclude='.venv*' --include='*.py' --exclude='*' \
  ../news-pipeline/ video-engine/news-pipeline/
