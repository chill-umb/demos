// The workloads for the simulation. Each one is a simple, BufBench-like
// version of a real benchmark. It tells the simulator:
//   - which pages belong to which table and index
//   - what one transaction reads and writes
//
// One transaction = a list of page accesses: [pageId, isWrite, isIndex]
// plus how many rows it fetched / updated / inserted / deleted.

// Pick a page: `hotOps`% of picks go to the first `hotData`% of the range.
function skewed(rnd, start, count, hotOps = 0.9, hotData = 0.1) {
  const hot = Math.max(1, Math.floor(count * hotData));
  return rnd() < hotOps
    ? start + Math.floor(rnd() * hot)
    : start + hot + Math.floor(rnd() * (count - hot));
}

export const WORKLOADS = {
  tpcb: {
    label: "TPC-B (write-heavy)",
    note: "Every transaction updates an account, a teller and a branch, and adds a history row. 90% of accesses go to 10% of the accounts.",
    tables: { index: [0, 1000], accounts: [1000, 12000], tellers: [13000, 10], branches: [13010, 1], history: [20000, 0] },
    vacuumTable: "accounts",
    rowsPerPage: 100,
    rollbackRate: 0.001,
    make(rnd, state) {
      const [ai, an] = this.tables.index, [a0, an2] = this.tables.accounts;
      const acct = skewed(rnd, a0, an2);
      const idx = ai + Math.floor((acct - a0) / an2 * an);
      state.historyRows = (state.historyRows ?? 0) + 1;
      const histPage = this.tables.history[0] + Math.floor(state.historyRows / 60);
      return {
        pages: [
          [idx, false, true],                                         // find the account in the index
          [acct, true, false],                                        // update the account
          [this.tables.tellers[0] + Math.floor(rnd() * 10), true, false], // update a teller
          [this.tables.branches[0], true, false],                     // update the branch
          [histPage, true, false],                                    // add a history row
        ],
        fetched: 1, updated: 3, inserted: 1, deleted: 0,
      };
    },
  },

  tatp: {
    label: "TATP (read-heavy)",
    note: "80% of transactions only read. 80% of accesses go to the top 20% of subscribers.",
    tables: { index: [0, 800], subscriber: [800, 8000], call_forwarding: [8800, 3000] },
    vacuumTable: "subscriber",
    rowsPerPage: 50,
    rollbackRate: 0.01,
    make(rnd) {
      const [i0, iN] = this.tables.index, [s0, sN] = this.tables.subscriber, [c0, cN] = this.tables.call_forwarding;
      const sub = skewed(rnd, s0, sN, 0.8, 0.2);
      const idx = i0 + Math.floor((sub - s0) / sN * iN);
      if (rnd() < 0.8) {
        return { pages: [[idx, false, true], [sub, false, false]], fetched: 1, updated: 0, inserted: 0, deleted: 0 };
      }
      const cf = c0 + Math.floor(((sub - s0) / sN) * cN);
      return { pages: [[idx, false, true], [sub, true, false], [cf, true, false]], fetched: 1, updated: 2, inserted: 0, deleted: 0 };
    },
  },

  ycsb: {
    label: "YCSB with scans",
    note: "Mostly single-row reads and updates (90% on 10% of rows). Some requests are scans that read 100 pages in a row.",
    tables: { index: [0, 1000], usertable: [1000, 12000] },
    vacuumTable: "usertable",
    rowsPerPage: 40,
    rollbackRate: 0,
    make(rnd, state, settings) {
      const [i0, iN] = this.tables.index, [u0, uN] = this.tables.usertable;
      if (rnd() < (settings.scanPct ?? 2) / 100) {
        const start = u0 + Math.floor(rnd() * (uN - 100));
        const pages = [];
        for (let k = 0; k < 100; k++) pages.push([start + k, false, false]);
        return { pages, fetched: 100 * 40, updated: 0, inserted: 0, deleted: 0 };
      }
      const row = skewed(rnd, u0, uN);
      const idx = i0 + Math.floor((row - u0) / uN * iN);
      const write = rnd() < 0.5;
      return { pages: [[idx, false, true], [row, write, false]], fetched: write ? 0 : 1, updated: write ? 1 : 0, inserted: 0, deleted: 0 };
    },
  },
};