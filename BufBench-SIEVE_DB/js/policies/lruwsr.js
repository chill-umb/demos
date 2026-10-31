import { Policy } from "./policy.js";

// LRU-WSR
// - Same order as LRU, plus a "cold" flag on dirty pages.
// - To evict: look at the least recent page.
//     clean page            → evict it
//     dirty page, cold = 1  → evict it
//     dirty page, cold = 0  → set cold = 1, move it to the front (second chance)
// - Hit on a dirty page: cold = 0.

export class LRUWSR extends Policy {
  constructor(capacity, options = {}) {
    super(capacity, options);
    this.order = new Map();   // page -> cold flag (0 or 1)
  }
  get name() { return "LRU-WSR"; }
  has(page) { return this.order.has(page); }
  get size() { return this.order.size; }

  onHit(page) {
    const cold = this.order.get(page);
    this.order.delete(page);
    this.order.set(page, this.dirty.has(page) ? 0 : cold);
  }

  insert(page) { this.order.set(page, 0); }

  evict() {
    for (;;) {
      const [page, cold] = this.order.entries().next().value;
      this.order.delete(page);
      if (!this.dirty.has(page) || cold === 1) return page;
      this.order.set(page, 1);   // second chance for a dirty page
    }
  }
}