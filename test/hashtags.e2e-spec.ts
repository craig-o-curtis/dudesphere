import { randomUUID } from "node:crypto";

import { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import type { App } from "supertest/types.js";

import { configureApp } from "./../src/app-setup.js";
import { AppModule } from "./../src/app.module.js";
import { UserRole } from "./../src/users/user.entity.js";

// Needs the databases running. Every delete here targets a slug that does not
// exist, so the suite proves who may delete a hashtag without removing one.
describe("DELETE /hashtags/:slug (e2e)", () => {
  let app: INestApplication<App>;

  // Signed here rather than logged in, so nothing depends on a seeded user.
  // RolesGuard reads the role from the token and looks nothing up.
  const tokenFor = (role: UserRole) =>
    app.get(JwtService).signAsync({ sub: 2_000_000_000, username: "e2e", role });

  // Letters and digits only, so it survives normalizeHashtag, and random, so
  // it cannot collide with a tag someone really used.
  const unusedSlug = () => `e2e${randomUUID().replaceAll("-", "").slice(0, 12)}`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Same global pipes, filters and interceptor as main.ts, so this tests the
    // app that actually runs. See src/app-setup.ts.
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 401 without a token", async () => {
    await request(app.getHttpServer()).delete(`/hashtags/${unusedSlug()}`).expect(401);
  });

  // 403, not 401: the caller proved who they are and is still not allowed.
  it("returns 403 for a signed-in user who is not an admin", async () => {
    const token = await tokenFor(UserRole.USER);

    await request(app.getHttpServer())
      .delete(`/hashtags/${unusedSlug()}`)
      .set({ authorization: `Bearer ${token}` })
      .expect(403);
  });

  // 404 shows the admin got past the guard and reached the service, which
  // found nothing to delete. It used to answer 200 for a delete that did nothing.
  it("lets an admin through, and returns 404 for a tag that does not exist", async () => {
    const token = await tokenFor(UserRole.ADMIN);

    await request(app.getHttpServer())
      .delete(`/hashtags/${unusedSlug()}`)
      .set({ authorization: `Bearer ${token}` })
      .expect(404);
  });

  it("returns 404 to an admin for a slug that cannot be a hashtag", async () => {
    const token = await tokenFor(UserRole.ADMIN);

    await request(app.getHttpServer())
      .delete("/hashtags/%23%23%23")
      .set({ authorization: `Bearer ${token}` })
      .expect(404);
  });

  it("leaves the public reads open", async () => {
    await request(app.getHttpServer()).get("/hashtags").expect(200);
  });
});
