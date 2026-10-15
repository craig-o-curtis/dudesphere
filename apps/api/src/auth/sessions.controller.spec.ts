import { type JwtClaims, SignInService } from "@nestjs/authentication";
import { Test, TestingModule } from "@nestjs/testing";

import { SignInsRepository } from "../typeorm/sign-ins.repository.js";
import { SessionsController } from "./sessions.controller.js";

describe("SessionsController", () => {
  let controller: SessionsController;

  const signInService = { signOutEverywhere: vi.fn() };
  const signIns = { endSignIn: vi.fn() };

  // A sign-in's id, as TokensController makes it: a UUID.
  const sid = "4f1c2a3b-5d6e-4f70-8a9b-0c1d2e3f4a5b";

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SessionsController],
      providers: [
        { provide: SignInService, useValue: signInService },
        { provide: SignInsRepository, useValue: signIns },
      ],
    }).compile();

    controller = module.get<SessionsController>(SessionsController);
  });

  describe("signOut", () => {
    // Both come from the access token JwtAuth has just checked, so a caller
    // can only ever end their own sign-in. The package keeps user ids as
    // strings.
    it("ends the sign-in named by the token's sid, for the caller", async () => {
      signIns.endSignIn.mockResolvedValue(undefined);
      const claims: JwtClaims = { sub: "25", sid, amr: ["pwd"] };

      await expect(controller.signOut(25, claims)).resolves.toBeUndefined();

      expect(signIns.endSignIn).toHaveBeenCalledTimes(1);
      expect(signIns.endSignIn).toHaveBeenCalledWith(sid, "25");
    });

    // A dev token from `pnpm dev:token` has no sid: it belongs to no
    // sign-in, so there is nothing to end. JwtAuth refuses any other token
    // without one before it gets here.
    it("ends nothing for a token with no sid", async () => {
      const claims: JwtClaims = { sub: "25", amr: ["dev"] };

      await expect(controller.signOut(25, claims)).resolves.toBeUndefined();

      expect(signIns.endSignIn).not.toHaveBeenCalled();
    });

    // A 204 must mean the sign-in ended.
    it("lets a failed write through", async () => {
      const down = new Error("database down");
      signIns.endSignIn.mockRejectedValue(down);

      await expect(controller.signOut(25, { sub: "25", sid })).rejects.toBe(down);
    });

    it("leaves the member's other sign-ins alone", async () => {
      signIns.endSignIn.mockResolvedValue(undefined);

      await controller.signOut(25, { sub: "25", sid });

      expect(signInService.signOutEverywhere).not.toHaveBeenCalled();
    });
  });

  describe("signOutEverywhere", () => {
    // The id comes from the access token, so a caller can only ever sign
    // themselves out. The package keeps user ids as strings.
    it("signs the caller out everywhere, by the id in their token", async () => {
      signInService.signOutEverywhere.mockResolvedValue(undefined);

      await expect(controller.signOutEverywhere(25)).resolves.toBeUndefined();

      expect(signInService.signOutEverywhere).toHaveBeenCalledTimes(1);
      expect(signInService.signOutEverywhere).toHaveBeenCalledWith("25");
    });
  });
});
