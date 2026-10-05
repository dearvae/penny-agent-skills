# Editing pipeline

## Contents

1. Media inspection
2. Transcription
3. Repetition handling
4. Shot indexing
5. Semantic edit plan
6. Remotion handoff
7. Picture-in-picture modes
8. Insufficient-footage fallback

## 1. Media inspection

Use `ffprobe` to capture duration, dimensions, rotation, frame rate, video codec, and audio streams. Apple MOV files may contain unsupported spatial-audio streams; select the normal AAC track explicitly with `-map 0:a:0`.

Create lightweight proxies for analysis when footage is 4K, HDR, HEVC, or 60 fps. Preserve originals for the final render.

## 2. Transcription

Optional first step for noisy rooms (timing unchanged, video stream-copied):

```bash
python3 scripts/audio_master.py clean INPUT.MOV ENGINE/public/vo/A.mp4 --strength medium
```

Then, per source:

```bash
python3 scripts/transcribe.py ENGINE/public/vo/A.mp4 --out work/A --glossary PROFILE/glossary.txt
```

| Output | Use |
|---|---|
| `transcript.raw.json` | immutable primary-engine output |
| `transcript.json` | glossary-corrected; `chars[]` = one entry per Chinese character / English word / number with start and end seconds; drives `snap_cuts.py` |
| `captions.json` | Remotion `Caption[]` per sentence |
| `suspicious.json`, `summary.txt` | spans two engines heard differently + low-confidence units, with context |

Engines (auto-picked in this order): FunASR Paraformer-zh (native character timestamps and hotwords, best for Chinese), mlx-whisper (Apple Silicon), whisper-cli. The cross-check runs a second engine, or a second Whisper model when only mlx is installed. Glossary terms are fed to every engine as hotwords / prompt, then known mishearings are replaced.

**Glossary** (`glossary.txt` beside the profile; one term per line, known mishearings after a colon):

```text
# estates, MRT stations, roads, agencies, the speaker's own name
碧山
组屋: 祖屋
落地窗: 落地穿, 落地川
CEA: C E A, 西一诶
```

Every suspicious span is resolved before captions are built: listen at the given second, fix the caption text, and add a new mishearing to the glossary so it is fixed automatically next time.

Convert captions to the Remotion `Caption` shape:

```ts
type Caption = {
  text: string;
  startMs: number;
  endMs: number;
  timestampMs: number | null;
  confidence: number | null;
};
```

## 3. Repetition handling

Classify every candidate before deleting:

- false start followed by a full sentence: delete the false start;
- repeated thought with a later corrected take: keep the latest complete take;
- rhetorical repetition used for emphasis: keep;
- same fact repeated far apart for structure: keep unless it harms pacing;
- uncertain case: retain and flag for review.

The edit decision list is the source of truth. Never overwrite the raw transcript.

### Cut edges

The agent chooses which words to keep; `scripts/snap_cuts.py` decides where each edge lands. For every in/out it finds the first/last kept unit, measures where the voice really starts and decays (ASR word edges are often 50–150 ms off), and picks the quietest frame-aligned point in the gap, aiming for ≈120 ms before the first word and ≈150 ms after the last. An edge placed inside a syllable is moved out of it. Edges with less than ~70 ms of silence to the neighbouring word are reported TIGHT (exit 1): listen to each; if the cut is audible, cut at a different sentence boundary instead. Paste the generated `vo: A@in+dur` lines into the Markdown script. The engine adds a one-frame half-volume ramp at both ends of every trimmed `vo:` segment to suppress clicks.

## 4. Shot indexing

For each visual source, record:

| Field | Meaning |
|---|---|
| source | Original filename |
| in/out | Exact usable range |
| subject | What is visibly present |
| motion | Pan, walk-through, static, shaky |
| quality | Exposure, focus, orientation |
| risks | Faces, phone numbers, unit numbers, mirrors |
| concepts | Narration ideas this shot can prove |

Mirrors and reflective surfaces require explicit privacy review.

`scripts/index_broll.py CLIP --out work/broll/NAME` produces the measurable columns:

| Output | Meaning |
|---|---|
| usable ranges | runs of ≥ 1 s with no blur / whip / dark sample, with mean blur (ffmpeg `blurdetect`, ~4–6 sharp, > 9 smeared), detail (Laplacian, info only: plain walls score low but are not blurry) and motion |
| rejected ranges | `whip` (blur + camera motion), `blur`, `dark` (mean luma < 35) |
| faces / people | macOS Vision face and human-body detection at 2 fps; anything listed needs privacy review |
| `sheet.jpg` | one frame every 2 s, time-labelled; red border rejected, orange people |

