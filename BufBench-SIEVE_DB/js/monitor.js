// Code for monitor.html: runs the simulator second by second and keeps
// the charts moving.

import { POLICIES } from "./nav.js";
import { WORKLOADS } from "./workload.js";
import { Simulator } from "./simulator.js";
import { InterferenceAnalyzer } from "./interference.js";
import { METRICS, METRIC_BY_NAME } from "./metrics.js";
import { drawLine } from "./charts.js";

const WINDOW = 120;          // seconds shown on the charts
const MAX_ROWS = 7200;       // keep up to 2 hours for the CSV download
const KEY_METRICS = ["hit_rate_pct", "dirty_buffers", "eviction_rate"];

// Friendly names for the PostgreSQL views the metrics come from
const GROUP_NAMES = {
  pg_stat_database: "Database activity",
  pg_stat_bgwriter: "Background writer",
  pg_stat_checkpointer: "Checkpoints",
  pg_buffercache: "Buffer pool contents",
  pg_stat_user_tables: "Tables and vacuum",
};

const $ = (id) => document.getElementById(id);
const fmt = (v, d = 0) => (v === null || v === undefined ? "–" :
  Number(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
const decimalsFor = (m) => (m.unit === "%" || m.name === "avg_usage_count" ? 1 : 0);
const yTitle = (m) => ({ "%": "Percent (%)", "0/1": "Happened (0/1)" }[m.unit] ?? (m.unit ? m.unit[0].toUpperCase() + m.unit.slice(1) : ""));

let sim, analyzer, rows = [];
let running = true, speed = 4, needsDraw = true, tpsTop = 0;
const picked = new Set();

// ---------- Settings ----------

function fillSelect(el, entries, selected) {
  el.innerHTML = entries.map(([v, label]) =>
    `<option value="${v}"${v === selected ? " selected" : ""}>${label}</option>`).join("");
}
fillSelect($("workload"), Object.entries(WORKLOADS).map(([k, w]) => [k, w.label]), "tpcb");
fillSelect($("policy"), Object.entries(POLICIES), "clock");

function readSettings() {
  return {
    workload: $("workload").value,
    policy: $("policy").value,
    A: +$("A").value,
    bufferPages: +$("buffer").value,
    clients: +$("clients").value,
    scanPct: +$("scanPct").value,
    checkpointTimeout: +$("ckptTimeout").value,
    completionTarget: +$("target").value,
    autovacuum: $("autovacuum").checked,
    vacuumRing: $("ring").checked,
  };
}

function refreshSettingsText() {
  $("A-box").hidden = $("policy").value !== "sieve_db";
  $("scan-box").hidden = $("workload").value !== "ycsb";
  $("target-value").innerHTML = "&nbsp;" + Math.round(+$("target").value * 100) + "%";
  $("workload").title = WORKLOADS[$("workload").value].note;
}

function restart() {
  refreshSettingsText();
  sim = new Simulator(readSettings());
  analyzer = new InterferenceAnalyzer();
  rows = [];
  tpsTop = 0;
  needsDraw = true;
}

// These need a fresh start (a new buffer pool)
for (const id of ["workload", "policy", "A", "buffer"]) $(id).addEventListener("change", restart);
// These can change while it runs
for (const id of ["clients", "scanPct", "ckptTimeout", "target", "autovacuum", "ring"]) {
  $(id).addEventListener("input", () => {
    refreshSettingsText();
    const s = readSettings();
    sim.update({ clients: s.clients, scanPct: s.scanPct, checkpointTimeout: s.checkpointTimeout,
      completionTarget: s.completionTarget, autovacuum: s.autovacuum, vacuumRing: s.vacuumRing });
  });
}

// ---------- Buttons ----------

function setRunning(on) {
  running = on;
  $("play-text").textContent = on ? "PAUSE" : "PLAY";
}
$("play-button").addEventListener("click", () => setRunning(!running));
$("reset").addEventListener("click", () => { restart(); setRunning(true); });
$("ckpt-now").addEventListener("click", () => sim.checkpointNow());
$("vac-now").addEventListener("click", () => sim.vacuumNow());
const speedButtons = document.querySelectorAll("button[data-speed]");
for (const b of speedButtons) {
  b.addEventListener("click", () => {
    speed = +b.dataset.speed;
    for (const x of speedButtons) x.classList.toggle("active", x === b);
    setRunning(true);
  });
}

$("download").addEventListener("click", () => {
  const names = METRICS.map((m) => m.name);
  const lines = [names.join(",")].concat(rows.map((r) => names.map((n) => r[n] ?? "").join(",")));
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `metrics_${$("workload").value}_${$("policy").value}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
});

// ---------- Chart boxes ----------

function chartBox(m) {
  return `<div class="col-lg-4 chart-col"><h4 class="chart-title">${m.label}</h4>
    <div id="chart-${m.name}" class="plot"></div></div>`;
}

$("key-charts").innerHTML = KEY_METRICS.map((n) => chartBox(METRIC_BY_NAME[n])).join("");

function buildPicked() {
  const list = METRICS.filter((m) => picked.has(m.name));
  $("picked-charts").innerHTML = list.map(chartBox).join("");
  needsDraw = true;
}

function buildPicker() {
  const groups = {};
  for (const m of METRICS) {
    if (m.chart === false || m.name === "tps") continue;
    (groups[m.group] ??= []).push(m);
  }
  $("picker").innerHTML = Object.entries(groups).map(([g, list]) => `
    <div class="picker-group">
      <span class="group-name">${GROUP_NAMES[g] ?? g}<small>${g}</small></span>
      <div class="items">${list.map((m) => KEY_METRICS.includes(m.name)
        ? `<label class="fixed"><input type="checkbox" checked disabled> ${m.label} (shown above)</label>`
        : `<label><input type="checkbox" data-metric="${m.name}"> ${m.label}</label>`).join("")}</div>
    </div>`).join("");
  for (const box of $("picker").querySelectorAll("input[data-metric]")) {
    box.addEventListener("change", () => {
      box.checked ? picked.add(box.dataset.metric) : picked.delete(box.dataset.metric);
      buildPicked();
    });
  }
}

// ---------- Drawing ----------

function drawAll() {
  if (!rows.length) return;
  const view = rows.slice(-WINDOW);
  const xs = view.map((r) => r.elapsed_sec);
  const xMax = Math.max(WINDOW, xs[xs.length - 1]);
  const xMin = xMax - WINDOW;
  const events = analyzer.events;
  const last = rows[rows.length - 1];

  // Time box and the line under the control panel
  $("time").textContent = `${fmt(last.elapsed_sec)} s`;
  $("now-line").innerHTML =
    `Second ${fmt(last.elapsed_sec)}: <span>${fmt(last.tps)} TPS</span>, hit rate ${fmt(last.hit_rate_pct, 1)}%, ` +
    `${fmt(last.dirty_buffers)} dirty buffers`;

  // TPS chart (the y-axis only grows, so the line does not jump around)
  tpsTop = Math.max(tpsTop, ...view.map((r) => r.tps));
  drawLine("chart-tps", xs, view.map((r) => r.tps),
    { xMin, xMax, events, labels: true, dot: true, unit: "TPS", yTitle: "Throughput (TPS)",
      yMax: Math.ceil(tpsTop * 1.18 / 100) * 100 });

  // Metric charts
  const names = KEY_METRICS.concat([...picked]);
  for (const n of names) {
    const el = $("chart-" + n);
    if (!el) continue;
    const m = METRIC_BY_NAME[n];
    const ys = view.map((r) => r[n]);
    if (ys.every((y) => y === null)) {
      if (!el.querySelector(".empty")) {
        Plotly.purge(el);
        el.innerHTML = `<p class="empty">Only CLOCK keeps a usage count. Choose CLOCK as the policy to see it.</p>`;
      }
      continue;
    }
    if (el.querySelector(".empty")) { Plotly.purge(el); el.innerHTML = ""; }
    drawLine(el, xs, ys, { xMin, xMax, events, unit: m.unit, decimals: decimalsFor(m), yTitle: yTitle(m),
      yMax: m.unit === "%" ? 100 : undefined });
  }

  // Events table and summary (newest first)
  $("events-body").innerHTML = events.slice().reverse().map((e) => `
    <tr><td>${e.time}</td><td><span class="mark${e.type === "vacuum" ? " vac" : ""}"></span>${e.type === "checkpoint" ? "Checkpoint" : "Vacuum"}</td>
    <td>${fmt(e.before)}</td><td>${fmt(e.during)}</td><td>${fmt(e.drop, 1)}</td>
    <td>${e.recovery === null ? "…" : e.recovery}</td></tr>`).join("")
    || `<tr><td colspan="6" class="empty">No events yet. The first checkpoint comes after ${sim.s.checkpointTimeout} seconds.</td></tr>`;
  const c = analyzer.summary("checkpoint"), v = analyzer.summary("vacuum");
  $("events-summary").textContent =
    `Checkpoints: ${c.count} (average drop ${fmt(c.avgDrop, 1)}%, largest ${fmt(c.maxDrop, 1)}%)      ` +
    `Vacuums: ${v.count} (average drop ${fmt(v.avgDrop, 1)}%, largest ${fmt(v.maxDrop, 1)}%)`;
}

// ---------- The clock ----------

let lastTime = performance.now(), carry = 0, lastDraw = 0;
function frame(now) {
  const dt = Math.min(1000, now - lastTime);
  lastTime = now;
  if (running) {
    carry += (dt / 1000) * speed;
    let n = Math.min(20, Math.floor(carry));
    carry -= n;
    while (n-- > 0) {
      const r = sim.tick();
      rows.push(r);
      if (rows.length > MAX_ROWS) rows.shift();
      analyzer.add(r);
      needsDraw = true;
    }
  }
  if (needsDraw && now - lastDraw > 120) {
    drawAll();
    lastDraw = now;
    needsDraw = false;
  }
  requestAnimationFrame(frame);
}

buildPicker();
buildPicked();
restart();
setRunning(true);
requestAnimationFrame(frame);