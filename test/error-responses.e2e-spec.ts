import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import type { App } from "supertest/types.js";

import { configureApp } from "./../src/app-setup.js";
import { AppModule } from "./../src/app.module.js";
import { listenOnLoopback } from "./listen-on-loopback.js";
import { signUp, type SignUpBody } from "./sign-up.js";

// The shape of an error response, end to end. Every other suite checks the
// status only; this one reads the body, so a change to a message, an
// errorCode or the validation array shape fails here.
//
// Needs the databases running. Creates one throwaway user per run.
describe("Error responses (e2e)", () => {
  let app: INestApplication<App>;
  let credentials: SignUpBody;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Same global middleware, pipes and filters as main.ts. See src/app-setup.ts.
    configureApp(app);
    await listenOnLoopback(app);

    ({ sent: credentials } = await signUp(app));
  });

  afterAll(async () => {
    await app.close();
  });

  // This is the service's own conflict check, not PgErrorFilter. The
  // filter only fires on a race, which a serial test cannot stage; its own
  // tests live in src/shared/filters.
  it("409 names the taken field and carries its errorCode", async () => {
    const { body } = await request(app.getHttpServer())
      .post("/auth/signup")
      .send(credentials)
      .expect(409);

    expect(body).toEqual({
      statusCode: 409,
      message: "Email already registered",
      error: "Conflict",
      errorCode: "EMAIL_TAKEN",
    });
  });

  it("401 says what is missing, with its errorCode", async () => {
    const { body } = await request(app.getHttpServer()).get("/users/me").expect(401);

    expect(body).toEqual({
      statusCode: 401,
      message: "Missing or invalid authorization header",
      error: "Unauthorized",
      errorCode: "TOKEN_MISSING",
    });
  });

  it("400 from validation lists each problem in message", async () => {
    const { body } = await request(app.getHttpServer())
      .post("/auth/signup")
      .send({ ...credentials, email: "not-an-email", extra: 1 })
      .expect(400);

    expect(body.statusCode).toBe(400);
    expect(body.error).toBe("Bad Request");
    expect(body.message).toEqual(
      expect.arrayContaining(["email must be an email", "property extra should not exist"]),
    );
  });

  it("404 names the resource", async () => {
    // GET /users/:id needs a token, so log in first.
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ identifier: credentials.email, password: credentials.password })
      .expect(200);
    const { accessToken: token } = login.body as { accessToken: string };

    // 2147483647 is the largest id the DTO accepts, so it passes validation
    // and reaches the service, which has no such row.
    const { body } = await request(app.getHttpServer())
      .get("/users/2147483647")
      .set({ authorization: `Bearer ${token}` })
      .expect(404);

    expect(body).toEqual({
      statusCode: 404,
      message: "User #2147483647 not found",
      error: "Not Found",
    });
  });

  it("every error response carries the request id header", async () => {
    const res = await request(app.getHttpServer()).get("/users/me").expect(401);

    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });
});
