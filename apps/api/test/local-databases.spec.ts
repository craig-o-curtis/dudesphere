import { assertLocalDatabases, mongoHosts, mongoRoutingOptions } from "./local-databases.js";

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
    [
      "directConnection=true",
      "localhost",
      "mongodb://localhost:27017/dude-abidings?directConnection=true",
    ],
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

  // SEC-5 (WEB-54 security review, round 3). These options keep the hosts
  // reading ["localhost:27017"] in the mongodb 7.6.0 driver, but send the
  // connection elsewhere, where the e2e cleanup would hard-delete rows.
  describe("SEC-5: a local Mongo address can't be routed off this machine", () => {
    it.each([
      [
        "a SOCKS5 proxy",
        "mongodb://localhost:27017/dude-abidings?proxyHost=mongo-proxy.example.com",
        "proxyHost",
      ],
      [
        "replica set discovery",
        "mongodb://localhost:27017/dude-abidings?replicaSet=rs0",
        "replicaSet",
      ],
      [
        "an option name in another case",
        "mongodb://localhost:27017/dude-abidings?PROXYHOST=mongo-proxy.example.com",
        "proxyHost",
      ],
      [
        "proxyPort on its own",
        "mongodb://localhost:27017/dude-abidings?authSource=admin&proxyPort=1080",
        "proxyPort",
      ],
      [
        "a load balancer",
        "mongodb://localhost:27017/dude-abidings?loadBalanced=true",
        "loadBalanced",
      ],
      [
        "directConnection=false",
        "mongodb://localhost:27017/dude-abidings?directConnection=false",
        "directConnection=false",
      ],
    ])("refuses a local Mongo address with %s", (_what, mongoUri, named) => {
      expect(() => assertLocalDatabases("localhost", mongoUri)).toThrow(named);
    });
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

describe("mongoRoutingOptions", () => {
  it("returns nothing for an address with no options", () => {
    expect(mongoRoutingOptions("mongodb://localhost:27017/db")).toEqual([]);
  });

  it("ignores options that keep the connection on the listed hosts", () => {
    expect(
      mongoRoutingOptions("mongodb://localhost:27017/db?authSource=admin&directConnection=true"),
    ).toEqual([]);
  });

  it("names every routing option, in the case the docs use", () => {
    expect(
      mongoRoutingOptions(
        "mongodb://localhost/db?proxyhost=p.example.com&proxyUsername=u&replicaset=rs0",
      ),
    ).toEqual(["proxyHost", "proxyUsername", "replicaSet"]);
  });
});
