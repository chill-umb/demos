// The simulator: a small, made-up PostgreSQL that runs in the browser.
//
// Every call to tick() simulates ONE SECOND and returns one row with the
// same 34 metrics BufBench collects (see metrics.js).
//
// What happens in one second:
//   1. Maybe start a checkpoint (every `checkpointTimeout` seconds, or when forced).
//   2. The checkpoint writes its share of dirty pages for this second.
//      The last second also does an fsync ("sync"), which slows the disk.
//   3. Maybe start an autovacuum (when dead rows pass the threshold).
//   4. Vacuum reads its share of table pages for this second.
//   5. The background writer cleans a few dirty pages.
//   6. The clients run transactions until their time for this second is used up.
//      Disk work from steps 2–5 makes every disk read slower, so fewer
//      transactions fit in the second. That is the TPS drop you see.
//      Right after a checkpoint starts, the first write to each page costs
//      extra (PostgreSQL's "full page writes"), which also lowers TPS.
//
// The numbers are a simple model, not real PostgreSQL. They show the
// shape of what happens, not exact values.

import { makePolicy } from "./policies/index.js";
import { WORKLOADS } from "./workload.js";

export const DEFAULTS = {
  workload: "tpcb",
  policy: "clock",
  A: 2,                    // SIEVE_DB protection age limit
  bufferPages: 1500,       // number of buffer frames
  clients: 8,
  checkpointTimeout: 60,   // seconds between scheduled checkpoints
  completionTarget: 0.9,   // spread checkpoint writes over this share of the gap
  autovacuum: true,
  vacuumScale: 0.2,        // vacuum when dead rows > this share of the table's rows
  vacuumRing: true,        // true = vacuum uses a small ring buffer (PostgreSQL's normal way)
  scanPct: 2,              // YCSB only: % of requests that are scans
  seed: 7,
};

// Simple costs, in milliseconds
const COST = { cpu: 4.0, hit: 0.01, read: 0.5, write: 0.7, wal: 0.03, fullPageWrite: 0.7 };
const DISK_SPARE = 2500;     // background page writes/reads per second before clients slow down a lot
const BGWRITER_MAX = 100;    // PostgreSQL's bgwriter_lru_maxpages
const VACUUM_PAGES_PER_SEC = 1200;
const MAX_WAL_WRITES = 2_000_000; // force a checkpoint after this many page writes (like max_wal_size)

