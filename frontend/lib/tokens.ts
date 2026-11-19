/** Colour tokens as hex, mirrored from app/globals.css for contrast checks and canvas/SVG use. */
export const SURFACES = [
  { name: "bg", hex: "#0B100D" },
  { name: "surface", hex: "#111A14" },
  { name: "raised", hex: "#17231B" },
  { name: "overlay", hex: "#1D2B22" },
  { name: "hairline", hex: "#24342A" },
  { name: "hairline-strong", hex: "#33473A" },
] as const;

export const INKS = [
  { name: "text", hex: "#E4E8DD", use: "body text, warm off-white" },
  { name: "muted", hex: "#97A496", use: "labels, secondary (sage-grey)" },
  { name: "brass", hex: "#CFA65A", use: "the one warm accent: risk, review, focus" },
  { name: "sage", hex: "#7FA88E", use: "CODE · positive" },
  { name: "model", hex: "#86A5BF", use: "MODEL (steel-blue)" },
  { name: "human", hex: "#D0BC86", use: "HUMAN (sand)" },
  { name: "red-text", hex: "#D27A70", use: "small red text" },
  { name: "red", hex: "#B5524A", use: "bars, borders, fills only" },
] as const;
