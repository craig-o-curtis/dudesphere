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

// Needs the databases running. Each run registers one throwaway user, three
// abidings and one hashtag. test/global-setup.ts deletes all of them when the
// run ends.
//
// The unit specs prove each service asks for the right sort, skip and limit.
// Only a real database proves the answer: that the rows come back in that
// order, that a page holds what the page before it did not, and that the
// total counts the filtered list.
describe("Pagination (e2e)", () => {
  let app: INestApplication<App>;

  interface AbidingBody {
    id: string;
    message: string;
  }

  // Signed here rather than logged in, so nothing depends on a seeded user.
  // RolesGuard reads the role from the token and looks nothing up.
  function tokenFor(role: UserRole) {
    return app.get(JwtService).signAsync({ sub: 2_000_000_000, username: "e2e", role });
  }

  function bearer(token: string) {
    return { authorization: `Bearer ${token}` };
  }

  async function getPage<T>(url: string, token?: string): Promise<PaginatedResponse<T>> {
    const get = request(app.getHttpServer()).get(url);
    const response = await (token ? get.set(bearer(token)) : get).expect(200);
    return response.body as PaginatedResponse<T>;
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

  // Three abidings by one new user, all carrying one new tag. The user id and
  // the tag are unique to this run, so a list filtered by either holds these
  // three and nothing else, whatever else is in the dev database.
  describe("a list of three abidings, two to a page", () => {
    // e2e plus 12 hex characters, the shape test/global-setup.ts deletes.
    const slug = `e2e${randomUUID().replaceAll("-", "").slice(0, 12)}`;

    let authorId: number;
    let authorToken: string;
    // In the order they were posted: oldest first.
    const posted: string[] = [];

    beforeAll(async () => {
      // randomUUID, not Date.now(), which the gmt lint rules ban.
      const tag = randomUUID().slice(0, 8);
      const credentials = { email: `e2e-${tag}@example.com`, password: "secret123" };
      const user = await request(app.getHttpServer())
        .post("/users")
        .send({ ...credentials, username: `e2e-${tag}` })
        .expect(201);
      authorId = (user.body as { id: number }).id;
      const login = await request(app.getHttpServer()).post("/auth").send(credentials).expect(201);
      authorToken = (login.body as { token: string }).token;

      // One at a time, so "posted later" and "newer" mean the same thing.
      for (const message of ["first", "second", "third"]) {
        const abiding = await request(app.getHttpServer())
          .post("/abidings")
          .set(bearer(authorToken))
          .send({ message: `${message} #${slug}` })
          .expect(201);
        posted.push((abiding.body as AbidingBody).id);
      }
    });

    it("returns the newest two first, and says there are three", async () => {
      const page = await getPage<AbidingBody>(`/abidings?userId=${authorId}&limit=2`);

      expect(page.data.map((abiding) => abiding.id)).toEqual([posted[2], posted[1]]);
      expect(page.meta).toEqual({
        itemsPerPage: 2,
        totalItems: 3,
        currentPage: 1,
        totalPages: 2,
      });
      expect(page.links.previous).toBeNull();
      expect(page.links.next).toBe(`/abidings?userId=${authorId}&limit=2&page=2`);
    });

    // The link is followed as the API wrote it, which also proves it is a URL
    // the API accepts.
    it("reaches the oldest one by following links.next, with nothing repeated", async () => {
      const first = await getPage<AbidingBody>(`/abidings?userId=${authorId}&limit=2`);
      const second = await getPage<AbidingBody>(first.links.next ?? "");

      expect(second.data.map((abiding) => abiding.id)).toEqual([posted[0]]);
      expect(second.meta.currentPage).toBe(2);
      expect(second.links.next).toBeNull();
      expect(second.links.previous).toBe(`/abidings?userId=${authorId}&limit=2&page=1`);
    });

    it("answers a page past the end with 200 and no rows", async () => {
      const page = await getPage<AbidingBody>(`/abidings?userId=${authorId}&limit=2&page=9`);

      expect(page.data).toEqual([]);
      expect(page.meta.totalItems).toBe(3);
      expect(page.links.next).toBeNull();
      // Back to the last page that has rows.
      expect(page.links.previous).toBe(`/abidings?userId=${authorId}&limit=2&page=2`);
    });

    // The tag is sent with its "#", as a person would type it. The links must
    // carry it escaped, or following one would lose the filter.
    it("pages a list filtered by tag, and keeps the tag in the links", async () => {
      const first = await getPage<AbidingBody>(`/abidings?hashtag=%23${slug}&limit=2`);

      expect(first.data.map((abiding) => abiding.id)).toEqual([posted[2], posted[1]]);
      expect(first.meta.totalItems).toBe(3);
      expect(first.links.next).toBe(`/abidings?hashtag=%23${slug}&limit=2&page=2`);

      const second = await getPage<AbidingBody>(first.links.next ?? "");
      expect(second.data.map((abiding) => abiding.id)).toEqual([posted[0]]);
    });

    // Two tags go down the $in branch. The second tag matches nothing, so the
    // list is the same three.
    it("pages a list filtered by several tags", async () => {
      const page = await getPage<AbidingBody>(
        `/abidings?hashtag=${slug},e2e000000000000&userId=${authorId}&limit=2`,
      );

      expect(page.data.map((abiding) => abiding.id)).toEqual([posted[2], posted[1]]);
      expect(page.meta.totalItems).toBe(3);
    });

    it("pages the caller's own abidings on GET /abidings/me", async () => {
      const first = await getPage<AbidingBody>("/abidings/me?limit=2", authorToken);

      expect(first.data.map((abiding) => abiding.id)).toEqual([posted[2], posted[1]]);
      expect(first.meta.totalItems).toBe(3);
      expect(first.links.next).toBe("/abidings/me?limit=2&page=2");

      const second = await getPage<AbidingBody>(first.links.next ?? "", authorToken);
      expect(second.data.map((abiding) => abiding.id)).toEqual([posted[0]]);
    });
  });

  // No totals are asserted below. These lists are not filtered, so other
  // suites and the dev data change their size while this one runs.
  describe("the lists that are not filtered", () => {
    it("returns users in id order", async () => {
      const page = await getPage<{ id: number }>(
        "/users?limit=100",
        await tokenFor(UserRole.ADMIN),
      );

      const ids = page.data.map((user) => user.id);
      expect(ids).toEqual(ids.toSorted((a, b) => a - b));
    });

    it("returns profiles in id order", async () => {
      const page = await getPage<{ id: number }>("/profiles?limit=100");

      const ids = page.data.map((profile) => profile.id);
      expect(ids).toEqual(ids.toSorted((a, b) => a - b));
    });

    it("returns hashtags in slug order", async () => {
      const page = await getPage<{ slug: string }>("/hashtags?limit=100");

      const slugs = page.data.map((hashtag) => hashtag.slug);
      expect(slugs).toEqual(slugs.toSorted());
    });

    // The last page the API allows. With 10 rows to a page it starts ten
    // million rows in, so it is empty, and the answer is still a 200.
    it("answers the last allowed page with 200 and no rows", async () => {
      const page = await getPage<unknown>("/profiles?page=1000000");

      expect(page.data).toEqual([]);
      expect(page.links.next).toBeNull();
    });

    it("rejects a limit over 100 with 400 on every list", async () => {
      const admin = await tokenFor(UserRole.ADMIN);
      for (const path of ["/users", "/profiles", "/abidings", "/abidings/me", "/hashtags"]) {
        await request(app.getHttpServer()).get(`${path}?limit=101`).set(bearer(admin)).expect(400);
      }
    });
  });
});
