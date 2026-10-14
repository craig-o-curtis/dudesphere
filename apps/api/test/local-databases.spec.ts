import { assertLocalDatabases, mongoHosts } from "./local-databases.js";

describe("assertLocalDatabases", () => {
  const LOCAL_MONGO = "mongodb://localhost:27017/dude-abidings";

  it.each([
    ["the defaults", "localhost", LOCAL_MONGO],
    ["loopback addresses", "127.0.0.1", "mongodb://127.0.0.1:27017/dude-abidings"],
    ["IPv6 loopback", "::1", "mongodb://[::1]:27017/dude-abidings"],
    [
      "a Mongo address with a user and options",
      "localhost",
      "mongodb://dude:pw@localhost:27017/db?authSource=admin",
    ],
    ["upper case", "LOCALHOST", LOCAL_MONGO],
  ])("allows %s", (_what, pgHost, mongoUri) => {
    expect(() => assertLocalDatabases(pgHost, mongoUri)).not.toThrow();
  });

  it.each([
    ["a remote Postgres", "db.example.com", LOCAL_MONGO, 'Postgres at "db.example.com"'],
    [
      "a remote Mongo",
      "localhost",
      "mongodb://mongo.example.com:27017/db",
      'Mongo at "mongo.example.com"',
    ],
    // One local host does not make the set local.
    [
      "a Mongo set with one remote host",
      "localhost",
      "mongodb://localhost:27017,mongo.example.com:27017/db",
      "mongo.example.com",
    ],
    // A cluster looked up through DNS is never this machine.
    [
      "a mongodb+srv address",
      "localhost",
      "mongodb+srv://cluster0.example.mongodb.net/db",
      "cannot read",
    ],
    [
      "a password that contains a local-looking host",
      "localhost",
      "mongodb://dude:localhost@mongo.example.com/db",
      "mongo.example.com",
    ],
  ])("refuses %s", (_what, pgHost, mongoUri, named) => {
    expect(() => assertLocalDatabases(pgHost, mongoUri)).toThrow(named);
  });

  it("names both when both are remote", () => {
    expect(() => assertLocalDatabases("db.example.com", "mongodb://mongo.example.com/db")).toThrow(
      /Postgres at "db.example.com" and Mongo at "mongo.example.com"/,
    );
  });
});

describe("mongoHosts", () => {
  it("lists every host without its port", () => {
    expect(mongoHosts("mongodb://a.example:27017,b.example:27018/db")).toEqual([
      "a.example",
      "b.example",
    ]);
  });

  it("returns nothing for an address it cannot read", () => {
    expect(mongoHosts("not a uri")).toEqual([]);
  });
});
