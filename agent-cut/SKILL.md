---
name: agent-cut
description: 自拍素材剪辑线（学员版，和 agent-shot 成一对）：把用户自己拍的口播 + B-roll 素材剪成带字幕的竖屏成片——转写、去口误、只留最新一遍、按语义选镜、字幕、可选人物画中画，用 Remotion 渲染并做画面质检。保留他的真声和原意，不重写、不编镜头。触发词：「我拍了几段在 XX 文件夹，帮我剪」「剪辑这些素材」「去掉口误」「口播配 B-roll」「探房视频」「listing video」「按我的脚本结构剪」「agent cut」。**和 agent-shot 怎么分：用户手里有自己拍的视频素材（说了「拍了 / 素材 / 文件夹里的视频 / 剪 / 口误 / B-roll」）就走这里；只有选题、新闻、链接、图片而没有视频素材的走 agent-shot。两边都像就先问一句「是用你拍好的素材剪，还是零素材直接生成？」。**
---

# agent-cut · 自拍素材剪辑（学员版）

Turn existing spoken footage and supporting visuals into an editable, evidence-backed cut. Do not rewrite the speaker's meaning or invent shots.

## Prerequisites (check before every run; stop and fix any missing **required** item first)

| | Item | How to verify |
|---|---|---|
| Required | Machine setup prompt completed (Node, ffmpeg, whisper-cpp + model, Remotion pre-installed) | `ffmpeg -version`, `whisper-cli` and `npx remotion versions` all respond |
| Required | Engine installed: `remotion-edit/` with `node_modules` | `remotion-edit/node_modules` exists |
| Required | The user's own footage (talking-head clip + B-roll) in one folder this chat can read | `ffprobe` every file succeeds |
| Required | Profile: on-screen name, visual style | profile file exists with both fields |
| Optional | The user's own script structure template (hook → points → CTA, segment count, on-camera or not) | if absent, derive structure from the footage |
| Optional | Reference video for pacing and caption style | if absent, use the engine defaults |
| Optional | Cloned voice | not needed: this line keeps the user's real recorded voice |
| Built in | Music (43 tracks with beat grids), 53 sound effects, 剪映-style effect kit | ship with the engine; nothing to collect from the user. Own music: `scripts/add-bgm.mjs` |
| Optional | Talking-head background removal / picture-in-picture | only if the user asks |

## Captions: always one line

A caption is never allowed to wrap to two lines. Keep each caption ≤14 characters for Chinese (≤11 on `big` segments, ~7 words for English); if a phrase does not fit, split it into two consecutive captions at a natural pause instead of letting it wrap. After rendering, check frames: a two-line caption means the chunk is too long — re-chunk the transcript, do not shrink the font.

## Publishing platform (ask before cutting; the platform changes the edit)

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
8. Music, sound effects and visual effects serve the speech. Music is chosen per emotional block and ducks under every spoken segment; each sound effect marks one visible event; effects and transitions are punctuation at turns the edit plan can name, never decoration. Beat sync only on montage sections without speech to protect.

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

Inspect the reference at regular intervals and record its layout, pacing, caption style, talking-head treatment, transitions, music, and ending. Separate must-match requirements from optional style cues.

### 3. Transcribe before cutting

Extract mono 16 kHz WAV and transcribe with timestamped output. Preserve the raw transcript. Create a separate edit transcript containing every proposed deletion and its reason.

Apply keep-the-latest-take logic to false starts, repeated clauses, restarts, and self-corrections. Do not delete pauses merely because they are quiet; keep pauses that carry emphasis or natural rhythm.

### 4. Build a reversible edit decision list

Record source clip, source in/out, destination in/out, transcript text, decision reason, and confidence for every retained segment. Use non-destructive Remotion trims where possible. Re-encode only when a standalone cleaned source is required.

### 5. Index the visuals

Sample each B-roll clip across its duration. Build a shot inventory with precise time ranges, visible subject, movement, quality problems, privacy/compliance risks, and suitable narration concepts.

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

Use beat sync (`beat: 2`, `pulse`) only on montage segments without narration to protect, with a track from the montage family. Place sound effects on visible events only (a card, a number, a cut, a reveal) within a budget of 4–8 per minute of talking head. Add 剪映-style effects (`trans:`, `fx:`, `anim=`) at most one transition and two effects per segment, and only at turns you can name ("but", new location, the number, the close). Full decision tables: `references/sound-and-fx.md`.

### 7. Compose

Use the repository's `video-engine/remotion-edit` AutoVideo pipeline when available. Generate a Markdown edit script, captions JSON, and a renderable composition. Keep source media outside the Skill folder.

For talking-head treatment, choose one mode explicitly:

- `full-screen`: supported by the current AutoVideo `person:` shot.
- `pip-rectangle`: use only if implemented and visually verified.
- `pip-cutout`: requires a real video-matting/background-removal stage plus alpha-capable media. A static headshot cutout does not satisfy this requirement.

If the requested mode is unavailable, render the strongest supported baseline and mark that acceptance criterion as failed.

### 8. Verify and deliver

Render representative frames before the full export. Then verify the entire output for sync, repetition removal, semantic shot matching, caption accuracy, safe margins, visual continuity, and audio quality (music ducks under speech, every sound effect lands on a visible event, no effect hides a caption, beat cuts are not shorter than 0.3 s). Run `scripts/check_freezes.py OUTPUT.mp4`; any unexpected freeze over the default threshold blocks delivery. Inspect every reported timestamp because intentional static source footage can still require replacement if it looks stalled. Deliver the video, captions, edit decision list, edit plan (including the music choice per section and the effect budget), the music licence reminder from the BGM README, and a pass/fail matrix.

Do not call the work complete until every required criterion is either verified or explicitly reported as unsupported.
