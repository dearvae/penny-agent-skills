#!/usr/bin/env bash
#
# make-sfx.sh — 用 ffmpeg 合成滤镜自制无版权音效库
#
#   bash scripts/make-sfx.sh            # 全部重生成
#   bash scripts/make-sfx.sh whoosh1    # 只重生成指定的几个
#
# 全部音效都是纯合成（sine / anoisesrc / aevalsrc + afade / aecho / flanger），
# 不下载任何网络音频，可重复跑，结果稳定。
#
# 风格跟工程里的 ding.wav 对齐：暖、短、不刺耳，高频统统 lowpass 削过。
#
# 响度：先量 EBU R128 整合响度（补静音到 3s 再量），再算一个纯线性增益推到
# -16 LUFS；如果这个增益会让真峰超过 -1.0 dBTP，就改用峰值约束（取两者较小
# 的增益）。这样短音效不会被硬推爆，也不需要压限器去挤，听感更干净。
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/public/sfx"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

SR=44100
TARGET_I=-16.0   # LUFS
TP_CEIL=-1.0     # dBTP

FF=(ffmpeg -hide_banner -loglevel error -y)

mkdir -p "$OUT"

# 只跑指定音效
WANT=("$@")
want() {
  [ ${#WANT[@]} -eq 0 ] && return 0
  local n
  for n in "${WANT[@]}"; do [ "$n" = "$1" ] && return 0; done
  return 1
}

ALL=()

# raw <name> <dur> — 收尾：去直流、掐头去尾防爆音
tail_fx() {
  local d="$1"
  echo "highpass=f=28,afade=t=in:st=0:d=0.004,afade=t=out:st=$(awk -v d="$d" 'BEGIN{printf "%.4f", d-0.025}'):d=0.025,aformat=sample_fmts=fltp:channel_layouts=stereo:sample_rates=$SR"
}

# ── 1. whoosh ×3（转场）────────────────────────────────────────────
# 粉噪声劈成两路带通，一路 700Hz 一路 3.2kHz，交叉淡化 = 扫频感；
# flanger 给一点流动的相位味道。

whoosh() { # name dur f_from f_to shape echo
  local name="$1" d="$2" f1="$3" f2="$4" shape="$5" ech="$6"
  local post=""
  [ "$ech" = "1" ] && post="aecho=0.8:0.6:14:0.18,"
  "${FF[@]}" -f lavfi -i "anoisesrc=c=pink:r=$SR:d=$d:a=0.85" \
    -filter_complex "\
[0:a]asplit=2[a][b];\
[a]bandpass=f=$f1:width_type=o:w=2.4,volume='1-min(1\,t/$d)':eval=frame[lo];\
[b]bandpass=f=$f2:width_type=o:w=2.4,volume='min(1\,t/$d)':eval=frame[hi];\
[lo][hi]amix=inputs=2:normalize=0,\
flanger=delay=4:depth=3:speed=1.6,\
lowpass=f=7000,\
volume='pow(sin(PI*min(1\,t/$d))\,$shape)':eval=frame,\
${post}$(tail_fx "$d")[out]" \
    -map "[out]" "$TMP/$name.wav"
}

want whoosh1 && whoosh whoosh1 0.28 600 3400 1.10 0   # 短·上扬，快切用
ALL+=(whoosh1)
want whoosh2 && whoosh whoosh2 0.45 3200 700 1.30 0   # 中·下坠，换场用
ALL+=(whoosh2)
want whoosh3 && whoosh whoosh3 0.75 400 4200 1.60 1   # 长·上扬带空间，开场/大揭晓
ALL+=(whoosh3)

# ── 2. pop（元素弹出）──────────────────────────────────────────────
# 频率从 1.2k 指数滑落的小啵一声 + 一层低八度做身体。
if want pop; then
"${FF[@]}" -f lavfi -i "aevalsrc=exprs='\
(sin(2*PI*(1200/13)*(1-exp(-13*t)))*exp(-14*t)\
+0.38*sin(2*PI*(520/13)*(1-exp(-13*t)))*exp(-11*t))*0.8':s=$SR:d=0.18" \
  -af "lowpass=f=6000,$(tail_fx 0.18)" "$TMP/pop.wav"
fi
ALL+=(pop)

# ── 3. tick / count（数字跳动）────────────────────────────────────
# tick：2.4k 极短脆响，给 CountUp 每次进位。
if want tick; then
"${FF[@]}" -f lavfi -i "aevalsrc=exprs='\
(sin(2*PI*2400*t)*exp(-55*t)+0.45*sin(2*PI*3600*t)*exp(-72*t))*0.75':s=$SR:d=0.15" \
  -af "lowpass=f=7500,$(tail_fx 0.15)" "$TMP/tick.wav"
fi
ALL+=(tick)

# count：比 tick 暖一档，逐行拆价、逐条弹出时用。
if want count; then
"${FF[@]}" -f lavfi -i "aevalsrc=exprs='\
(sin(2*PI*1180*t)*exp(-26*t)+0.35*sin(2*PI*2360*t)*exp(-42*t))*0.75':s=$SR:d=0.22" \
  -af "lowpass=f=6500,$(tail_fx 0.22)" "$TMP/count.wav"
fi
ALL+=(count)

# ── 4. swipe（滑动切镜）──────────────────────────────────────────
# 比 whoosh 更干更短，高频噪声瞬起快落，像手指划过。
if want swipe; then
"${FF[@]}" -f lavfi -i "anoisesrc=c=white:r=$SR:d=0.22:a=0.8" \
  -af "\
highpass=f=1400,lowpass=f=9000,\
volume='min(1\,t*50)*exp(-11*t)':eval=frame,\
$(tail_fx 0.22)" "$TMP/swipe.wav"
fi
ALL+=(swipe)

# ── 5. impact_soft（强调重点，低频闷击）──────────────────────────
# 90→55Hz 的下坠正弦 + 一层二次谐波（手机小喇叭也听得见）+ 一点低通噪声做冲击。
if want impact_soft; then
"${FF[@]}" -f lavfi -i "aevalsrc=exprs='\
(sin(2*PI*(92/9)*(1-exp(-9*t)))*exp(-6.5*t)\
+0.30*sin(2*PI*(184/9)*(1-exp(-9*t)))*exp(-9*t))*0.85':s=$SR:d=0.55" \
  -f lavfi -i "anoisesrc=c=brown:r=$SR:d=0.55:a=0.5" \
  -filter_complex "\
[1:a]lowpass=f=420,volume='exp(-28*t)':eval=frame[thump];\
[0:a][thump]amix=inputs=2:normalize=0,\
aecho=0.9:0.55:22:0.12,lowpass=f=2200,\
$(tail_fx 0.55)[out]" \
  -map "[out]" "$TMP/impact_soft.wav"
fi
ALL+=(impact_soft)

# ── 6. coin / cash（讲钱、讲回报率）──────────────────────────────
# 金属泛音列（1318/1975/2637/3520），衰减快 = 硬币叮当。
COIN_STRIKE='(sin(2*PI*1318*t)*exp(-20*t)+0.62*sin(2*PI*1975*t)*exp(-25*t)+0.40*sin(2*PI*2637*t)*exp(-31*t)+0.22*sin(2*PI*3520*t)*exp(-38*t))*0.42'

# coin：单枚，短。
if want coin; then
"${FF[@]}" -f lavfi -i "aevalsrc=exprs='$COIN_STRIKE':s=$SR:d=0.35" \
  -af "lowpass=f=9000,$(tail_fx 0.35)" "$TMP/coin.wav"
fi
ALL+=(coin)

# cash：三连击（0 / 65ms / 140ms），第二三下略移调，一小把硬币落下的感觉。
if want cash; then
"${FF[@]}" -f lavfi -i "aevalsrc=exprs='$COIN_STRIKE':s=$SR:d=0.6" \
  -f lavfi -i "aevalsrc=exprs='$(echo "$COIN_STRIKE" | sed 's/\*0\.42/*0.34/')':s=$SR:d=0.6" \
  -f lavfi -i "aevalsrc=exprs='$(echo "$COIN_STRIKE" | sed 's/\*0\.42/*0.28/')':s=$SR:d=0.6" \
  -filter_complex "\
[0:a]atempo=1.0[c0];\
[1:a]asetrate=$((SR*112/100)),aresample=$SR,adelay=65:all=1[c1];\
[2:a]asetrate=$((SR*93/100)),aresample=$SR,adelay=140:all=1[c2];\
[c0][c1][c2]amix=inputs=3:normalize=0,\
aecho=0.9:0.5:30:0.1,lowpass=f=9500,\
atrim=0:0.6,$(tail_fx 0.6)[out]" \
  -map "[out]" "$TMP/cash.wav"
fi
ALL+=(cash)

# ── 7. error_buzz（讲"错误认知 / 踩坑"）─────────────────────────
# 150Hz 方波味的两声短促蜂鸣，30Hz 振幅抖动；lowpass 1600 压掉刺耳的高次谐波。
if want error_buzz; then
"${FF[@]}" -f lavfi -i "aevalsrc=exprs='\
(sin(2*PI*150*t)+0.5*sin(2*PI*300*t)+0.26*sin(2*PI*450*t))\
*(0.58+0.42*sin(2*PI*30*t))\
*(max(0\,min(1\,(t-0.0)/0.012))*max(0\,min(1\,(0.14-t)/0.03))\
 +max(0\,min(1\,(t-0.20)/0.012))*max(0\,min(1\,(0.38-t)/0.05)))*0.30':s=$SR:d=0.40" \
  -af "lowpass=f=1600,$(tail_fx 0.40)" "$TMP/error_buzz.wav"
fi
ALL+=(error_buzz)

# ── 响度归一 ─────────────────────────────────────────────────────
measure() { # file -> "I TP"
  ffmpeg -hide_banner -nostats -i "$1" \
    -af "apad=whole_dur=3,ebur128=peak=true" -f null - 2>&1 |
  awk '
    /Integrated loudness:/ {sec="I"}
    /True peak:/           {sec="P"}
    sec=="I" && $1=="I:"    {i=$2}
    sec=="P" && $1=="Peak:" {p=$2}
    END {printf "%s %s", (i==""?"-70":i), (p==""?"-70":p)}
  '
}

printf "%-13s %7s %7s %8s %8s %8s\n" name dur gain_dB "I_LUFS" "TP_dBFS" bound
for name in "${ALL[@]}"; do
  src="$TMP/$name.wav"
  [ -f "$src" ] || continue
  read -r I TP <<<"$(measure "$src")"
  read -r GAIN BOUND <<<"$(awk -v i="$I" -v p="$TP" -v ti="$TARGET_I" -v tp="$TP_CEIL" \
    'BEGIN{gi=ti-i; gp=tp-p; if (gp<gi) printf "%.2f peak", gp; else printf "%.2f lufs", gi}')"
  "${FF[@]}" -i "$src" \
    -af "volume=${GAIN}dB,aformat=sample_fmts=s16:channel_layouts=stereo:sample_rates=$SR" \
    "$OUT/$name.wav"
  read -r I2 TP2 <<<"$(measure "$OUT/$name.wav")"
  D=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$OUT/$name.wav")
  printf "%-13s %7.3f %7s %8s %8s %8s\n" "$name" "$D" "$GAIN" "$I2" "$TP2" "$BOUND"
done

echo
echo "→ $OUT"
