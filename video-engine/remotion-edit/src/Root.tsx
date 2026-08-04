import React from "react";
import { Composition } from "remotion";
import { NewsVideo, newsDuration } from "./NewsVideo";
import { NEWS_VIDEOS } from "./newsIndex";
import { NewLaunchVideo, newLaunchDuration } from "./NewLaunchVideo";
import { NEWLAUNCH_VIDEOS } from "./newlaunchIndex";
import { GENERATED_VIDEOS } from "./generated";
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
    </>
  );
};
