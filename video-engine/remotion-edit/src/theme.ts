export const theme = {
  ink: "#17171B",
  cream: "#FAF6EE",
  paper: "#FFFFFF",
  accent: "#E8442E",
  gold: "#E9A23B",
  muted: "#8A8578",
  font: `"PingFang SC", "Hiragino Sans GB", "Heiti SC", sans-serif`,
  // AutoVideo 字幕（.md 的 caption_* 覆盖；默认值就是改之前写死的样子）
  captionColor: "#FFFFFF",
  captionHighlight: "" as string, // 空 = 用 gold
  captionStyle: "shadow" as "shadow" | "stroke" | "box" | "plain",
  captionBox: "rgba(0,0,0,0.62)",
  captionSize: 58,
  captionBottom: 330,
  captionWeight: 900,
  captionAnim: "pop" as "pop" | "fade" | "slide" | "none",
};

/** 没有覆盖时的原始主题。AutoVideo 每次渲染按 data.theme 重设；其它合成开头调 resetTheme()，
 *  免得在 Studio 里先看了带参考风格的片、再切到别的合成时颜色串过去。 */
export const BASE_THEME = { ...theme };
export const applyTheme = (over?: Partial<typeof theme>) => {
  Object.assign(theme, BASE_THEME, over ?? {});
};
export const resetTheme = () => applyTheme();
