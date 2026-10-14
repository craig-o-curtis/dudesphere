/** A game is ten frames. */
export const FRAMES_PER_GAME = 10;

/** Ten pins stand at the start of every frame, and after a strike in the tenth. */
export const PINS_PER_RACK = 10;

/**
 * One delivery, as stored. A game is stored as its rolls, and every score is
 * worked out from them, never stored.
 *
 * A foul is a delivery that counts with zero pins: the bowler crossed the
 * line ("Over the line!"), so the ruling is "Mark it zero".
 */
export interface Roll {
  /** Pins knocked down, 0 to 10. Always 0 when `foul` is true. */
  pins: number;
  foul: boolean;
}