// Small random number generator with a seed, so a run can be repeated exactly.
function makeRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Simulator {
  constructor(settings = {}) { this.reset(settings); }

  reset(settings = {}) {
    this.s = { ...DEFAULTS, ...settings };
    this.rnd = makeRandom(this.s.seed);
    this.wl = WORKLOADS[this.s.workload];
    this.policy = makePolicy(this.s.policy, this.s.bufferPages, { A: this.s.A });
    this.wlState = {};
    this.t = 0;
    this.c = {   // counters that keep growing, like PostgreSQL's
      commits: 0, rollbacks: 0, blks_hit: 0, blks_read: 0,
      buffers_clean: 0, buffers_alloc: 0, maxwritten_clean: 0,
      buffers_written: 0, num_timed: 0, num_requested: 0, write_time: 0, sync_time: 0,
      autovacuum_count: 0,
    };
    this.dead = 0;
    this.ckpt = null;
    this.lastCkptStart = 0;
    this.walWrites = 0;
    this.touchedSinceCkpt = new Set();
    this.vac = null;
    this.vacRest = 0;
    this.forceCkpt = false;
    this.forceVac = false;
    this.lastAllocs = 0;
    this.startTime = Date.now();
  }

  // Settings that can change while running. Others need reset().
  update(changes) { Object.assign(this.s, changes); }

  // Buttons
  checkpointNow() { this.forceCkpt = true; }
  vacuumNow() { this.forceVac = true; }

  vacuumThreshold() {
    const [, pages] = this.wl.tables[this.wl.vacuumTable];
    return Math.round(this.s.vacuumScale * pages * (this.wl.rowsPerPage ?? 60));
  }

  tick() {
    const s = this.s, P = this.policy, rnd = this.rnd, c = this.c;
    this.t += 1;
    let checkpointHappened = 0, vacuumHappened = 0;
    let diskBusy = 0;   // background page I/O this second
    let syncMs = 0;

    // 1. Start a checkpoint?
    if (!this.ckpt) {
      let kind = null;
      if (this.forceCkpt || this.walWrites >= MAX_WAL_WRITES) kind = "requested";
      else if (this.t - this.lastCkptStart >= s.checkpointTimeout) kind = "timed";
      if (kind) {
        this.forceCkpt = false;
        if (kind === "timed") c.num_timed++; else c.num_requested++;
        const pages = [...P.dirty];
        const seconds = Math.max(1, Math.round(s.completionTarget * s.checkpointTimeout));
        this.ckpt = { pages, pos: 0, perSecond: Math.max(1, Math.ceil(pages.length / seconds)), written: 0 };
        this.lastCkptStart = this.t;
        this.walWrites = 0;
        this.touchedSinceCkpt.clear();
        checkpointHappened = 1;
      }
    }

    // 2. Checkpoint writes for this second
    if (this.ckpt) {
      const ck = this.ckpt;
      const chunk = ck.pages.slice(ck.pos, ck.pos + ck.perSecond);
      ck.pos += chunk.length;
      const written = P.clean(chunk);
      ck.written += written;
      c.buffers_written += written;
      c.write_time += written * COST.write;
      diskBusy += written;
      if (ck.pos >= ck.pages.length) {          // all written: now fsync
        syncMs = 20 + ck.written * 0.05;
        c.sync_time += syncMs;
        this.ckpt = null;
      }
    }

    // 3. Start a vacuum?
    if (!this.vac && (this.forceVac || (s.autovacuum && this.vacRest <= 0 && this.dead >= this.vacuumThreshold()))) {
      this.forceVac = false;
      const [first, count] = this.wl.tables[this.wl.vacuumTable];
      this.vac = { next: first, end: first + count, deadPerPage: this.dead / count };
      c.autovacuum_count++;
      vacuumHappened = 1;
    }
    this.vacRest--;

    // 4. Vacuum work for this second
    let hits = 0, reads = 0, heapHits = 0, heapReads = 0, indexHits = 0, indexReads = 0, evictions = 0, allocs = 0;
    if (this.vac) {
      const v = this.vac;
      const n = Math.min(VACUUM_PAGES_PER_SEC, v.end - v.next);
      for (let i = 0; i < n; i++) {
        const page = v.next++;
        const makesDirty = rnd() < 0.3;              // pages that had dead rows get changed
        if (s.vacuumRing) {                          // ring buffer: does not touch the shared buffer pool
          if (P.has(page)) { hits++; heapHits++; } else { reads++; heapReads++; diskBusy++; }
          if (makesDirty) diskBusy++;
        } else {                                     // goes through the shared buffer pool
          const r = P.access(page, makesDirty);
          if (r.hit) { hits++; heapHits++; } else { reads++; heapReads++; allocs++; diskBusy++; }
          if (r.evicted !== null) evictions++;
          if (r.wroteBack) diskBusy++;
        }
        this.dead = Math.max(0, this.dead - v.deadPerPage);
      }
      if (v.next >= v.end) { this.vac = null; this.dead = 0; this.vacRest = 10; }
    }

    // 5. Background writer: clean the dirty pages not written for the longest time
    const want = Math.min(BGWRITER_MAX, Math.round(this.lastAllocs * 0.2));
    if (want > 0 && P.dirty.size > 0) {
      const list = [];
      for (const p of P.dirty) { if (list.length >= want) break; list.push(p); }
      const w = P.clean(list);
      c.buffers_clean += w;
      if (w >= BGWRITER_MAX) c.maxwritten_clean++;
      diskBusy += w;
    }

    // 6. Client transactions
    const slow = 1 + 4 * diskBusy / DISK_SPARE + syncMs / 100;   // how much slower each disk access is
    const cpuSlow = this.vac ? 1.06 : 1;                              // the vacuum worker uses CPU too
    const wobble = 1 + (rnd() + rnd() + rnd() - 1.5) * 0.02;          // small natural ups and downs
    const budget = s.clients * 1000;
    let spent = 0, commits = 0, rollbacks = 0;
    let fetched = 0, updated = 0, inserted = 0, deleted = 0;

    while (spent < budget) {
      const tx = this.wl.make(rnd, this.wlState, s);
      let cost = COST.cpu * cpuSlow;
      for (const [page, isWrite, isIndex] of tx.pages) {
        const r = P.access(page, isWrite);
        if (r.hit) {
          hits++; isIndex ? indexHits++ : heapHits++;
          cost += COST.hit;
        } else {
          reads++; allocs++; isIndex ? indexReads++ : heapReads++;
          cost += COST.read * slow;
        }
        if (r.evicted !== null) evictions++;
        if (r.wroteBack) cost += COST.write * slow;     // a client had to write a dirty victim itself
        if (isWrite) {
          this.walWrites++;
          if (!this.touchedSinceCkpt.has(page)) {         // first change since the checkpoint
            this.touchedSinceCkpt.add(page);
            cost += COST.fullPageWrite;
          } else cost += COST.wal;
        }
      }
      spent += cost * wobble * (0.9 + 0.2 * rnd());
      if (rnd() < this.wl.rollbackRate) rollbacks++; else commits++;
      fetched += tx.fetched; updated += tx.updated; inserted += tx.inserted; deleted += tx.deleted;
    }
    this.dead += updated + deleted;
    this.lastAllocs = allocs;

    // 7. Build the row (same columns as BufBench)
    c.commits += commits; c.rollbacks += rollbacks;
    c.blks_hit += hits; c.blks_read += reads;
    c.buffers_alloc += allocs;
    const used = P.size, total = s.bufferPages;
    const pct = (a, b) => (a + b === 0 ? 0 : Math.round(10000 * a / (a + b)) / 100);
    const usage = P.avgUsage();

    return {
      timestamp: new Date(this.startTime + this.t * 1000).toISOString(),
      elapsed_sec: this.t,
      tps: commits + rollbacks,
      commits: c.commits,
      rollbacks: c.rollbacks,
      blks_hit: c.blks_hit,
      blks_read: c.blks_read,
      hit_rate_pct: pct(hits, reads),
      tup_inserted: inserted,
      tup_updated: updated,
      tup_deleted: deleted,
      tup_fetched: fetched,
      buffers_clean: c.buffers_clean,
      buffers_alloc: c.buffers_alloc,
      maxwritten_clean: c.maxwritten_clean,
      eviction_rate: evictions,
      buffers_written: c.buffers_written,
      num_timed: c.num_timed,
      num_requested: c.num_requested,
      write_time: Math.round(c.write_time),
      sync_time: Math.round(c.sync_time),
      checkpoint_happened: checkpointHappened,
      total_buffers: total,
      used_buffers: used,
      free_buffers: total - used,
      dirty_buffers: P.dirty.size,
      buffer_utilization_pct: Math.round(10000 * used / total) / 100,
      avg_usage_count: usage === null ? null : Math.round(usage * 100) / 100,
      pinned_buffers: Math.min(used, Math.round(s.clients * (0.6 + 0.8 * rnd()))),
      autovacuum_count: c.autovacuum_count,
      dead_tuples: Math.round(this.dead),
      vacuum_happened: vacuumHappened,
      heap_hit_rate_pct: pct(heapHits, heapReads),
      index_hit_rate_pct: pct(indexHits, indexReads),
    };
  }
}