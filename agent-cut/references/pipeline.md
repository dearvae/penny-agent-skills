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

Preferred local path:

```bash
ffmpeg -i INPUT.MOV -map 0:a:0 -ar 16000 -ac 1 -c:a pcm_s16le speech.wav
whisper-cli -m MODEL.bin -f speech.wav -l zh -ojf -of transcript -np
```

If Metal allocation fails, rerun Whisper with `-ng` for CPU mode. Save the timestamped JSON as the immutable raw transcript.

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
- cards, titles, stats, and sound effects.

Do not modify generated TSX. Change the Markdown script and rebuild it.

Before assigning a B-roll duration, verify that the selected source range contains enough relevant moving footage. AutoVideo may loop a media source when the requested duration exceeds it; never rely on that behavior because the loop can expose unrelated parts of the source.

## 7. Picture-in-picture modes

`full-screen` needs no matting. `pip-rectangle` needs a positioned video container and safe caption avoidance. `pip-cutout` requires temporal video matting; a PNG cutout from one frame cannot replace it because the mouth and body must continue moving.

Before promising `pip-cutout`, verify all of the following:

1. a video-matting tool or service exists;
2. the user authorized any cloud upload involved;
3. alpha or keyed output is readable by the renderer;
4. edge quality, hair detail, motion, and lip sync pass visual QA.

## 8. Insufficient-footage fallback

Never manufacture coverage with a cloned last frame or long freeze. Never use `tpad=stop_mode=clone` for editorial duration padding. Resolve a coverage gap in this order:

1. split the narration across two or more relevant moving shots;
2. select another non-overlapping range that supports the same statement;
3. return to the synchronized speaker;
4. use a relevant factual graphic or card;
5. leave the talking head on screen and flag the missing B-roll.

Keep a coverage table with narration duration, total usable matching footage, and the selected fallback. If usable footage is shorter than the narration, the plan is incomplete until a fallback is assigned.

After rendering, run:

```bash
python3 scripts/check_freezes.py OUTPUT.mp4
```

The check examines a central image region to avoid captions and bottom-corner picture-in-picture overlays masking a frozen background. A non-zero exit blocks completion. Review the reported timestamps visually; rerender with moving coverage rather than suppressing the check. Only allow a flagged still when the user explicitly requested it, and document that exception in the delivery matrix.
