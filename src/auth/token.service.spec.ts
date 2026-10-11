import { JwtService } from "@nestjs/jwt";
import { Test, TestingModule } from "@nestjs/testing";

import authConfig from "./config/auth.config.js";
import { TokenService } from "./token.service.js";

describe("TokenService", () => {
  let service: TokenService;

  const jwtService = { signAsync: vi.fn() };
  // Only the settings this service reads.
  const auth = { expiresIn: 900 };

  const walter = { id: 25, username: "walter", email: "w@x.com", role: "user" };

  beforeEach(async () => {
    vi.clearAllMocks();
    jwtService.signAsync.mockResolvedValue("signed.jwt.token");

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenService,
        { provide: JwtService, useValue: jwtService },
        { provide: authConfig.KEY, useValue: auth },
      ],
    }).compile();

    service = module.get(TokenService);
  });

  describe("issue", () => {
    it("returns the access token and how many seconds it lasts", async () => {
      await expect(service.issue(walter)).resolves.toEqual({
        accessToken: "signed.jwt.token",
        expiresIn: 900,
      });
    });

    // `sub` is what JwtAuthGuard later reads back as the signed-in member.
    // No role and no email: the guard reads the member from the database on
    // every request, so anything else in the token would only go stale.
    it("signs the member's id and username, and nothing else of theirs", async () => {
      await service.issue(walter);

      expect(jwtService.signAsync).toHaveBeenCalledTimes(1);
      expect(jwtService.signAsync).toHaveBeenCalledWith({ sub: 25, username: "walter" });
    });
  });
});
