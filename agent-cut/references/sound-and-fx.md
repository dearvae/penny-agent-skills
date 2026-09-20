# Sound and effects design (配乐 · 卡点 · 音效 · 特效)

Read this after the semantic edit plan (pipeline §5) and before writing the Markdown script (§6). The engine ships everything referenced here: 43 BGM tracks with beat grids (`public/music/bgm/README.md`), 53 sound effects with role tags (`public/sfx/README.md`), and the 剪映-style effect kit (`src/fx.tsx`, syntax in `SCRIPT_FORMAT.md` under 「特效与转场」 and 「配乐、换歌、卡点」).

The rule that overrides everything below: **nothing here is added by default.** The engine can do it; that is not a reason to use it. Start every cut with no effects, no beat sync, no pulse, one music track ducked under speech. Add an item only when (a) the user asked for it, (b) the script marks the moment, or (c) the edit plan can name the reason at that exact second. If the reason is "it looks more dynamic", it is not a reason.

**Viewing tours (看房 / 探房 / listing walk-through) get none of this.** The viewer is there to understand the home: rooms, light, layout, condition. Cuts follow the narration and the space, never the drum grid; no pulse, no shake, no glitch, no flash. At most a calm transition when moving between units, if the user wants it.

Second rule: **the speaker's voice is the product**. Music, effects and sound design exist to keep attention on what is being said. If a choice would make a viewer notice the editing instead of the point, drop it.

## 1. Music: choose per section, not per video

Build a short **emotion map** from the edit plan: one line per section with the narration's job (hook / bad news / good news / numbers / story / CTA). Then assign music:

| Narration job | Track family (ids from the BGM README) | Notes |
|---|---|---|
| Hook, quick promise | `33_positive_friends` `04_vlog_indie_pop` `14_happy_bubble` | light, mid tempo; never a big intro under speech |
| Policy, numbers, market read | `17_business_corporate` `40_news_flash` `41_news_grand` `09_light_relaxed` | neutral, no melody hooks that fight numbers |
| Family, own-stay, first home, warmth | `29_calm_cute_piano` `02_warm_healing` `11_acoustic_romance` `30_fragile_heart` | piano/acoustic; keep `music_duck` at 0.5 |
| Site, surroundings, drone, greenery | `19_sunset_coast` `20_forest_light` `06_travel_loop` `23_peaceful_nature` | works without speech too (montage) |
| Fast montage, photo flash, unit tour | `25_funky_groove` `26_latin_zumba` `27_upbeat_energetic` `28_snap_clap_flash` `07_beat_drop_rock` | the only family where `beat:` and `pulse` belong |
| Promotion, launch, feature list | `21_ad_energy` `22_ad_funk` `42_business_sales` | short sections only (30–40 s), it tires |
| Risk, "but", pitfalls | `38_rising_tension` (or **no music**) | pair with `fx: shake` / `riser_tense`; return to the previous track after |
| Success story, motivation, CTA | `36_motivation` `37_dream_launch` | last section or ending only |
| AI tool / tech demo | `18_ambient_technology` `43_global_technology` | under `chat:` screens |

Rules:

- **One track per emotional block, not per section.** A 60–90 s talking-head cut usually wants 1–2 tracks; 3 is the ceiling. Switch only where the narration turns (good news → warning, explanation → montage, body → CTA). Switch at a segment start with `music: <id>`; the engine crossfades 20 frames.
- **Silence is a choice.** `music: none` for the one section that must land hard (the price reveal, the warning). Bring music back on the next section.
- **Volume is already normalised.** Library ids are gain-matched; `music_duck` (default 0.5) lowers music under every segment that has `vo:`. Do not raise `music_volume` above 0.7 for library ids; for real recorded voice with room noise keep the default.
- **Loop awareness.** Short tracks (`28_snap_clap_flash` 35 s, `39_news_overture` 60 s) loop. Do not put a loop point under a key sentence; either pick a longer track or start the section on the loop boundary.
- **Copyright line.** The delivery notes must carry the BGM README's licence reminder (剪映 library, verify before publishing outside Douyin).

## 2. Beat sync (卡点): only where there is no speech to protect

Opt-in only. Do not propose it; use it when the user asks for a rhythmic montage.

`beat: true` snaps the cut points of a multi-shot segment to the nearest beats of the active track; `beat: 2` cuts every 2 beats; `pulse` (per shot or `pulse: true` per segment) adds a 5 % zoom kick on each beat.

Use it when:

- the segment is a **montage without narration** (or the narration is a list: "three things: A, B, C");
- the visuals are 3–8 short shots or photos of comparable value;
- the track is from the montage family above (real drum grid; the beat table says `✓`).

