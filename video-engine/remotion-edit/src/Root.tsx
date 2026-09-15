import React from "react";
import { Composition } from "remotion";
import { NewsVideo, newsDuration } from "./NewsVideo";
import { NEWS_VIDEOS } from "./newsIndex";
import { NewLaunchVideo, newLaunchDuration } from "./NewLaunchVideo";
import { NEWLAUNCH_VIDEOS } from "./newlaunchIndex";
import { GENERATED_VIDEOS } from "./generated";
import { StylePreview, StyleSheet, STYLE_PREVIEW_FRAMES, STYLE_SHEET_SIZE, EndingPreview, ENDING_PREVIEW_FRAMES, ENDING_LAYOUTS } from "./StylePreview";
import { STYLE_IDS } from "./styles";
import { Cover, COVER_LAYOUTS, COVER_SIZES, COVER_DEFAULT_PROPS } from "./Cover";
import "./index.css";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {GENERATED_VIDEOS.map((v) => (
        <Composition
          key={v.id}
          id={v.id}
          component={v.component}
          durationInFrames={v.durationInFrames}
          fps={v.fps}
          width={v.width}
          height={v.height}
        />
      ))}

      {NEWS_VIDEOS.map(({ slug, manifest }) => (
        <Composition
          key={slug}
          id={`News-${slug}`}
          component={NewsVideo}
          durationInFrames={newsDuration(manifest)}
          fps={manifest.fps ?? 30}
          width={1080}
          height={1920}
          defaultProps={{ manifest }}
        />
      ))}

      {NEWLAUNCH_VIDEOS.map(({ slug, manifest }) => (
        <Composition
          key={slug}
          id={`NewLaunch-${slug}`}
          component={NewLaunchVideo}
          durationInFrames={newLaunchDuration(manifest)}
          fps={manifest.fps ?? 30}
          width={1080}
          height={1920}
          defaultProps={{ manifest }}
        />
      ))}

      {/* 风格样片（agent-shot 建档时给学员挑风格用）：一张对比图 + 每种风格一条 12.5 秒样片 */}
      <Composition
        id="StyleSheet"
        component={StyleSheet}
        durationInFrames={1}
        fps={30}
        width={STYLE_SHEET_SIZE.width}
        height={STYLE_SHEET_SIZE.height}
      />
      {STYLE_IDS.map((id) => (
        <Composition
          key={id}
          id={`StylePreview-${id}`}
          component={StylePreview}
          durationInFrames={STYLE_PREVIEW_FRAMES}
          fps={30}
          width={1080}
          height={1920}
          defaultProps={{ styleId: id }}
        />
      ))}
      {ENDING_LAYOUTS.map((l) => (
        <Composition
          key={l.id}
          id={`EndingPreview-${l.id}`}
          component={EndingPreview}
          durationInFrames={ENDING_PREVIEW_FRAMES}
          fps={30}
          width={1080}
          height={1920}
          defaultProps={{ layout: l.id }}
        />
      ))}
      {/* 封面：4 版式 × 2 尺寸，scripts/cover-previews.sh 用 --props 传标题、底图、头像 */}
      {COVER_LAYOUTS.flatMap((l) =>
        COVER_SIZES.map((sz) => (
          <Composition
            key={`${l.id}-${sz.id}`}
            id={`Cover-${l.id}-${sz.id}`}
            component={Cover}
            durationInFrames={1}
            fps={30}
            width={sz.W}
            height={sz.H}
            defaultProps={{ ...COVER_DEFAULT_PROPS, layout: l.id, W: sz.W, H: sz.H }}
          />
        )),
      )}
    </>
  );
};
