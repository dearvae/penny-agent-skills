---
name: agent-cut
description: 自拍素材剪辑线（学员版，和 agent-shot 成一对）：把用户自己拍的口播 + B-roll 素材剪成带字幕的竖屏成片——转写、去口误、只留最新一遍、按语义选镜、字幕、可选人物画中画，用 Remotion 渲染并做画面质检。保留他的真声和原意，不重写、不编镜头。触发词：「我拍了几段在 XX 文件夹，帮我剪」「剪辑这些素材」「去掉口误」「口播配 B-roll」「探房视频」「listing video」「按我的脚本结构剪」「agent cut」。**和 agent-shot 怎么分：用户手里有自己拍的视频素材（说了「拍了 / 素材 / 文件夹里的视频 / 剪 / 口误 / B-roll」）就走这里；只有选题、新闻、链接、图片而没有视频素材的走 agent-shot。两边都像就先问一句「是用你拍好的素材剪，还是零素材直接生成？」。**
---

# agent-cut · 自拍素材剪辑（学员版）

Turn existing spoken footage and supporting visuals into an editable, evidence-backed cut. Do not rewrite the speaker's meaning or invent shots.

## Prerequisites (check before every run; stop and fix any missing **required** item first)

| | Item | How to verify |
|---|---|---|
| Required | Machine setup prompt completed (Node, ffmpeg, a local ASR engine, Remotion pre-installed) | `ffmpeg -version` and `npx remotion versions` respond; `python3 -c "import sys; sys.path.insert(0,'scripts'); import asr_common as a; print(a.available_engines())"` lists at least one engine |
| Required | Python packages for the analysis scripts: `pip3 install --user numpy opencv-python pillow` (+ `mlx-whisper` on Apple Silicon) | `python3 -c "import numpy, cv2, PIL"` succeeds |
| Recommended | Second ASR engine for the cross-check: FunASR Paraformer for Chinese (`pip install funasr modelscope torch`), else mlx-whisper / whisper-cpp | the same command lists two engines (with only mlx, a second Whisper model is used) |
| Required | Engine installed: `remotion-edit/` with `node_modules` | `remotion-edit/node_modules` exists |
| Required | The user's own footage (talking-head clip + B-roll) in one folder this chat can read | `ffprobe` every file succeeds |
| Required | Profile: on-screen name, visual style | profile file exists with both fields |
| Recommended | Profile `glossary.txt`: estate / MRT / road / agency names and their known mishearings | file next to `profile.md`; format in `references/pipeline.md` §2 |
| Optional | The user's own script structure template (hook → points → CTA, segment count, on-camera or not) | if absent, derive structure from the footage |
| Optional | Reference video for pacing and caption style | if absent, use the engine defaults; if given, step 2 learns its look with `learn_style.py` (macOS) |
| Optional | Cloned voice | not needed: this line keeps the user's real recorded voice |
| Built in | Music (43 tracks with beat grids), 53 sound effects, 剪映-style effect kit | ship with the engine; nothing to collect from the user. Own music: `scripts/add-bgm.mjs` |
| Optional | Talking-head background removal / picture-in-picture | only if the user asks |
| Optional | `pip install pyJianYingDraft` for the 剪映 draft export | only when the user wants a 剪映 draft; drafts open in 剪映专业版 5.9–10.x (export of the final file needs Windows 剪映 if they edit further) |

## Captions: always one line

A caption is never allowed to wrap to two lines. Keep each caption ≤14 characters for Chinese (≤11 on `big` segments, ~7 words for English); if a phrase does not fit, split it into two consecutive captions at a natural pause instead of letting it wrap. After rendering, check frames: a two-line caption means the chunk is too long — re-chunk the transcript, do not shrink the font.

## Before cutting, ask in one message (platform + 剪映 draft)

Ask both open questions together so the user answers once:

1. **Platform** — if the user did not say, ask whether this goes to 视频号, 小红书, or both (rules below).
2. **剪映 draft** — "要不要同时出一份剪映草稿？成片不变，另外多一个能在剪映里接着改字幕、换镜头、调音乐的工程。" It costs under a second for the draft plus ~7 s per data screen (cost breakdowns, stat cards), so it never delays the cut noticeably — but it writes a project into their 剪映 draft list, so do not create one unasked. If the user already answered in this conversation or in their profile (`jianying_draft: yes|no`), do not ask again.

