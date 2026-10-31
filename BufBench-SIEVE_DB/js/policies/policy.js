// Every policy (CLOCK, LRU, CFLRU, LRU-WSR, SIEVE, SIEVE_DB) follows this same shape,
// so the simulator can run any of them the same way.
//
// The parent class keeps track of which pages are dirty.
// Each policy only decides: what happens on a hit, where a new page goes,
// and which page to evict.

export class Policy {
  constructor(capacity, options = {}) {
    this.capacity = capacity;   // number of frames in the buffer
    this.options = options;     // e.g. { A: 2 } for SIEVE_DB
    this.dirty = new Set();     // pages changed in memory but not written to disk yet
  }

  // ---- Each policy writes these ----
  get name() { return "?"; }
  has(page) { throw new Error("not written"); }        // is the page in the buffer?
  get size() { throw new Error("not written"); }       // how many frames are used
  onHit(page) { throw new Error("not written"); }      // update info on a hit
  insert(page) { throw new Error("not written"); }     // put a new page in a free frame
  evict() { throw new Error("not written"); }          // pick a victim, remove it, return its page id

  // Average "usage count" (only CLOCK has one; others return null)
  avgUsage() { return null; }

  // ---- Shared by all policies ----

  // Handle one page request.
  // Returns { hit, evicted (page id or null), wroteBack (true if the victim was dirty) }
  access(page, isWrite) {
    if (this.has(page)) {
      if (isWrite) this.markDirty(page);
      this.onHit(page);
      return { hit: true, evicted: null, wroteBack: false };
    }
    let evicted = null, wroteBack = false;
    if (this.size >= this.capacity) {
      evicted = this.evict();
      wroteBack = this.dirty.delete(evicted);   // a dirty victim must be written first
    }
    this.insert(page);
    if (isWrite) this.markDirty(page);
    return { hit: false, evicted, wroteBack };
  }

  // Keep dirty pages in the order they were last written:
  // the first ones are the pages nobody has written for the longest time.
  // (The background writer cleans those first.)
  markDirty(page) {
    this.dirty.delete(page);
    this.dirty.add(page);
  }

  // Write some dirty pages to disk (used by checkpoint and background writer).
  // They stay in the buffer but become clean.
  clean(pages) {
    let written = 0;
    for (const p of pages) if (this.dirty.delete(p)) written++;
    return written;
  }
}