The agent fills `subject` and `concepts` from the sheet. Detection misses small mirror reflections and text such as unit numbers or car plates: inspect those on the sheet. A usable range that is `静止` (no motion) can still trip the freeze check when held long.

## 5. Semantic edit plan

Create one row per cleaned narration segment:

| Narration | Destination time | Visual source/time | Match reason | Confidence |
|---|---:|---|---|---:|

Prefer literal evidence, then contextual evidence, then the talking head. Flag unsupported claims rather than implying that nearby footage proves them.

## 6. Remotion handoff

Use `video-engine/remotion-edit/scripts/build-video.mjs` with the Markdown format documented in `video-engine/remotion-edit/SCRIPT_FORMAT.md`.

Current reliable primitives:

- `vo:` with source trims;
- `person:` for synchronized full-screen talking head;
- `broll:` with trim, duration, rate, and zoom;
- `captions:` with sentence or word timing;
- cards, titles, stats, and sound effects;
- `music: <id>` per segment (43-track library, gain-matched, crossfaded, auto-ducked under `vo:`; `music: none` for silence);
- `beat: true|N` and `pulse` for beat-synced montage cuts (beat grids in `public/music/bgm/beats/`);
- `fx:` / `trans:` (剪映-style: open, close, flash, shake, glitch, whip, zoom_through, wipe, vignette…) and `anim=` text entrances, each with a default sound effect (`nosfx` to mute).

Decision rules for all of these: `references/sound-and-fx.md`.

Engine behaviour the agent relies on rather than writes:

- **jump-cut zoom**: adjacent `person:` shots from the same `vo:` recording with a source-time gap alternate between the default framing and 1.1× (front-matter `jumpcut_zoom: false | <factor>`). Shots with an explicit `z` are left alone; the build log prints how many cuts were covered.
- **edge ramps**: trimmed `vo:` segments get a one-frame half-volume ramp at both ends.
- **QA clean render**: `--props '{"qaClean":true}'` renders the same composition without overlays, captions and top bar (used by `qa_layout.py`).
- **reference look**: front-matter `theme_ink / theme_accent / theme_highlight / theme_font` recolour cards, badges and number highlights; `caption_color / caption_highlight / caption_style (shadow|stroke|box|plain) / caption_box / caption_size / caption_bottom / caption_weight / caption_anim (pop|fade|slide|none)` restyle the captions. `learn_style.py` writes these lines from a sample video; without them the engine looks exactly as before.

Spoken numbers: `scripts/number_beats.py work/edl.snapped.json` lists each number in the kept text (money > area > percent > distance/time > rooms/duration > year), with a segment-relative `card:` / `tick:` line landing 0.1 s before the word. Comparison normalises Chinese numerals (四千九 → 4,900, 两房两卫 → 2房2卫); a number followed by 个月 / 年 / 房 is never treated as money. Syntax: `SCRIPT_FORMAT.md` sections 「配乐、换歌、卡点」 and 「特效与转场」.

Do not modify generated TSX. Change the Markdown script and rebuild it.

Before assigning a B-roll duration, verify that the selected source range contains enough relevant moving footage. AutoVideo may loop a media source when the requested duration exceeds it; never rely on that behavior because the loop can expose unrelated parts of the source.

## 7. Picture-in-picture modes

`full-screen` needs no matting. `pip-rectangle` needs a positioned video container and safe caption avoidance. `pip-cutout` requires temporal video matting; a PNG cutout from one frame cannot replace it because the mouth and body must continue moving.

Before promising `pip-cutout`, verify all of the following:

1. a video-matting tool or service exists;
2. the user authorized any cloud upload involved;
3. alpha or keyed output is readable by the renderer;
4. edge quality, hair detail, motion, and lip sync pass visual QA.

## 7b. 剪映 draft export (only when the user asked for it)

`scripts/export_jianying.py ENGINE ID --name NAME [--copy-media] [--drafts DIR]` turns the built composition into a 剪映专业版 draft (pyJianYingDraft). It finds the macOS draft folder (`~/Movies/JianyingPro/User Data/Projects/com.lveditor.draft`) or writes to `ENGINE/out/jianying/` with instructions to copy it in.

