import type {Caption} from "@remotion/captions";

export type MediaRequirement = {
  src: string;
  requiredSec: number;
  availableSec: number;
  trimBeforeSec?: number;
};

export const scaleCaption = (caption: Caption, rate: number): Caption => ({
  ...caption,
  startMs: Math.round(caption.startMs / rate),
  endMs: Math.round(caption.endMs / rate),
});

export const segmentFrames = (
  durationSec: number,
  gapSec: number,
  fps: number,
): number => Math.round((durationSec + gapSec) * fps);

export const resolveLoop = (loop: boolean | undefined): boolean => loop ?? true;

export const resolveBackground = (
  explicit: string | undefined,
  legacyDefault: string,
): string => explicit ?? legacyDefault;

export const assertUniqueVideoSources = (sources: string[]): void => {
  const reused = sources.find((src, index) => sources.indexOf(src) !== index);
  if (reused) {
    throw new Error(`video source reused: ${reused}`);
  }
};

export const assertMediaCoverage = (items: MediaRequirement[]): void => {
  for (const item of items) {
    if (item.availableSec - (item.trimBeforeSec ?? 0) < item.requiredSec) {
      throw new Error(`video source too short: ${item.src}`);
    }
  }
};
