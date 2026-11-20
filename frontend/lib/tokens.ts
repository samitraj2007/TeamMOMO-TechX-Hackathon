/** Colour tokens as hex, mirrored from app/globals.css for contrast checks and canvas/SVG use. */
export const SURFACES = [
  { name: "bg", hex: "#F4F3EF" },
  { name: "surface", hex: "#FFFFFF" },
  { name: "raised", hex: "#F8F7F4" },
  { name: "overlay", hex: "#FFFFFF" },
  { name: "hairline", hex: "#E3E1DA" },
  { name: "hairline-strong", hex: "#CFCCC3" },
] as const;

export const INKS = [
  { name: "text", hex: "#151514", use: "body text, ink" },
  { name: "muted", hex: "#5E5B54", use: "labels, secondary" },
  { name: "brass", hex: "#8A5A12", use: "amber: review, risk" },
  { name: "sage", hex: "#1F5F5C", use: "the teal accent: spine, focus, CODE, positive" },
  { name: "model", hex: "#4A5B6E", use: "MODEL (slate)" },
  { name: "human", hex: "#7A5A1E", use: "HUMAN (ochre)" },
  { name: "red-text", hex: "#A3352B", use: "small red text" },
  { name: "red", hex: "#B5463A", use: "bars, borders, fills only" },
] as const;

/** The black key surface (.surface-key) that holds human approval and filing controls. */
export const KEY = {
  surface: "#131312",
  bg: "#1D1C1A",
  text: "#EEEAE2",
  muted: "#AAA69C",
  sage: "#7CC0BC",
  amber: "#E3B866",
  redText: "#F29A90",
  human: "#D9BC80",
  model: "#A4B7CB",
} as const;
