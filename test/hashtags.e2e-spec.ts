import { randomUUID } from "node:crypto";

import { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import type { App } from "supertest/types.js";

import { configureApp } from "./../src/app-setup.js";
import { AppModule } from "./../src/app.module.js";
import type { PaginatedResponse } from "./../src/shared/dto/paginated-response.js";
import { UserRole } from "./../src/users/user.entity.js";
import { listenOnLoopback } from "./listen-on-loopback.js";

// Needs the databases running. Each run registers one throwaway user, two
// abidings and one hashtag, which ends the run live again after being deleted
// and restored. test/global-setup.ts deletes all of them when the run ends.
describe("Hashtag delete and restore (e2e)", () => {
  let app: INestApplication<App>;

  // Signed here rather than logged in, so nothing depends on a seeded user.
  // RolesGuard reads the role from the token and looks nothing up.
  function tokenFor(role: UserRole) {
    return app.get(JwtService).signAsync({ sub: 2_000_000_000, username: "e2e", role });
  }

  function bearer(token: string) {
    return { authorization: `Bearer ${token}` };
  }

  // Letters and digits only, so it survives normalizeHashtag, and random, so
  // it cannot collide with a tag someone really used.
  function unusedSlug() {
    return `e2e${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  }

  // Every live slug, read the way a client fills a dropdown: the largest page
  // first, then links.next until there is none.
  //
  // One page is not enough here. The list is sorted by slug and the dev
  // database has tags of its own, so the tag under test may not be on page 1.
  // A "not on the list" check against page 1 alone would pass even if the
  // delete had done nothing.
  async function listEverySlug(): Promise<string[]> {
    const slugs: string[] = [];
    let next: string | null = "/hashtags?limit=100";
    while (next) {
      const page = await request(app.getHttpServer()).get(next).expect(200);
      const body = page.body as PaginatedResponse<{ slug: string }>;
      slugs.push(...body.data.map((hashtag) => hashtag.slug));
      next = body.links.next;
    }
    return slugs;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Same global pipes, filters and interceptor as main.ts, so this tests the
    // app that actually runs. See src/app-setup.ts.
    configureApp(app);
    await listenOnLoopback(app);
  });

  afterAll(async () => {
    await app.close();
  });

  // Every request in this block targets a slug that does not exist, so it
  // proves who may delete or restore a hashtag without changing one.
  describe("who may delete or restore", () => {
    it("returns 401 for a restore without a token", async () => {
      await request(app.getHttpServer()).post(`/hashtags/${unusedSlug()}/restore`).expect(401);
    });

    it("returns 403 for a restore by a signed-in user who is not an admin", async () => {
      await request(app.getHttpServer())
        .post(`/hashtags/${unusedSlug()}/restore`)
        .set(bearer(await tokenFor(UserRole.USER)))
        .expect(403);
    });

    // 404 shows the admin reached the service, which found no deleted tag.
    it("lets an admin through a restore, and returns 404 when no deleted tag matches", async () => {
      await request(app.getHttpServer())
        .post(`/hashtags/${unusedSlug()}/restore`)
        .set(bearer(await tokenFor(UserRole.ADMIN)))
        .expect(404);
    });

    it("returns 401 without a token", async () => {
      await request(app.getHttpServer()).delete(`/hashtags/${unusedSlug()}`).expect(401);
    });

    // 403, not 401: the caller proved who they are and is still not allowed.
    it("returns 403 for a signed-in user who is not an admin", async () => {
      await request(app.getHttpServer())
        .delete(`/hashtags/${unusedSlug()}`)
        .set(bearer(await tokenFor(UserRole.USER)))
        .expect(403);
    });

    // 404 shows the admin got past the guard and reached the service, which
    // found nothing to delete. It used to answer 200 for a delete that did
    // nothing.
    it("lets an admin through, and returns 404 for a tag that does not exist", async () => {
      await request(app.getHttpServer())
        .delete(`/hashtags/${unusedSlug()}`)
        .set(bearer(await tokenFor(UserRole.ADMIN)))
        .expect(404);
    });

    it("returns 404 to an admin for a slug that cannot be a hashtag", async () => {
      await request(app.getHttpServer())
        .delete("/hashtags/%23%23%23")
        .set(bearer(await tokenFor(UserRole.ADMIN)))
        .expect(404);
    });
  });

  // One tag followed through its whole life. The tests run in order and each
  // builds on the one before, so a failure early on fails the rest.
  describe("a deleted tag", () => {
    // Written with a capital so the restore can check the first casing
    // survived the delete. The slug is the lower-case form.
    const display = `E2e${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    const slug = display.toLowerCase();

    let authorToken: string;
    let firstUsedAt: string;

    function postWithTag(tag: string) {
      return request(app.getHttpServer())
        .post("/abidings")
        .set(bearer(authorToken))
        .send({ message: `the dude abides #${tag}` })
        .expect(201);
    }

    beforeAll(async () => {
      // A real user, because POST /abidings records the caller as the author.
      // randomUUID, not Date.now(), which the gmt lint rules ban.
      const tag = randomUUID().slice(0, 8);
      const credentials = { email: `e2e-${tag}@example.com`, password: "secret123" };
      await request(app.getHttpServer())
        .post("/users")
        .send({ ...credentials, username: `e2e-${tag}` })
        .expect(201);
      const login = await request(app.getHttpServer()).post("/auth").send(credentials).expect(201);
      authorToken = (login.body as { token: string }).token;

      await postWithTag(display);
    });

    it("is in the registry once an abiding has used it", async () => {
      const found = await request(app.getHttpServer()).get(`/hashtags/${slug}`).expect(200);

      const body = found.body as { display: string; firstUsedAt: string };
      expect(body.display).toBe(display);
      firstUsedAt = body.firstUsedAt;
    });

    it("survives a delete attempt by a user who is not an admin", async () => {
      await request(app.getHttpServer())
        .delete(`/hashtags/${slug}`)
        .set(bearer(await tokenFor(UserRole.USER)))
        .expect(403);

      await request(app.getHttpServer()).get(`/hashtags/${slug}`).expect(200);
    });

    it("is deleted by an admin", async () => {
      await request(app.getHttpServer())
        .delete(`/hashtags/${slug}`)
        .set(bearer(await tokenFor(UserRole.ADMIN)))
        .expect(204);
    });

    it("then reads as not found, and is gone from the list", async () => {
      await request(app.getHttpServer()).get(`/hashtags/${slug}`).expect(404);

      expect(await listEverySlug()).not.toContain(slug);
    });

    // The first delete matched a live tag. This one finds none, because the
    // delete only looks at tags that are still live.
    it("cannot be deleted a second time", async () => {
      await request(app.getHttpServer())
        .delete(`/hashtags/${slug}`)
        .set(bearer(await tokenFor(UserRole.ADMIN)))
        .expect(404);
    });

    // No cascade, on purpose. The abiding keeps the slug in its own hashtags
    // array, so filtering by it still works while the registry says 404.
    it("is still carried by the abidings that used it", async () => {
      const filtered = await request(app.getHttpServer())
        .get(`/abidings?hashtag=${slug}`)
        .expect(200);

      // The slug is unique to this run, so the total is exact even on a
      // database other suites are writing to.
      const body = filtered.body as PaginatedResponse<{ hashtags: string[] }>;
      expect(body.data).toHaveLength(1);
      expect(body.meta.totalItems).toBe(1);
      expect(body.data[0].hashtags).toContain(slug);
    });

    // A delete has to hold. The row is kept with deletedAt set, registerTags
    // matches it and writes nothing, so a new abiding carrying the tag does
    // not put it back on the list. If the row had been removed instead, this
    // post would register the tag again as if it were new.
    it("stays deleted when someone posts with it again", async () => {
      const posted = await postWithTag(slug);

      // The post itself is unaffected: the abiding carries the tag.
      expect((posted.body as { hashtags: string[] }).hashtags).toContain(slug);

      await request(app.getHttpServer()).get(`/hashtags/${slug}`).expect(404);

      expect(await listEverySlug()).not.toContain(slug);
    });

    it("is now carried by both abidings, and still off the list", async () => {
      const filtered = await request(app.getHttpServer())
        .get(`/abidings?hashtag=${slug}`)
        .expect(200);

      const body = filtered.body as PaginatedResponse<unknown>;
      expect(body.data).toHaveLength(2);
      expect(body.meta.totalItems).toBe(2);
    });

    it("cannot be restored by a user who is not an admin", async () => {
      await request(app.getHttpServer())
        .post(`/hashtags/${slug}/restore`)
        .set(bearer(await tokenFor(UserRole.USER)))
        .expect(403);

      await request(app.getHttpServer()).get(`/hashtags/${slug}`).expect(404);
    });

    // The row was kept through the delete, so this is the original tag coming
    // back, not a new one. The second abiding wrote the tag in lower case and
    // at a later time; neither replaced the first casing or the first date.
    it("is restored by an admin, with its first casing and date", async () => {
      const restored = await request(app.getHttpServer())
        .post(`/hashtags/${slug}/restore`)
        .set(bearer(await tokenFor(UserRole.ADMIN)))
        .expect(200);

      const body = restored.body as { slug: string; display: string; firstUsedAt: string };
      expect(body.slug).toBe(slug);
      expect(body.display).toBe(display);
      expect(body.firstUsedAt).toBe(firstUsedAt);
    });

    it("is then back in the registry and on the list", async () => {
      await request(app.getHttpServer()).get(`/hashtags/${slug}`).expect(200);

      expect(await listEverySlug()).toContain(slug);
    });

    // Only a deleted tag can be restored, the same as restoring a user.
    it("cannot be restored a second time, because it is no longer deleted", async () => {
      await request(app.getHttpServer())
        .post(`/hashtags/${slug}/restore`)
        .set(bearer(await tokenFor(UserRole.ADMIN)))
        .expect(404);
    });
  });

  it("leaves the public reads open", async () => {
    await request(app.getHttpServer()).get("/hashtags").expect(200);
  });
});