### Publishing platform (the platform changes the edit)

If the user did not say whether this goes to **WeChat Channels (视频号)** or **Xiaohongshu (小红书)** (or both), ask first. The rules differ: on Xiaohongshu no WeChat ID / phone number / QR code may appear in the picture, captions, overlays or copy (the most common cause of throttling or bans); Channels allows a text contact but no QR code. Investment-return promises, absolute superlatives, "学区房", and finance-risk words are banned on both and must be cut from the narration, not just flagged.
Full rules and the "platform self-check" to attach at delivery: `references/platforms.md`. If both platforms, deliver two versions (end-card contact, cover size, publishing copy differ).

## Core contract

1. Preserve the speaker's natural voice and intended meaning.
2. When the speaker restarts or repeats a thought, keep the latest complete take unless the user says otherwise.
3. Match visuals to what is being said at that moment. Prefer user-provided footage over stock.
4. Keep the talking head visible only when it adds trust or continuity; otherwise let relevant B-roll lead.
5. Never claim a capability was automatic when the agent made the decision manually.
6. Never publish. Deliver files for user review.
7. Never extend a moving shot by cloning its last frame, inserting a freeze frame, or silently looping into unrelated footage. A rendered segment must retain visible motion unless the user explicitly requested a still.
8. Music, sound effects and visual effects serve the speech. Music is chosen per emotional block and ducks under every spoken segment; each sound effect marks one visible event; effects and transitions are punctuation at turns the edit plan can name, never decoration.
9. **Default is no effects, no beat sync, no pulse.** Add an effect only when the script or the user asks for it, or when the edit plan names a specific reason at that exact moment. Never add one because the kit exists. A property viewing / unit tour (看房、探房) is watched to understand the home: no beat-following cuts, no pulse, no shake — the picture stays still and readable. Beat sync is reserved for montage sections with no narration (photo flash, feature reel), and only when the user wants that rhythm.

## Read first

- Read [references/pipeline.md](references/pipeline.md) before editing.
- Read [references/sound-and-fx.md](references/sound-and-fx.md) before scoring the cut (music per section, beat sync, sound effects, 剪映-style effects).
- Read [references/quality-gates.md](references/quality-gates.md) before rendering and again before delivery.
- If using the bundled Remotion engine, read its `SCRIPT_FORMAT.md` and the applicable Remotion best-practices instructions before changing or rendering code.

## Workflow

### 1. Inventory the inputs

Identify the reference video, primary talking-head clip, B-roll clips, target platform, aspect ratio, language, target duration, and any brand constraints. Probe every media file with `ffprobe`; do not trust filename extensions or display rotation.

If no explicit target is supplied, default to 1080×1920, 30 fps, original spoken language, and a duration driven by the cleaned narration.

### 2. Build a reference brief

When the user supplies a sample or reference video ("照这个风格剪"), learn its look before cutting:

1. `cd <engine> && python3 scripts/learn_style.py SAMPLE --out work/style/<name> --name <name>` measures caption position, size, colour, keyword highlight, stroke / box / shadow treatment and weight, the palette and accent colours, fixed labels, cuts per minute and median shot length, and loudness. It writes `style_brief.md` with ready front-matter lines for the edit script and contact sheets.
2. Read `captions.jpg` (font class: sans / serif / rounded; weight), `entry_*.jpg` (caption entrance: pop / fade / slide / none) and `cut_*.jpg` (transitions) and set the two judged lines (`theme_font`, `caption_anim`) yourself.
3. Paste the `theme_*` / `caption_*` lines into the script's front-matter (syntax: `SCRIPT_FORMAT.md` 「参考片风格」). Use the reference's median shot length as the B-roll rhythm unless the content (a viewing tour) needs longer holds; mirror its transition habit with `trans:` only where the edit plan can name the turn.
4. Learn style, not content: never copy the reference's account name, watermark, logo, catchphrases or wording. Fonts are limited to the three system families; say so if the reference uses a special typeface.

