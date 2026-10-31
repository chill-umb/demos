import { Policy } from "./policy.js";

// LRU (Least Recently Used)
// - Hit: move the page to the front (most recent).
// - To evict: remove the page at the back (least recent).
//
// A JavaScript Map remembers the order things were added,
// so the first key is the least recent page.

export class LRU extends Policy {
  constructor(capacity, options = {}) {
    super(capacity, options);
    this.order = new Map();   // first = least recent, last = most recent
  }
  get name() { return "LRU"; }
  has(page) { return this.order.has(page); }
  get size() { return this.order.size; }

  onHit(page) {
    this.order.delete(page);
    this.order.set(page, true);
  }

  insert(page) { this.order.set(page, true); }

  evict() {
    const victim = this.order.keys().next().value;
    this.order.delete(victim);
    return victim;
  }
}