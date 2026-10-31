// All policies in one place. The key is the same name PostgreSQL's
// eviction_algorithm setting uses in the SIEVE_DB code.

import { Clock } from "./clock.js";
import { LRU } from "./lru.js";
import { CFLRU } from "./cflru.js";
import { LRUWSR } from "./lruwsr.js";
import { Sieve } from "./sieve.js";
import { SieveDB } from "./sievedb.js";

export const POLICY_CLASSES = {
  clock: Clock,
  lru: LRU,
  cflru: CFLRU,
  lruwsr: LRUWSR,
  sieve: Sieve,
  sieve_db: SieveDB,
};

export function makePolicy(key, capacity, options = {}) {
  return new POLICY_CLASSES[key](capacity, options);
}