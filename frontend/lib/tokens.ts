/** Colour tokens as hex, mirrored from app/globals.css for contrast checks and canvas/SVG use. */
export const SURFACES = [
  { name: "bg", hex: "#F3F4F1" },
  { name: "surface", hex: "#FFFFFF" },
  { name: "raised", hex: "#F7F8F6" },
  { name: "overlay", hex: "#FFFFFF" },
  { name: "hairline", hex: "#E4E6E1" },
  { name: "hairline-strong", hex: "#D5D8D2" },
] as const;

export const INKS = [
  { name: "text", hex: "#1C211E", use: "body text, near-black" },
  { name: "muted", hex: "#5C6560", use: "labels, secondary" },
  { name: "brass", hex: "#7A5B24", use: "risk, review, focus" },
  { name: "sage", hex: "#1F7A4D", use: "the green accent: CODE and positive" },
  { name: "model", hex: "#3D5F7A", use: "MODEL (steel-blue)" },
  { name: "human", hex: "#7A6230", use: "HUMAN (sand)" },
  { name: "red-text", hex: "#9C3B34", use: "small red text" },
  { name: "red", hex: "#B5524A", use: "bars, borders, fills only" },
] as const;
