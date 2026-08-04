/**
 * 独立的 Remotion 入口，只注册 WordCaptionsDemo —— 用来单独预览/验证逐词字幕，
 * 不碰 src/Root.tsx（Root 由主进程统一注册）。
 *
 *   npx remotion studio scripts/wc-preview.tsx
 *   npx remotion still  scripts/wc-preview.tsx WordCaptionsDemo /tmp/wc.png --frame=60
 *   npx remotion render scripts/wc-preview.tsx WordCaptionsDemo /tmp/wc.mp4
 *
 * 正式接入时把 WordCaptionsDemo 注册进 src/Root.tsx 即可，这个文件可以留着当沙盒。
 */
import React from "react";
import { Composition, registerRoot } from "remotion";
import {
  WordCaptionsDemo,
  WORD_CAPTIONS_DEMO_DURATION,
} from "../src/WordCaptions";
import "../src/index.css";

const Root: React.FC = () => (
  <Composition
    id="WordCaptionsDemo"
    component={WordCaptionsDemo}
    durationInFrames={WORD_CAPTIONS_DEMO_DURATION}
    fps={30}
    width={1080}
    height={1920}
  />
);

registerRoot(Root);
