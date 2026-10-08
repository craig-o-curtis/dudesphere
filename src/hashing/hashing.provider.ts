/**
 * Turns a password into a hash, and checks a password against a hash.
 *
 * It is an abstract class, not an interface, so it can be the injection
 * token: a service asks for HashingProvider and never names the algorithm.
 * HashingModule decides which class stands behind it. Changing the algorithm
 * means writing one new class and changing that one line.
 */
export abstract class HashingProvider {
  /** Returns a salted hash. The same password gives a different hash each time. */
  // abstract is for a method with no body. This class only says what a hasher
  // must do. A subclass, such as BcryptProvider, says how. So:
  //   new HashingProvider()                        -> compile error
  //   class X extends HashingProvider {}           -> compile error, no hash()
  //   class X extends HashingProvider { hash() {...} compare() {...} }  -> fine
  //
  // salt means random data mixed into the password before it is hashed.
  // Without a salt, the same password always gives the same hash:
  //   "abc123" -> "e99a18..."   for every user who picked "abc123"
  // so one leaked hash unlocks all of them, and an attacker can look hashes up
  // in a ready-made table. With a salt, each hash is different:
  //   "abc123" + "x7Kq..." -> "$2b$10$x7Kq...9fQ"
  //   "abc123" + "Lm2p..." -> "$2b$10$Lm2p...c1T"
  // bcrypt makes a new salt on every call and keeps it inside the hash string,
  // which is how compare() can redo the work without a separate salt column.
  abstract hash(plain: string): Promise<string>;

  /**
   * True when `plain` is the password `hash` was made from.
   *
   * Pass `undefined` when there is no stored hash, as for an unknown email.
   * It still does the work of a compare and then answers false, so the
   * response time does not reveal which emails have an account.
   */
  abstract compare(plain: string, hash: string | undefined): Promise<boolean>;
}
