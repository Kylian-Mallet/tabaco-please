// Restricted, desaturated "tabac / bourg français" palette.
// These ~16 named colors are the ONLY colors the art layer should use, so the
// whole game stays cohesive, dim and readable. Hard pixel edges, flat fills.

export const PAL = {
  /** Deep near-black backdrop / letterbox bars. */
  bg: '#0c0b0a',
  /** Darkest wood (counter shadow, edges). */
  woodDark: '#2b1d12',
  /** Main comptoir wood. */
  wood: '#5a3c22',
  /** Lit wood highlight / front lip. */
  woodLight: '#7d5631',
  /** Pack wall base (dim ochre plaster). */
  wall: '#6b5638',
  /** Pack wall shadow / recesses. */
  wallDark: '#473720',
  /** Paper / documents (off white, slightly stained). */
  paper: '#d9cda8',
  /** Ink / dark text / outlines. */
  ink: '#241c14',
  /** Tobacco red (warning red, stamps). */
  rougeTabac: '#9c3b2e',
  /** FDJ brand red. */
  fdjRouge: '#b1322f',
  /** FDJ brand yellow (muted). */
  fdjJaune: '#c9a23b',
  /** Muted green (validation, vert pharmacie). */
  vertMuted: '#5f7348',
  /** Skin tone (client face). */
  peau: '#b78a63',
  /** Skin shadow. */
  peauOmbre: '#8a6244',
  /** Broken-white highlight (speech bubble, paper sheen). */
  blancCasse: '#e7ddc4',
  /** Generic shadow overlay color. */
  ombre: '#1a130c',
} as const;

export type PaletteName = keyof typeof PAL;
