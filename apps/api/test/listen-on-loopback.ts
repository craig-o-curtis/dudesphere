import type { INestApplication } from "@nestjs/common";

// Starts the app on a free port on 127.0.0.1. Call it in place of app.init().
//
// Without it, supertest starts the server itself for every request. It binds
// port 0 on every address, then sends the request to 127.0.0.1. macOS can give
// that bind a port another program already holds on 127.0.0.1 alone, such as
// VS Code, workerd or Notion. The request then reaches that program, and the
// test sees a stray 401, 404, ECONNRESET or timeout. Measured on one machine
// with 17 such programs: 32 of 30,000 binds, which is about 1 e2e run in 10.
//
// Binding to 127.0.0.1 itself makes the OS skip the ports taken there: 0 of
// 30,000. supertest sees the server is already listening and uses its port.
export async function listenOnLoopback(app: INestApplication): Promise<void> {
  await app.listen(0, "127.0.0.1");
}
