// Decides whether the e2e suites may run against the databases .env names.
//
// The suites write rows through the app, and the cleanup in
// test/e2e-cleanup.ts then hard-deletes them. Both are only safe on a database that lives on this
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

// Options in a Mongo address that send the connection past the hosts it
// lists, so a local host proves nothing. The driver reads option names in any
// case, so they are kept here in lower case.
// - proxyHost and the other proxy options: every connection goes through a
//   SOCKS5 proxy, which resolves "localhost" on its own machine.
// - replicaSet: the driver follows the set's member list, which can name
//   remote hosts.
// - loadBalanced: the listed host is a load balancer that forwards elsewhere.
//   The e2e cleanup connects with directConnection, which the driver refuses
//   to combine with it anyway.
// directConnection=false is refused too: it turns on the same discovery as
// replicaSet. srvHost needs no entry: only a mongodb+srv address sets it, and
// that is refused already.
const ROUTING_OPTIONS = new Map([
  ["proxyhost", "proxyHost"],
  ["proxyport", "proxyPort"],
  ["proxyusername", "proxyUsername"],
  ["proxypassword", "proxyPassword"],
  ["replicaset", "replicaSet"],
  ["loadbalanced", "loadBalanced"],
]);

/** The options in a Mongo address that could route it off the hosts it lists. */
export function mongoRoutingOptions(uri: string): string[] {
  const start = uri.indexOf("?");
  if (start === -1) {
    return [];
  }
  const found: string[] = [];
  for (const [key, value] of new URLSearchParams(uri.slice(start + 1))) {
    const name = ROUTING_OPTIONS.get(key.toLowerCase());
    if (name) {
      found.push(name);
    } else if (key.toLowerCase() === "directconnection" && value.toLowerCase() !== "true") {
      found.push(`directConnection=${value}`);
    }
  }
  return found;
}

/**
 * Throws unless Postgres and every Mongo host are on this machine.
 *
 * A `mongodb+srv://` address always fails: it names a cluster looked up
 * through DNS, never a local server. So does a Mongo address with an option
 * that can route the connection past the hosts it lists, such as proxyHost or
 * replicaSet (see ROUTING_OPTIONS). This only refuses: it never changes how
 * the app connects.
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
  const routing = mongoRoutingOptions(mongoUri);
  if (routing.length > 0) {
    remote.push(`Mongo with ${routing.join(", ")}, which can route the connection elsewhere`);
  }
  if (remote.length > 0) {
    throw new Error(
      `The e2e suites write and delete rows, so they only run against databases on this machine. ` +
        `Not local: ${remote.join(" and ")}. Point .env at a local database and run again.`,
    );
  }
}
