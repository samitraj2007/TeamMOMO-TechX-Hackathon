import localFont from "next/font/local";

// Self-hosted (SIL OFL 1.1, licences in app/fonts). No CDN requests.
export const geist = localFont({
  src: "../app/fonts/Geist-Variable.woff2",
  variable: "--font-geist",
  weight: "100 900",
  display: "swap",
});

export const jetbrainsMono = localFont({
  src: "../app/fonts/JetBrainsMono-Variable-latin.woff2",
  variable: "--font-jetbrains",
  weight: "100 800",
  display: "swap",
});

export const plexArabic = localFont({
  src: [
    { path: "../app/fonts/IBMPlexSansArabic-400-arabic.woff2", weight: "400", style: "normal" },
    { path: "../app/fonts/IBMPlexSansArabic-500-arabic.woff2", weight: "500", style: "normal" },
    { path: "../app/fonts/IBMPlexSansArabic-600-arabic.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-plex-arabic",
  display: "swap",
});
