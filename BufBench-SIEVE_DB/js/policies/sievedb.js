import { Sieve } from "./sieve.js";

// SIEVE_DB (Algorithm 1 in the EDBT 2027 paper)
// - Each frame has: v (visited), p (protected), t (when aging started, 0 = not aging).
// - Hit: t = 0. If v = 0 → v = 1. Else if p = 0 → p = 1. The page does NOT move.
// - New page goes to the head with v = 0, p = 0, t = 0.
// - To evict: the hand moves from tail to head.
//     v = 1          → v = 0. If p = 1, start aging (t = current pass). Move on.
//     v = 0, p = 1   → if (current pass − t) ≥ A, remove protection (p = 0, t = 0). Move on.
//     v = 0, p = 0   → evict this page
// - A is a setting (default 2).
//
// It uses the same queue and hand as SIEVE; only the hit and skip rules change.

export class SieveDB extends Sieve {
  constructor(capacity, options = {}) {
    super(capacity, options);
    this.A = options.A ?? 2;
  }
  get name() { return "SIEVE_DB"; }

  onHit(page) {
    const n = this.nodes.get(page);
    n.t = 0;
    if (n.v === 0) n.v = 1;
    else if (n.p === 0) n.p = 1;
  }

  skip(n) {
    if (n.v === 1) {
      n.v = 0;
      if (n.p === 1) n.t = this.pass;            // start aging
      return true;
    }
    if (n.p === 1) {
      if (this.pass - n.t >= this.A) { n.p = 0; n.t = 0; }   // protection ages out
      return true;
    }
    return false;                                 // v = 0, p = 0 → victim
  }
}