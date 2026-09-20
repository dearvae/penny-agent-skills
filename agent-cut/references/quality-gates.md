# Quality gates

## Pre-render

- Raw footage and raw transcript remain unchanged.
- Every deletion appears in the edit decision list.
- Repeated-take decisions follow keep-the-latest-take unless overridden.
- Every narration segment has a visual choice and match reason.
- Every B-roll assignment has enough moving source duration, or an explicit fallback is assigned.
- Unsupported claims are flagged.
- Faces, mirrors, addresses, phone numbers, and private details are reviewed.
- Captions use the cleaned timeline, not the original timeline.
- Requested talking-head mode is actually supported.
- Music is assigned per emotional block (≤ 3 tracks), switches only at segment starts, and `music: none` is deliberate.
- Every effect, transition, beat cut and pulse in the script traces to a user request or a named reason in the edit plan; a viewing tour has none. `beat:` / `pulse` appear only on montage segments; generated shot durations after beat snapping are all ≥ 0.3 s and within the usable source range.
- Every `sfx:` (including the ones added automatically by `fx:` / `trans:` / `anim=`) marks a visible event; the per-minute budget is respected.
- No segment has more than one transition and two effects; consecutive segments do not both carry effects unless the video is a montage.

## Frame checks

Render frames near the beginning, every visual change, the first caption, the longest caption, picture-in-picture appearances, and the ending. Check orientation, cropping, safe margins, caption/person collisions, black frames, and HDR color shifts.

## Full-output checks

- No deleted false start or superseded take remains.
- Audio has no clicks at edit boundaries.
- Lip sync is correct whenever the speaker is visible.
- B-roll changes track the spoken subject.
- Captions match the retained words and timing.
- Music never masks speech: it ducks under every spoken segment and returns between them.
- No flash, wipe, shake or glitch hides a readable caption; effects stay on the picture layer.
- Sound effects never fire on nothing and never stack on the same frame.
- No frozen first frame or missing media appears.
- No unexpected freeze, cloned final frame, or motionless duration padding appears. Run `python3 scripts/check_freezes.py OUTPUT.mp4`; a reported freeze blocks delivery until visually resolved.
- No B-roll source silently loops into unrelated content.
- Output duration and technical specifications match the brief.

## Delivery matrix

Report each as `pass`, `partial`, `fail`, or `not requested`:

1. transcription accuracy;
2. false-start/repetition removal;
3. keep-the-latest-take behavior;
4. semantic B-roll matching;
5. caption accuracy and timing;
6. talking-head placement;
7. background removal/matting;
8. audio continuity;
8b. music and sound design (per-section choice, ducking, effect budget);
9. visual quality;
10. publish readiness.

Distinguish engine automation from agent judgment in the final report.
