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

echo "同步完成。检查改动：git diff --stat"
