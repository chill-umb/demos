# BufBench & SIEVE_DB Demo (SIGMOD 2027)

Live: https://chill-umb.github.io/demos/BufBench-SIEVE_DB/

Repo: https://github.com/chill-umb/demos (folder `BufBench-SIEVE_DB/`)

## What it is

A **buffer pool simulation that runs in the browser** (no PostgreSQL, no server).
It looks and behaves like BufBench: every simulated second it produces the same
34 metrics BufBench collects, and shows how **checkpoints and vacuum drop the
throughput**. The user can pick the replacement policy: CLOCK, LRU, CFLRU,
LRU-WSR, SIEVE, or SIEVE_DB.


## Pages

| Page | Status | What it shows |
|---|---|---|
| `index.html` | Done | Intro, link to the Live Monitor, papers, team |
| `monitor.html` | Done | **Main demo.** Settings, PLAY/Fast/Medium/Slow bar, live TPS chart with checkpoint/vacuum marks, 3 metric charts, events table, picker for all 34 metrics, CSV download |
| `test-policies.html` | Test only | Runs all 6 policies on the same 300,000 requests and shows hit rate, evictions, dirty write-backs |
| `test-simulator.html` | Test only | Runs 300 simulated seconds and shows averages and all events |

Expected test results (TPC-B, defaults): CLOCK avg TPS 1,659, hit rate 90.2%;
SIEVE_DB avg TPS 1,763, hit rate 93.6%; 5 checkpoints and 5 vacuums.

## Files

```
BufBench-SIEVE_DB/
├── index.html, monitor.html, test-policies.html, test-simulator.html
├── css/
│   ├── bootstrap.min.css      # from ReStore
│   ├── LinLibertine_R.ttf     # font from ReStore
│   └── style.css              # our styles
├── img/                       # UMB-logo.png, chill-logo.png, play_pause.png
└── js/
    ├── nav.js                 # top bar, side tabs, footer, all links, policy names
    ├── policies/              # the 6 replacement policies (one file each)
    │   ├── policy.js          # shared parent: access(), dirty pages, clean()
    │   ├── clock.js, lru.js, cflru.js, lruwsr.js, sieve.js, sievedb.js
    │   └── index.js           # list of all policies + makePolicy()
    ├── workload.js            # TPC-B, TATP, YCSB-with-scans (simplified)
    ├── simulator.js           # one tick() = one second -> one row of 34 metrics
    ├── metrics.js             # names, labels, units of the 34 metrics
    ├── interference.js        # checkpoint/vacuum TPS-drop analysis (like BufBench)
    ├── charts.js              # Plotly line charts with event lines
    └── monitor.js             # makes monitor.html work
```

All JavaScript uses ES modules, so pages must be opened through a web server.

## How the simulation works

**One `tick()` = one simulated second.** In order:

1. **Checkpoint** every 60 s. It writes the dirty pages it saw at the start,
   spread over 90% of the gap (`checkpoint_completion_target`), then syncs.
2. **Autovacuum** when dead rows > 20% of the table's rows. It reads the table
   at 1,200 pages/s. With the ring buffer on (default), it doesn't touch the buffer pool.
3. **Background writer** cleans up to 100 dirty pages, oldest-written first.
4. **Clients** run transactions until their time is used up
   (8 clients = 8,000 ms per second).

**Transaction cost (ms):** CPU 4.0 + hit 0.01 + miss 0.5×slow
+ dirty victim write 0.7×slow + WAL 0.03 (0.7 for the first change to a page
after a checkpoint, i.e. a full page write).

**slow** = 1 + 4 × (background pages this second ÷ 2500) + (sync ms ÷ 100).
More background disk work means slower misses, which means lower TPS.
**TPS = transactions that fit in the second.**

The cost numbers are chosen, not measured. They were tuned so SIEVE_DB beats
CLOCK by about 6% on TPC-B, close to the EDBT paper.

**What is real:** the 6 policies are the actual algorithms, run on real page
requests, so hits, misses, evictions and dirty pages are real for this workload.
**What is simplified:** time, disk, WAL. There are no locks or real I/O.

## The 34 metrics

Same names and order as BufBench's `monitor/collector.py`. Each tick makes one row:

- **This second only:** `tps`, `hit_rate_pct`, `eviction_rate`, `tup_*`,
  `heap/index_hit_rate_pct`, `checkpoint_happened`, `vacuum_happened`
- **Running totals:** `commits`, `rollbacks`, `blks_hit`, `blks_read`,
  `buffers_clean`, `buffers_alloc`, `maxwritten_clean`, `buffers_written`,
  `num_timed`, `num_requested`, `write_time`, `sync_time`, `autovacuum_count`
- **Right now:** buffer counts, `dirty_buffers`, `dead_tuples`, `avg_usage_count`
  (CLOCK only)
- **Made up:** `pinned_buffers` (random, about the number of clients);
  `write_time`/`sync_time` come from a formula


**Events table** (same as BufBench's Interference Analyzer):
TPS before = average of the 3 seconds before; TPS during = the event's second;
drop = (before − during) ÷ before; recovery = seconds until TPS ≥ 90% of before.

## Known issue

**"Checkpoint now" waits for the running checkpoint to finish** (up to ~54 s with
90% spread), so it looks like nothing happens. A fix is ready (make it finish
the running checkpoint and write everything at once, like PostgreSQL's
`CHECKPOINT`) but is not applied yet.

## Not done yet

- `background.html` (explain buffer pool, policies, metrics; add a side tab in `nav.js`)
- 2-3 policy comparison side by side (Need to think about the design)
- Think about how to fix the checkpoint issue
- Maybe: Explorer page (watch buffer frames step by step) and Compare page
  (several policies on one chart)
- Demo video, SIEVE_DB paper PDF, SIGMOD demo paper

## Run it locally

From the repo's top folder (`demos/`):

```bash
python3 -m http.server 8000
```

Open http://localhost:8000/BufBench-SIEVE_DB/

## Workflow

Small steps: change something, check it locally, then commit and push.

```bash
git add .
git commit -m "What changed"
git push
```

GitHub Pages updates the site 1–2 minutes after a push.
Use Cmd + Shift + R to reload without the browser's saved copy.