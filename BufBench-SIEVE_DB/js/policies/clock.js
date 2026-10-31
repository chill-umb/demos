import { Policy } from "./policy.js";

// CLOCK (PostgreSQL's Clock-Sweep)
// - Each frame has a usage count (0 to 5).
// - Hit: usage count + 1 (max 5).
// - New page starts with usage count 1.
// - To evict: the hand goes around. If usage > 0, make it 1 smaller and move on.
//   If usage = 0, evict this page.

export class Clock extends Policy {
  constructor(capacity, options = {}) {
    super(capacity, options);
    this.maxUsage = options.maxUsage ?? 5;
    this.pages = new Array(capacity).fill(null);  // page in each frame
    this.usage = new Uint8Array(capacity);        // usage count of each frame
    this.where = new Map();                       // page id -> frame number
    this.hand = 0;
    this.freeFrame = null;                        // frame freed by the last eviction
  }
  get name() { return "CLOCK"; }
  has(page) { return this.where.has(page); }
  get size() { return this.where.size; }

  onHit(page) {
    const f = this.where.get(page);
    if (this.usage[f] < this.maxUsage) this.usage[f]++;
  }

  insert(page) {
    const f = this.freeFrame ?? this.where.size;   // before the buffer is full, use the next empty frame
    this.freeFrame = null;
    this.pages[f] = page;
    this.usage[f] = 1;
    this.where.set(page, f);
  }

  evict() {
    for (;;) {
      const f = this.hand;
      this.hand = (this.hand + 1) % this.capacity;
      if (this.usage[f] > 0) { this.usage[f]--; continue; }
      const victim = this.pages[f];
      this.where.delete(victim);
      this.pages[f] = null;
      this.freeFrame = f;
      return victim;
    }
  }

  avgUsage() {
    if (this.where.size === 0) return 0;
    let sum = 0;
    for (const f of this.where.values()) sum += this.usage[f];
    return sum / this.where.size;
  }
}