Also record its layout, talking-head treatment, music, and ending by watching it. Separate must-match requirements from optional style cues.

### 3. Transcribe before cutting

If the talking-head audio has room noise (aircon, traffic, echoey empty unit), clean it first and use the cleaned file as the `vo:` source: `python3 scripts/audio_master.py clean RAW.MOV <engine>/public/vo/A.mp4` (timing is unchanged). Listen to 10 s before and after; drop to `--strength light` if it sounds watery.

Transcribe every source with `python3 scripts/transcribe.py SOURCE --out work/<source> --glossary <profile>/glossary.txt`. It writes the immutable raw transcript, a glossary-corrected transcript with **per-character timestamps**, Remotion captions, and `suspicious.json`: every span where two ASR engines disagree plus low-confidence units. Resolve each suspicious span (listen, or ask the user) before captions are built; add newly found mishearings to the glossary so the next video gets them right. Create a separate edit transcript containing every proposed deletion and its reason.

Apply keep-the-latest-take logic to false starts, repeated clauses, restarts, and self-corrections. Do not delete pauses merely because they are quiet; keep pauses that carry emphasis or natural rhythm.

### 4. Build a reversible edit decision list

Record source clip, source in/out, destination in/out, transcript text, decision reason, and confidence for every retained segment, and every removed span with its text, in `work/edl.json` (format in `scripts/snap_cuts.py`). Choose in/out at word level from the character transcript; do not fine-tune the exact edge by hand.

Then run `python3 scripts/snap_cuts.py work/edl.json`. It moves every edge out of any syllable into the quiet gap beside the kept words (≈120 ms lead-in, ≈150 ms tail, on the frame grid) and writes `edl.snapped.json` plus ready-to-paste `vo: A@in+dur` lines. Exit 1 means some edge is **TIGHT** (the neighbouring word is less than ~70 ms away): listen to it, and if the cut is audible, move it to a different sentence boundary or keep the extra word. The snapped EDL is the one the Markdown script and the final check use. Use non-destructive Remotion trims; re-encode only when a standalone cleaned source is required.

### 5. Index the visuals

Run `python3 scripts/index_broll.py CLIP --out work/broll/<name>` for every B-roll clip. It measures blur (edge width, so plain walls are not mistaken for blur), whip pans, darkness and camera motion, lists usable and rejected ranges, flags frames with visible faces or people, and writes a time-labelled contact sheet. Read the sheet and fill the subject column of `index.md`: the script finds *where* footage is usable, the agent decides *what it shows*. Small mirror reflections and unit numbers are not reliably detected; check mirrors, windows and door plates on the sheet yourself. The finished inventory has precise time ranges, visible subject, movement, quality problems, privacy/compliance risks, and suitable narration concepts.

### 6. Match speech to visuals

Map each cleaned narration segment to the most literal available supporting shot. If no shot supports a claim, use the talking head or a neutral shot and flag the gap. Do not show a kitchen while discussing a bedroom merely to avoid repetition.

When a narration segment is longer than the matching footage, use this fallback order:

1. combine multiple semantically relevant moving shots;
2. use another distinct, relevant range from the source;
3. return to synchronized talking head, full-screen or in a verified picture-in-picture layout;
4. use a truthful title, map, floor plan, or information card when it genuinely supports the narration;
5. report insufficient visual coverage.

Do not use `tpad=stop_mode=clone`, a repeated final frame, or an unnoticed source loop to fill time. Do not disguise a frozen frame with captions, overlays, or synthetic camera motion.

### 6b. Score the cut: music, beats, sound design, effects

Write a one-line emotion map per section (hook / numbers / warning / story / CTA) and pick one music track per emotional block from the built-in library (`public/music/bgm/README.md`), switching with `music: <id>` at the segment where the narration turns and using `music: none` where a line must land in silence. Leave `music_duck` at the default so music dips under every spoken segment.

Run `python3 scripts/number_beats.py work/edl.snapped.json` to list every number the speaker says in the kept segments (rent, price, size, minutes, percent, rooms) with a ready overlay line timed to the word; it stars one per segment by priority. Use a starred line where the number is the point of the sentence and no shot already shows it.

