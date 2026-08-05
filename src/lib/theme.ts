/**
 * @file Brand colours for JS-side use. CSS should use the Tailwind tokens.
 */

/*
 * Most styling uses the semantic Tailwind utilities generated from the
 * `--color-canvas-*` tokens in index.css (`text-canvas-gold`, `bg-canvas-sage`,
 * and so on). A handful of places need the raw value in JavaScript — inline
 * `style` objects, canvas fills, slider thumbs — and those use this module.
 *
 * These values are duplicated in exactly three places, deliberately:
 *   1. src/index.css            (@theme, drives every Tailwind utility)
 *   2. src/lib/theme.ts         (this file, for JS)
 *   3. android/.../values/colors.xml (native splash, icons, TV banner)
 *
 * Changing the look of the app means changing all three. There is no way to
 * share a constant across CSS, TypeScript and Android XML without a build step,
 * and a build step is not worth it for five colours.
 */
export const BRAND = {
  ink: '#11140F',
  surface: '#1A1D14',
  gold: '#D4CDA4',
  sage: '#A3B18A',
  parchment: '#EAE6DA',
  /** Slider thumb for the warmth control, which is bipolar cool -> warm. */
  warm: '#FFB380',
  /** Slider thumb for the black-level control. */
  shadow: '#2B2B2B',
} as const;

export type BrandColor = keyof typeof BRAND;
