import { Policy } from "./policy.js";

// CFLRU (Clean-First LRU)
// - Same order as LRU.
// - The least recent part of the list is the "clean-first" area
//   (its size is `window` × buffer size, default 25%).
// - To evict: first look for a CLEAN page in that area. If there is none,
//   evict the least recent page like LRU.

export class CFLRU extends Policy {
  constructor(capacity, options = {}) {
    super(capacity, options);
    this.order = new Map();
    this.window = Math.max(1, Math.round(capacity * (options.window ?? 0.25)));
  }
  get name() { return "CFLRU"; }
  has(page) { return this.order.has(page); }
  get size() { return this.order.size; }

  onHit(page) {
    this.order.delete(page);
    this.order.set(page, true);
  }

  insert(page) { this.order.set(page, true); }

  evict() {
    let victim = null, i = 0;
    for (const page of this.order.keys()) {
      if (i++ >= this.window) break;
      if (!this.dirty.has(page)) { victim = page; break; }
    }
    if (victim === null) victim = this.order.keys().next().value;
    this.order.delete(victim);
    return victim;
  }
}