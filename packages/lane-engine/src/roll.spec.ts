import { FRAMES_PER_GAME, PINS_PER_RACK, type Roll } from "./index.js";

describe("lane-engine", () => {
  it("knows the shape of a game", () => {
    expect(FRAMES_PER_GAME).toBe(10);
    expect(PINS_PER_RACK).toBe(10);
  });

  it("stores a foul as a roll of zero pins", () => {
    const foul: Roll = { pins: 0, foul: true };
    expect(foul).toEqual({ pins: 0, foul: true });
  });

  // The test vectors LANE-21 must pass, from the USBC scoring guide and the
  // bowling kata. See context/epic-lebowski/research.md.
  describe("scoring, filled in by LANE-21", () => {
    it.todo(
      "scores the USBC example X X X 7-2 8-/ F-9 X 7-/ 9-- X-X-8 as 30 57 76 85 95 104 124 143 152 180",
    );
    it.todo("scores twelve strikes as 300");
    it.todo("scores ten frames of 9 and a miss as 90");
    it.todo("scores ten 5-spare frames and a bonus 5 as 150");
    it.todo("scores twenty gutter balls as 0");
    it.todo("scores alternating strikes and spares, the Dutch 200, as 200");
    it.todo("respots the pins after a first-ball foul, so F then 10 is a spare");
    it.todo("refuses two balls in frames 1 to 9 that add up to more than 10 pins");
    it.todo("refuses a second ball after a strike in frames 1 to 9");
    it.todo("allows three balls in the tenth only after a strike or a spare");
    it.todo("refuses a roll after the game is complete");
  });
});
