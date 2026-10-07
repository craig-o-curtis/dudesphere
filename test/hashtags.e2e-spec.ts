import { randomUUID } from "node:crypto";

import { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import type { App } from "supertest/types.js";

import { configureApp } from "./../src/app-setup.js";
import { AppModule } from "./../src/app.module.js";
import { UserRole } from "./../src/users/user.entity.js";

// Needs the databases running. Each run registers one throwaway user and
// leaves behind that user, two abidings and one hashtag, which ends the run
// deleted.
describe("DELETE /hashtags/:slug (e2e)", () => {
  let app: INestApplication<App>;

  // Signed here rather than logged in, so nothing depends on a seeded user.
  // RolesGuard reads the role from the token and looks nothing up.
  const tokenFor = (role: UserRole) =>
    app.get(JwtService).signAsync({ sub: 2_000_000_000, username: "e2e", role });

  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

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

  // Every delete in this block targets a slug that does not exist, so it
  // proves who may delete a hashtag without removing one.
  describe("who may delete", () => {
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
    // Written with a capital to check the registry keeps the casing a tag was
    // first written with. The slug is the lower-case form.
    const display = `E2e${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    const slug = display.toLowerCase();

    let authorToken: string;

    const postWithTag = (tag: string) =>
      request(app.getHttpServer())
        .post("/abidings")
        .set(bearer(authorToken))
        .send({ message: `the dude abides #${tag}` })
        .expect(201);

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

      expect((found.body as { display: string }).display).toBe(display);
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
        .expect(200);
    });

    it("then reads as not found, and is gone from the list", async () => {
      await request(app.getHttpServer()).get(`/hashtags/${slug}`).expect(404);

      const list = await request(app.getHttpServer()).get("/hashtags").expect(200);
      const slugs = (list.body as { slug: string }[]).map((hashtag) => hashtag.slug);
      expect(slugs).not.toContain(slug);
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

      const abidings = filtered.body as { hashtags: string[] }[];
      expect(abidings).toHaveLength(1);
      expect(abidings[0].hashtags).toContain(slug);
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

      const list = await request(app.getHttpServer()).get("/hashtags").expect(200);
      const slugs = (list.body as { slug: string }[]).map((hashtag) => hashtag.slug);
      expect(slugs).not.toContain(slug);
    });

    it("is now carried by both abidings, and still off the list", async () => {
      const filtered = await request(app.getHttpServer())
        .get(`/abidings?hashtag=${slug}`)
        .expect(200);

      expect(filtered.body as unknown[]).toHaveLength(2);
    });
  });

  it("leaves the public reads open", async () => {
    await request(app.getHttpServer()).get("/hashtags").expect(200);
  });
});
