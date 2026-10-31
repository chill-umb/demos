import { Policy } from "./policy.js";

// SIEVE
// - Each frame has one "visited" bit (v).
// - Hit: v = 1. The page does NOT move.
// - New page goes to the head with v = 0.
// - To evict: the hand moves from tail (oldest) to head (newest).
//     v = 1 → set v = 0 and move on
//     v = 0 → evict this page
//
// The queue is a linked list. Each node points to the next newer one.
// SieveDB (sievedb.js) reuses this list.

export class Sieve extends Policy {
  constructor(capacity, options = {}) {
    super(capacity, options);
    this.nodes = new Map();   // page id -> node
    this.head = null;         // newest
    this.tail = null;         // oldest
    this.hand = null;
    this.pass = 1;            // goes up by 1 every time the hand wraps around
  }
  get name() { return "SIEVE"; }
  has(page) { return this.nodes.has(page); }
  get size() { return this.nodes.size; }

  onHit(page) { this.nodes.get(page).v = 1; }

  insert(page) {
    const node = { page, v: 0, p: 0, t: 0, newer: null, older: this.head };
    if (this.head) this.head.newer = node;
    this.head = node;
    if (!this.tail) this.tail = node;
    this.nodes.set(page, node);
  }

  // Move the hand one step toward the head. Wrap to the tail at the end.
  step(node) {
    if (node.newer) return node.newer;
    this.pass++;
    return this.tail;
  }

  remove(node) {
    if (node.older) node.older.newer = node.newer; else this.tail = node.newer;
    if (node.newer) node.newer.older = node.older; else this.head = node.older;
    this.nodes.delete(node.page);
  }

  // Should the hand skip this node? (SieveDB changes this.)
  skip(node) {
    if (node.v === 1) { node.v = 0; return true; }
    return false;
  }

  evict() {
    let node = this.hand ?? this.tail;
    while (this.skip(node)) node = this.step(node);
    this.hand = node.newer;   // next time, start right after the victim
    if (!node.newer) this.pass++;   // the hand reached the head, so it wraps
    this.remove(node);
    return node.page;
  }
}