Start from zero effects. Use beat sync (`beat: 2`, `pulse`) only when the user asked for a rhythmic montage and the segment has no narration to protect (never on a viewing tour), with a track from the montage family. Place sound effects on visible events only (a card, a number, a cut, a reveal) within a budget of 4–8 per minute of talking head. Add 剪映-style effects (`trans:`, `fx:`, `anim=`) at most one transition and two effects per segment, and only at turns you can name ("but", new location, the number, the close). Full decision tables: `references/sound-and-fx.md`.

### 7. Compose

Use the repository's `video-engine/remotion-edit` AutoVideo pipeline when available. Generate a Markdown edit script, captions JSON, and a renderable composition. Keep source media outside the Skill folder.

For talking-head treatment, choose one mode explicitly:

- `full-screen`: supported by the current AutoVideo `person:` shot.
- `pip-rectangle`: use only if implemented and visually verified.
- `pip-cutout`: requires a real video-matting/background-removal stage plus alpha-capable media. A static headshot cutout does not satisfy this requirement.

If the requested mode is unavailable, render the strongest supported baseline and mark that acceptance criterion as failed.

Jump cuts are covered automatically: when two `person:` shots from the same recording sit back to back with a gap in source time (a removed false start), the engine scales the second one to 1.1× and the next one back, so the speaker does not visibly jump. It is on by default (`jumpcut_zoom: false` to disable, a number to change the factor); the build prints how many cuts it covered. A shot with an explicit `z` is left alone.

After building, run the plan gate before rendering: `python3 scripts/plan_gate.py <engine>/src/generated/<id>.tsx --mode talk|tour|montage`. It fails a plan with a long stretch and no visual event (8 s talk / 12 s tour / 4 s montage), text cards on screen for more than 60 % of the runtime, more than one transition or two effects in a segment, the same effect three segments running, shots under 0.3 s, or shake/glitch/flash/pulse in a viewing tour; it warns on effects in consecutive segments, cards with more text than ~7 characters per second, and more than 8 sound effects per minute. Fix the Markdown script and rebuild until it passes.

### 8. Verify and deliver

Render representative frames before the full export. After the full render, master the loudness: `python3 scripts/audio_master.py master out/X.mp4 out/X.master.mp4` (−14 LUFS, true peak −1.5 dBTP); deliver the master. Then run `python3 scripts/verify_output.py out/X.master.mp4 --edl work/edl.snapped.json --glossary <profile>/glossary.txt`: it re-transcribes the render and fails if a removed take is audible, a phrase is heard twice, content similarity is below 0.85, or loudness is off target; glance at every listed diff span. Check the layout: `python3 scripts/qa_layout.py <engine> <id> out/X.master.mp4 --platform channels|xhs|both`. It renders a clean copy without overlays, finds the overlay layer by comparing the two, and fails when a card, caption or title covers the speaker's eyes or mouth, or sits in the platform's right-hand action column or bottom text area (top-band hits are warnings). Its `.layout.jpg` shows the flagged frames. Then verify the entire output for sync, repetition removal, semantic shot matching, caption accuracy, safe margins, visual continuity, and audio quality (music ducks under speech, every sound effect lands on a visible event, no effect hides a caption, beat cuts are not shorter than 0.3 s). Run `scripts/check_freezes.py OUTPUT.mp4`; any unexpected freeze over the default threshold blocks delivery, as does a failing `verify_output.py`. Inspect every reported timestamp because intentional static source footage can still require replacement if it looks stalled. If the user wanted a 剪映 draft, export it after the final render passes: `python3 scripts/export_jianying.py <engine> <id> --name <短名>` (add `--copy-media` when the draft will be moved to another computer). Report the track counts and every `note:` line it prints (what could not be reproduced natively). Deliver the mastered video, captions, edit decision list (snapped), the `verify.json` result, edit plan (including the music choice per section and the effect budget), the music licence reminder from the BGM README, and a pass/fail matrix.

Do not call the work complete until every required criterion is either verified or explicitly reported as unsupported.
