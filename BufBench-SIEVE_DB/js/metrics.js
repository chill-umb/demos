// The 34 metrics BufBench writes every second (same names as BufBench's
// monitor/collector.py), grouped by the PostgreSQL view they come from.
//
// kind:  "rate"  = per second
//        "total" = keeps growing since the start (like PostgreSQL's counters)
//        "now"   = value at this moment
//        "flag"  = 1 if the event happened in this second, else 0
// key:   true = one of the important ones shown by default

export const METRICS = [
  // Time
  { name: "timestamp", label: "Timestamp", group: "Time", kind: "now", unit: "", chart: false },
  { name: "elapsed_sec", label: "Elapsed time", group: "Time", kind: "now", unit: "s", chart: false },

  // pg_stat_database
  { name: "tps", label: "Transactions per second", group: "pg_stat_database", kind: "rate", unit: "txn/s", key: true },
  { name: "commits", label: "Committed transactions", group: "pg_stat_database", kind: "total", unit: "" },
  { name: "rollbacks", label: "Rolled-back transactions", group: "pg_stat_database", kind: "total", unit: "" },
  { name: "blks_hit", label: "Buffer pool hits", group: "pg_stat_database", kind: "total", unit: "pages" },
  { name: "blks_read", label: "Pages read from disk", group: "pg_stat_database", kind: "total", unit: "pages" },
  { name: "hit_rate_pct", label: "Hit rate", group: "pg_stat_database", kind: "rate", unit: "%", key: true },
  { name: "tup_inserted", label: "Rows inserted", group: "pg_stat_database", kind: "rate", unit: "rows/s" },
  { name: "tup_updated", label: "Rows updated", group: "pg_stat_database", kind: "rate", unit: "rows/s" },
  { name: "tup_deleted", label: "Rows deleted", group: "pg_stat_database", kind: "rate", unit: "rows/s" },
  { name: "tup_fetched", label: "Rows fetched", group: "pg_stat_database", kind: "rate", unit: "rows/s" },

  // pg_stat_bgwriter
  { name: "buffers_clean", label: "Pages written by background writer", group: "pg_stat_bgwriter", kind: "total", unit: "pages" },
  { name: "buffers_alloc", label: "Buffers allocated", group: "pg_stat_bgwriter", kind: "total", unit: "buffers" },
  { name: "maxwritten_clean", label: "Background writer hit its limit", group: "pg_stat_bgwriter", kind: "total", unit: "times" },
  { name: "eviction_rate", label: "Eviction rate", group: "pg_stat_bgwriter", kind: "rate", unit: "pages/s", key: true },

  // pg_stat_checkpointer
  { name: "buffers_written", label: "Pages written at checkpoints", group: "pg_stat_checkpointer", kind: "total", unit: "pages" },
  { name: "num_timed", label: "Scheduled checkpoints", group: "pg_stat_checkpointer", kind: "total", unit: "" },
  { name: "num_requested", label: "Forced checkpoints", group: "pg_stat_checkpointer", kind: "total", unit: "" },
  { name: "write_time", label: "Checkpoint write time", group: "pg_stat_checkpointer", kind: "total", unit: "ms" },
  { name: "sync_time", label: "Checkpoint sync time", group: "pg_stat_checkpointer", kind: "total", unit: "ms" },
  { name: "checkpoint_happened", label: "Checkpoint started", group: "pg_stat_checkpointer", kind: "flag", unit: "0/1" },

  // pg_buffercache
  { name: "total_buffers", label: "Total buffer slots", group: "pg_buffercache", kind: "now", unit: "buffers" },
  { name: "used_buffers", label: "Used buffer slots", group: "pg_buffercache", kind: "now", unit: "buffers" },
  { name: "free_buffers", label: "Free buffer slots", group: "pg_buffercache", kind: "now", unit: "buffers" },
  { name: "dirty_buffers", label: "Dirty buffers", group: "pg_buffercache", kind: "now", unit: "buffers", key: true },
  { name: "buffer_utilization_pct", label: "Buffer utilization", group: "pg_buffercache", kind: "now", unit: "%" },
  { name: "avg_usage_count", label: "Average usage count (CLOCK only)", group: "pg_buffercache", kind: "now", unit: "0–5" },
  { name: "pinned_buffers", label: "Pinned buffers", group: "pg_buffercache", kind: "now", unit: "buffers" },

  // pg_stat_user_tables
  { name: "autovacuum_count", label: "Autovacuum runs", group: "pg_stat_user_tables", kind: "total", unit: "" },
  { name: "dead_tuples", label: "Dead rows (bloat)", group: "pg_stat_user_tables", kind: "now", unit: "rows", key: true },
  { name: "vacuum_happened", label: "Vacuum started", group: "pg_stat_user_tables", kind: "flag", unit: "0/1" },
  { name: "heap_hit_rate_pct", label: "Table (heap) hit rate", group: "pg_stat_user_tables", kind: "rate", unit: "%" },
  { name: "index_hit_rate_pct", label: "Index hit rate", group: "pg_stat_user_tables", kind: "rate", unit: "%" },
];

export const METRIC_BY_NAME = Object.fromEntries(METRICS.map(m => [m.name, m]));