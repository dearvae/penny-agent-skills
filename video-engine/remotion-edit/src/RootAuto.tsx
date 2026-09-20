import React from "react";
import { Composition } from "remotion";
import { GENERATED_VIDEOS } from "./generated";
import "./index.css";

/** 只注册 scripts/*.md 生成的 composition 的轻量入口（渲染时不用碰新闻/新盘的 manifest）：
 *    npx remotion render src/index-auto.ts <id> out/<id>.mp4 */
export const RootAuto: React.FC = () => (
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
  </>
);
