// The Interference Analyzer, done the same way as BufBench's reporter/interference.py:
// for every checkpoint or vacuum event,
//   TPS before   = average TPS of the 3 seconds before the event
//   TPS during   = TPS in the second the event happened
//   drop %       = how much lower "during" is than "before"
//   recovery (s) = seconds until TPS is back to at least 90% of "before"
//
// Call add(row) once per second. It returns the list of events so far.

export class InterferenceAnalyzer {
  constructor() { this.reset(); }

  reset() {
    this.tps = [];      // all TPS values so far
    this.events = [];
  }

  add(row) {
    this.tps.push(row.tps);
    const i = this.tps.length - 1;

    // Finish recovery time for events still waiting
    for (const e of this.events) {
      if (e.recovery === null && i > e.index && row.tps >= 0.9 * e.before) e.recovery = i - e.index;
    }

    const types = [];
    if (row.checkpoint_happened) types.push("checkpoint");
    if (row.vacuum_happened) types.push("vacuum");
    for (const type of types) {
      const prev = this.tps.slice(Math.max(0, i - 3), i);
      const before = prev.length ? prev.reduce((a, b) => a + b, 0) / prev.length : row.tps;
      const drop = before > 0 ? Math.max(0, (before - row.tps) / before * 100) : 0;
      this.events.push({
        type, index: i, time: row.elapsed_sec,
        before: Math.round(before * 10) / 10, during: row.tps,
        drop: Math.round(drop * 10) / 10, recovery: null,
      });
    }
    return this.events;
  }

  summary(type) {
    const list = this.events.filter(e => e.type === type);
    if (!list.length) return { count: 0, avgDrop: 0, maxDrop: 0 };
    const drops = list.map(e => e.drop);
    return {
      count: list.length,
      avgDrop: Math.round(10 * drops.reduce((a, b) => a + b, 0) / list.length) / 10,
      maxDrop: Math.max(...drops),
    };
  }
}