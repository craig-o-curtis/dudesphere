"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

// "user" follows the OS setting: motion components drop transform and layout
// animation and keep opacity and color.
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
