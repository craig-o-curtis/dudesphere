// Decides whether the e2e suites may run against the databases .env names.
//
// The suites write rows through the app, and test/global-setup.ts then
// hard-deletes them. Both are only safe on a database that lives on this
// machine: a developer's own, or the throwaway one CI starts. If .env ever
// points anywhere else, the run has to stop before a single row is written.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isLocalHost(host: string): boolean {
  // An IPv6 address is written in brackets inside a URI.
  return LOCAL_HOSTS.has(host.replace(/^\[|\]$/g, "").toLowerCase());
}

/** The hosts a Mongo connection string names. Empty when it cannot be read. */
export function mongoHosts(uri: string): string[] {
  // mongodb://[user:password@]host1[:port][,host2[:port]]/database
  const match = /^mongodb:\/\/(?:[^@/]*@)?([^/?]+)/.exec(uri);
  if (!match) {
    return [];
  }
  return match[1].split(",").map((entry) => entry.replace(/:\d+$/, ""));
}

/**
 * Throws unless Postgres and every Mongo host are on this machine.
 *
 * A `mongodb+srv://` address always fails: it names a cluster looked up
 * through DNS, never a local server.
 */
export function assertLocalDatabases(pgHost: string, mongoUri: string): void {
  const remote: string[] = [];
  if (!isLocalHost(pgHost)) {
    remote.push(`Postgres at "${pgHost}"`);
  }
  const hosts = mongoHosts(mongoUri);
  if (hosts.length === 0 || !hosts.every(isLocalHost)) {
    remote.push(`Mongo at "${hosts.join(",") || "an address this check cannot read"}"`);
  }
  if (remote.length > 0) {
    throw new Error(
      `The e2e suites write and delete rows, so they only run against databases on this machine. ` +
        `Not local: ${remote.join(" and ")}. Point .env at a local database and run again.`,
    );
  }
}