Do not use it when a sentence needs to finish on a specific shot (semantic matching wins), on the talking head, or with piano/ambient tracks (beats exist but the viewer cannot hear them, so snapping looks random).

Workflow: pick the track first (`music:` on that segment), list the shots without durations, set `beat: 2` (120 BPM ≈ 1 s per shot) or `beat: 1` for a 4–6 shot flash, rebuild, read the generated durations, and check that no shot is shorter than 0.3 s or longer than its usable source range (pipeline §6 loop warning still applies).

## 3. Sound effects: one per visual event, never per sentence

Every `sfx:` must point at something the viewer sees change at that frame. Pick by role (see `SFX_TAGS` in `sfx.ts` / the sfx README):

| Moment on screen | Use | Avoid |
|---|---|---|
| Hard cut / new shot in a montage | `swish` `whoosh1` `whoosh_cartoon` | more than one per cut |
| Card / label / number appears | `pop` `pop_bubble` `water_drop` `ding_short` | stacking with a caption |
| Price, rent, yield, commission | `cash_register` `coins_scatter` `coin` `cash` | on every number; once per section |
| Tick / checkmark / "yes" | `correct_ding` `success_chime` | `applause` (only for real testimonials or a signed deal) |
| Cross / mistake / "don't" | `error_beep` `error_buzz` `dong_variety` | `fail_jingle` unless the section is comedic |
| Reveal after a pause | `ding_long` `paper_tear` `sparkle_dust` | riser + reveal + impact together |
| Before a warning or twist | `riser_tense` `tense_sting` (start 1–2 s before the word) | riser under the whole sentence |
| Big title slam | `bass_hit_caption` `dong_hollow_intro` | `bass_cinematic` in a talking-head cut (8 s tail) |
| Message / chat mock-up | `chat_notify` `notify_alert` `typing` | |
| Freeze / photo / screenshot | `camera_shutter` | |
| Countdown, "time is running out" | `clock_tick` | |
| Reaction (viewer's inner voice) | `gasp` `wow` | on the speaker's own face while they talk |

Budget: a 60 s talking-head cut carries 4–8 effects; a 30 s montage may carry one per cut. Effects tied to `fx:` / `trans:` / `anim=` are added automatically; count them in the budget or write `nosfx`.

## 4. Effects and transitions (仿剪映特效): punctuation, not decoration

Available (`fx.tsx`): `flash` `shake` `glitch` `open` `close` `blur_in` `wipe` `slide_up` `zoom_pulse` `vignette` `spin_in` `zoom_through`; transitions `trans: whip | zoom_through | fade_black | wipe_in | slide_in | glitch_in | open`; text entrances `anim=typewriter | bounce | slide_up | blur | flip` on `title:` / `card:` / `hook:`.

Map them to speech, the way 剪映 templates do:

| The speaker… | Effect |
|---|---|
| opens the video / names the topic | `trans: open` or `fx: @0 open` on segment 1, `title: … anim=typewriter` for a named topic |
| says "but", "the catch is", "most people get this wrong" | `fx: shake` on that word, or `fx: glitch` for a "system error" feel |
| lands a number | `fx: zoom_pulse` on the number's card, or `p<sec>` zoom punch on the talking head |
| moves to a new location / new unit | `trans: whip` or `trans: zoom_through` on the first shot there |
| slows down for a serious point | `fx: vignette` for that segment, music to `38_rising_tension` or `none` |
| finishes | `fx: close` 0.6 s before the end card, or let `Ending.tsx` handle it |

Limits: at most **one transition and two effects per segment**, and no effect on two consecutive segments unless the whole video is a montage. Effects act on the picture layer only (captions and cards stay still) so the subtitle line never becomes unreadable. The default for a calm explanatory cut is zero effects; add them only at emotional turns you can name in the edit plan.

## 5. What the demo is and is not

`scripts/fx-demo.md` stacks every feature into 45 s so each one can be checked. It is a feature test, not a style reference: a real cut of that length would carry one track, zero to two effects, and no beat sync.

## 6. Verify before delivery

- Rebuild, then read the generated data: `musicCues` start times fall on the intended segments, `beats` is non-empty when `beat:`/`pulse` were used, every auto sfx sits at the right `at`.
- Render frames at every `fx:` / `trans:` time and at each music switch (± 0.5 s): no readable caption is hidden by a flash or wipe, and the shot after a beat cut is not shorter than 0.3 s.
- Listen to the full output once: music dips under speech, no effect masks a word, no sfx fires on nothing.
- Report the music choices per section and the effect budget in the delivery notes; mark which were the agent's judgment versus the user's request.
