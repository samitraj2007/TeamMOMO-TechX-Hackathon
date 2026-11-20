/** Colour tokens as hex, mirrored from app/globals.css for contrast checks and canvas/SVG use. */
export const SURFACES = [
  { name: "bg", hex: "#F3F3F1" },
  { name: "surface", hex: "#FFFFFF" },
  { name: "raised", hex: "#F7F7F5" },
  { name: "overlay", hex: "#FFFFFF" },
  { name: "hairline", hex: "#E5E5E1" },
  { name: "hairline-strong", hex: "#D3D3CE" },
] as const;

export const INKS = [
  { name: "text", hex: "#17181A", use: "body text" },
  { name: "muted", hex: "#66676B", use: "labels, secondary" },
  { name: "brass", hex: "#9A6A1F", use: "amber: needs review" },
  { name: "sage", hex: "#2F5D4E", use: "forest accent: primary action, focus, auto-clear, pipeline" },
  { name: "model", hex: "#56657A", use: "MODEL (slate)" },
  { name: "human", hex: "#7A5A1E", use: "HUMAN (ochre)" },
  { name: "red-text", hex: "#A33A2F", use: "small red text" },
  { name: "red", hex: "#B0473B", use: "bars, borders, fills only" },
] as const;

/** Graphite palette of the landing (.palette-charcoal). */
export const GRAPHITE = {
  bg: "#111213",
  surface: "#18191B",
  text: "#EDECE8",
  muted: "#9A9A96",
  sage: "#8FB5A3",
} as const;

/** The dark key surface (.surface-key) that holds human approval and filing controls. */
export const KEY = {
  surface: "#161719",
  bg: "#1E1F21",
  text: "#EDECE8",
  muted: "#A6A6A2",
  sage: "#9CC2B0",
  amber: "#E2B86A",
  redText: "#F1A096",
  human: "#D9BC80",
  model: "#A9B8C9",
} as const;
