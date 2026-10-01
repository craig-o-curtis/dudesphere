import { Test, TestingModule } from "@nestjs/testing";

import { UsersService } from "../users/users.service.js";
import { AuthStateService } from "./auth-state.service.js";
import { AuthService } from "./auth.service.js";

describe("AuthService", () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: AuthStateService, useValue: {} },
        { provide: UsersService, useValue: {} },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });
});
