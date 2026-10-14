/*
 * Motion constants and presets for motion/react. The numbers copy
 * styles/tokens.css (in seconds here); motion.spec.ts checks they match.
 * Each preset has a full variant and a reduced one. The reduced one changes
 * opacity only, so the result still appears.
 */

export { useReducedMotion } from "motion/react";

export const DURATION = {
  fast: 0.15,
  base: 0.2,
  slow: 0.25,
  fade: 0.15,
} as const;

export const EASE_OUT = [0.2, 0.8, 0.2, 1] as const;

const fullTransition = { duration: DURATION.base, ease: EASE_OUT } as const;
const fastTransition = { duration: DURATION.fast, ease: EASE_OUT } as const;
const fadeTransition = { duration: DURATION.fade, ease: EASE_OUT } as const;

export const fadeIn = {
  full: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: fullTransition,
  },
  reduced: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: fadeTransition,
  },
} as const;

// A small rise into place. Full-string transform, so it stays on the GPU.
export const enter = {
  full: {
    initial: { opacity: 0, transform: "translateY(8px)" },
    animate: { opacity: 1, transform: "translateY(0px)" },
    transition: fullTransition,
  },
  reduced: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: fadeTransition,
  },
} as const;

// Press feedback. Add it to a button as whileTap.
export const press = {
  full: {
    whileTap: { transform: "scale(0.97)" },
    transition: fastTransition,
  },
  reduced: {
    whileTap: { opacity: 0.8 },
    transition: fadeTransition,
  },
} as const;

export const presets = { fadeIn, enter, press } as const;

interface Preset<Full, Reduced> {
  readonly full: Full;
  readonly reduced: Reduced;
}

export function pickPreset<Full, Reduced>(
  preset: Preset<Full, Reduced>,
  reduce: boolean | null,
): Full | Reduced {
  return reduce ? preset.reduced : preset.full;
}