| 剪映 track | From | Editable |
|---|---|---|
| 画面 | every shot: same source in/out, speed, zoom, slow push-in / Ken Burns / punch as keyframes, jump-cut zoom | yes |
| 数据画面 (on 画面) | `stat` `bars` `breakdown` `timeline` `bullets` `title` `chat` rendered as short clips without overlays | move/trim only |
| 特效 | open 开幕, close 闭幕, shake 抖动, glitch 故障, flash 闪白, vignette 暗角, zoom_pulse 心跳 | yes |
| transitions | whip 竖向模糊, zoom_through 推近, fade_black 闪黑, wipe_in 向左擦除, slide_in 滑动, glitch_in 故障 | yes |
| 口播 / 配乐 / 音效 | voice cuts with edge fades; music per cue with crossfades and ducking keyframes; every sound effect | yes |
| 字幕 / 字卡 / 大字 / 角标 / 印章 / 顶栏 | captions and overlay text with 剪映 entrance animations (打字机, 弹入, 向上滑动, 模糊, 向上翻转) | yes |

Not reproduced: engine card styling and rolling numbers (text keeps its content, not its look), the hook scrim, beat pulse, room tone, the Penny ending. The script prints a `note:` for each one it meets. Time: the draft takes well under a second; each data screen adds one short render (~7 s for 5.5 s of screen). Media is linked from the engine folder unless `--copy-media`.

Checked without 剪映 installed: the draft's main-track cut points and source ranges match the render frame-for-frame (best-match offset 0 on every textured shot); opening it in 剪映 itself must be confirmed on the user's machine the first time.

## 8. Insufficient-footage fallback

Never manufacture coverage with a cloned last frame or long freeze. Never use `tpad=stop_mode=clone` for editorial duration padding. Resolve a coverage gap in this order:

1. split the narration across two or more relevant moving shots;
2. select another non-overlapping range that supports the same statement;
3. return to the synchronized speaker;
4. use a relevant factual graphic or card;
5. leave the talking head on screen and flag the missing B-roll.

Keep a coverage table with narration duration, total usable matching footage, and the selected fallback. If usable footage is shorter than the narration, the plan is incomplete until a fallback is assigned.

Before rendering, run the plan gate on the built data:

```bash
python3 scripts/plan_gate.py ENGINE/src/generated/ID.tsx --mode talk      # or tour / montage
```

| Check | talk | tour | montage |
|---|---|---|---|
| longest stretch without a visual event (shot change, overlay, effect, zoom step) | 8 s | 12 s | 4 s |
| text cards / data screens on screen (captions excluded) | ≤ 60 % | ≤ 60 % | ≤ 70 % |
| sound effects per minute (warning) | 8 | 8 | — |
| shake / glitch / flash / pulse | allowed with a reason | fail | allowed |

It also fails > 1 entry transition or > 2 mid-segment effects per segment, the same effect on three segments in a row, and shots shorter than 0.3 s; it warns on effects in consecutive segments and cards holding more than ~7 characters per second. Fix the Markdown and rebuild; never edit the generated TSX.

After rendering, run:

```bash
python3 scripts/audio_master.py master OUTPUT.mp4 OUTPUT.master.mp4      # −14 LUFS, TP −1.5 dBTP
python3 scripts/verify_output.py OUTPUT.master.mp4 --edl work/edl.snapped.json --glossary PROFILE/glossary.txt
python3 scripts/check_freezes.py OUTPUT.master.mp4
python3 scripts/qa_layout.py ENGINE ID OUTPUT.master.mp4 --platform channels   # or xhs / both
```

`qa_layout.py` renders a half-scale clean copy, treats edges present only in the final frame as the overlay layer (so scrims and vignettes do not count), and needs a hit on two consecutive samples before it reports one. It fails when an overlay covers more than 15 % of the speaker's eyes or mouth region, or more than 2 % of the platform's right action column / bottom text area; the top status band is a warning. Zones are estimates for 1080×1920: confirm near-misses on a phone.

`verify_output.py` re-transcribes the render and compares it with the kept segment text (numbers are compared as values, so 四千九 = 4,900). It fails on an audible removed take, a phrase heard twice that the plan does not repeat, similarity < 0.85, or loudness off target; diff spans in between are listed for a human glance (render ASR is itself imperfect).

The check examines a central image region to avoid captions and bottom-corner picture-in-picture overlays masking a frozen background. A non-zero exit blocks completion. Review the reported timestamps visually; rerender with moving coverage rather than suppressing the check. Only allow a flagged still when the user explicitly requested it, and document that exception in the delivery matrix.
