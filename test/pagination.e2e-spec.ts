import { randomUUID } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";

import { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test, TestingModule } from "@nestjs/testing";
import { addUtc, isBeforeUtc, subtractUtc } from "@northguild/gmt";
import request from "supertest";
import type { App } from "supertest/types.js";

import { configureApp } from "./../src/app-setup.js";
import { AppModule } from "./../src/app.module.js";
import type { Paginated } from "./../src/shared/pagination/paginated.interface.js";
import { UserRole } from "./../src/users/user.entity.js";
import { listenOnLoopback } from "./listen-on-loopback.js";

// Needs the databases running. Each run registers three throwaway users, five
// abidings and three hashtags. test/global-setup.ts deletes all of them when
// the run ends.
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
    createdAt: string;
  }

  // Signed here rather than logged in, so nothing depends on a seeded user.
  // RolesGuard reads the role from the token and looks nothing up.
  function tokenFor(role: UserRole) {
    return app.get(JwtService).signAsync({ sub: 2_000_000_000, username: "e2e", role });
  }

  function bearer(token: string) {
    return { authorization: `Bearer ${token}` };
  }

  async function getPage<T>(url: string, token?: string): Promise<Paginated<T>> {
    const get = request(app.getHttpServer()).get(url);
    const response = await (token ? get.set(bearer(token)) : get).expect(200);
    return response.body as Paginated<T>;
  }

  // A whole list: the largest page first, then links.next until there is none.
  async function getEveryPage<T>(url: string, token?: string): Promise<T[]> {
    const rows: T[] = [];
    let next: string | null = url;
    while (next) {
      const page: Paginated<T> = await getPage<T>(next, token);
      rows.push(...page.data);
      next = page.links.next;
    }
    return rows;
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
    // When each one was created, in the same order. UTC instants, as the API
    // returns them.
    const postedAt: string[] = [];

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
        postedAt.push((abiding.body as AbidingBody).createdAt);
        // createdAt is kept to the millisecond. The pause puts each abiding
        // in a millisecond of its own, so a date range can tell them apart.
        await pause(5);
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

    // The unit specs prove the service builds { $gte, $lt } on createdAt.
    // Only Mongo proves the answer: that it compares the strings it is given
    // as dates, that the start is included and that the end is not.
    //
    // Every request carries userId, so the lists hold these three abidings
    // and nothing else.
    describe("filtered by a date range", () => {
      function ids(page: Paginated<AbidingBody>) {
        return page.data.map((abiding) => abiding.id);
      }

      // What the tests below rely on. If this fails, they mean nothing.
      it("has three abidings created at three different instants", () => {
        expect(isBeforeUtc(postedAt[0], postedAt[1])).toBe(true);
        expect(isBeforeUtc(postedAt[1], postedAt[2])).toBe(true);
      });

      it("includes an abiding created exactly at startDate", async () => {
        const page = await getPage<AbidingBody>(
          `/abidings?userId=${authorId}&startDate=${postedAt[1]}`,
        );

        expect(ids(page)).toEqual([posted[2], posted[1]]);
        expect(page.meta.totalItems).toBe(2);
      });

      it("leaves out an abiding created one millisecond before startDate", async () => {
        const justAfterSecond = addUtc(postedAt[1], { milliseconds: 1 });

        const page = await getPage<AbidingBody>(
          `/abidings?userId=${authorId}&startDate=${justAfterSecond}`,
        );

        expect(ids(page)).toEqual([posted[2]]);
      });

      it("leaves out an abiding created exactly at endDate", async () => {
        const page = await getPage<AbidingBody>(
          `/abidings?userId=${authorId}&endDate=${postedAt[1]}`,
        );

        expect(ids(page)).toEqual([posted[0]]);
        expect(page.meta.totalItems).toBe(1);
      });

      it("includes an abiding created one millisecond before endDate", async () => {
        const justAfterSecond = addUtc(postedAt[1], { milliseconds: 1 });

        const page = await getPage<AbidingBody>(
          `/abidings?userId=${authorId}&endDate=${justAfterSecond}`,
        );

        expect(ids(page)).toEqual([posted[1], posted[0]]);
      });

      it("takes both ends at once", async () => {
        const page = await getPage<AbidingBody>(
          `/abidings?userId=${authorId}&startDate=${postedAt[0]}&endDate=${postedAt[2]}`,
        );

        expect(ids(page)).toEqual([posted[1], posted[0]]);
        expect(page.meta.totalItems).toBe(2);
      });

      it("returns all three for a range that starts before them and ends after", async () => {
        const before = subtractUtc(postedAt[0], { seconds: 1 });
        const after = addUtc(postedAt[2], { seconds: 1 });

        const page = await getPage<AbidingBody>(
          `/abidings?userId=${authorId}&startDate=${before}&endDate=${after}`,
        );

        expect(ids(page)).toEqual([posted[2], posted[1], posted[0]]);
      });

      it("returns an empty list for a range that ends before the first one", async () => {
        const page = await getPage<AbidingBody>(
          `/abidings?userId=${authorId}&endDate=${subtractUtc(postedAt[0], { seconds: 1 })}`,
        );

        expect(page.data).toEqual([]);
        expect(page.meta.totalItems).toBe(0);
      });

      it("narrows a list that is also filtered by tag", async () => {
        const page = await getPage<AbidingBody>(
          `/abidings?userId=${authorId}&hashtag=${slug}&startDate=${postedAt[1]}`,
        );

        expect(ids(page)).toEqual([posted[2], posted[1]]);
        expect(page.meta.totalItems).toBe(2);
      });

      // Following `next` has to stay inside the range.
      it("keeps the dates in the links", async () => {
        const before = subtractUtc(postedAt[0], { seconds: 1 });

        const first = await getPage<AbidingBody>(
          `/abidings?userId=${authorId}&startDate=${before}&limit=2`,
        );

        expect(first.links.next).toBe(
          `/abidings?userId=${authorId}&startDate=${encodeURIComponent(before)}&limit=2&page=2`,
        );
        const second = await getPage<AbidingBody>(first.links.next ?? "");
        expect(ids(second)).toEqual([posted[0]]);
      });

      it("answers a startDate after the endDate with 400", async () => {
        await request(app.getHttpServer())
          .get(`/abidings?userId=${authorId}&startDate=${postedAt[2]}&endDate=${postedAt[0]}`)
          .expect(400);
      });

      it("answers a date with no time with 400", async () => {
        await request(app.getHttpServer())
          .get(`/abidings?userId=${authorId}&startDate=2026-10-01`)
          .expect(400);
      });
    });
  });

  // No totals are asserted below. These lists are not filtered, so other
  // suites and the dev data change their size while this one runs.
  //
  // Each order test is built so that it fails if the sort is removed. A list
  // read in the order the rows happen to be stored would pass a plain "is it
  // sorted" check most of the time, and always on an empty list.
  describe("the lists that are not filtered", () => {
    interface Account {
      id: number;
      profileId: number;
      token: string;
    }

    let first: Account;
    let second: Account;

    // e2e plus 12 hex characters, the shape test/global-setup.ts deletes. The
    // fourth character fixes the order: "0" sorts before "f".
    const hex = randomUUID().replaceAll("-", "").slice(0, 11);
    const earlySlug = `e2e0${hex}`;
    const lateSlug = `e2ef${hex}`;

    async function signUp(): Promise<Account> {
      // randomUUID, not Date.now(), which the gmt lint rules ban.
      const tag = randomUUID().slice(0, 8);
      const credentials = { email: `e2e-${tag}@example.com`, password: "secret123" };
      const user = await request(app.getHttpServer())
        .post("/users")
        .send({ ...credentials, username: `e2e-${tag}` })
        .expect(201);
      const login = await request(app.getHttpServer()).post("/auth").send(credentials).expect(201);
      const body = user.body as { id: number; profile: { id: number } };
      return {
        id: body.id,
        profileId: body.profile.id,
        token: (login.body as { token: string }).token,
      };
    }

    beforeAll(async () => {
      first = await signUp();
      second = await signUp();

      // Editing a row makes Postgres write a new copy of it further along in
      // the table. With no ORDER BY, the first user and the first profile
      // would now come back after the second ones.
      await request(app.getHttpServer())
        .patch("/users/me")
        .set(bearer(first.token))
        .send({ username: `e2e-${randomUUID().slice(0, 8)}` })
        .expect(200);
      await request(app.getHttpServer())
        .patch("/profiles/me")
        .set(bearer(first.token))
        .send({ bio: "edited after the second profile was made" })
        .expect(200);

      // The late slug is registered first. With no sort, Mongo would return
      // the tags in the order they were stored, late before early.
      for (const slug of [lateSlug, earlySlug]) {
        await request(app.getHttpServer())
          .post("/abidings")
          .set(bearer(first.token))
          .send({ message: `the dude abides #${slug}` })
          .expect(201);
      }
    });

    it("returns users in id order, even after the first one is edited", async () => {
      const users = await getEveryPage<{ id: number }>(
        "/users?limit=100",
        await tokenFor(UserRole.ADMIN),
      );
      const ids = users.map((user) => user.id);

      expect(ids).toContain(first.id);
      expect(ids.indexOf(first.id)).toBeLessThan(ids.indexOf(second.id));
    });

    it("returns profiles in id order, even after the first one is edited", async () => {
      const profiles = await getEveryPage<{ id: number }>("/profiles?limit=100");
      const ids = profiles.map((profile) => profile.id);

      expect(ids).toContain(first.profileId);
      expect(ids.indexOf(first.profileId)).toBeLessThan(ids.indexOf(second.profileId));
    });

    it("returns hashtags in slug order, not the order they were first used", async () => {
      const hashtags = await getEveryPage<{ slug: string }>("/hashtags?limit=100");
      const slugs = hashtags.map((hashtag) => hashtag.slug);

      expect(slugs).toContain(earlySlug);
      expect(slugs.indexOf(earlySlug)).toBeLessThan(slugs.indexOf(lateSlug));
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
