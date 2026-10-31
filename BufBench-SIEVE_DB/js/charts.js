// Draws live line charts with Plotly, in the same style as the ACE and
// ReStore demos (white background, Linux Libertine font, axis titles),
// plus dashed/dotted lines where checkpoints and vacuums happened.

const COLORS = {
  line: "#1f77b4",
  checkpoint: "#eb6834",
  vacuum: "#1baf7a",
  text: "#111",
  grid: "#eeeeee",
};
const FONT = { family: "Linux Libertine, serif", size: 17, color: COLORS.text };
const CONFIG = { displayModeBar: false, responsive: true };

// Vertical lines (and optional labels) for checkpoint and vacuum events
function eventMarks(events, xMin, xMax, withLabels) {
  const shapes = [], annotations = [];
  const look = {
    checkpoint: { color: COLORS.checkpoint, dash: "dash", y: 1.0, name: "Checkpoint" },
    vacuum: { color: COLORS.vacuum, dash: "dot", y: 0.9, name: "Vacuum" },
  };
  for (const e of events) {
    if (e.time < xMin || e.time > xMax) continue;
    const l = look[e.type];
    shapes.push({ type: "line", xref: "x", yref: "paper", x0: e.time, x1: e.time, y0: 0, y1: 1,
      line: { color: l.color, width: 2, dash: l.dash } });
    if (withLabels) {
      const nearRight = e.time > xMax - 12;   // keep the label inside the chart
      annotations.push({ x: e.time, y: l.y, xref: "x", yref: "paper", yanchor: "bottom", showarrow: false,
        xanchor: nearRight ? "right" : "center",
        text: `${l.name} −${e.drop.toFixed(1)}%`, font: { ...FONT, size: 14 },
        bgcolor: "#ffffff", bordercolor: l.color, borderwidth: 1, borderpad: 3 });
    }
  }
  return { shapes, annotations };
}

// Draw (or redraw) one chart.
//   el:      the element (or its id)
//   xs, ys:  data (only the visible window)
//   options: { xMin, xMax, events, labels, yMax, yTitle, unit, decimals, dot }
export function drawLine(el, xs, ys, o) {
  if (typeof el === "string") el = document.getElementById(el);
  const { shapes, annotations } = eventMarks(o.events ?? [], o.xMin, o.xMax, o.labels);

  const traces = [{
    x: xs, y: ys, type: "scatter", mode: "lines",
    line: { color: COLORS.line, width: 3 },
    hovertemplate: `%{y:,.${o.decimals ?? 0}f} ${o.unit ?? ""}<extra></extra>`,
  }];
  if (o.dot && xs.length) {   // a dot on the newest value
    traces.push({ x: [xs[xs.length - 1]], y: [ys[ys.length - 1]], type: "scatter", mode: "markers",
      marker: { size: 10, color: COLORS.line, line: { color: "#fff", width: 2 } }, hoverinfo: "skip" });
  }

  const layout = {
    font: FONT,
    margin: { t: o.labels ? 34 : 14, b: 50, l: 70, r: 14 },
    paper_bgcolor: "#fff", plot_bgcolor: "#fff",
    showlegend: false,
    hovermode: "x unified",
    xaxis: { title: { text: "Time (s)", standoff: 6 }, range: [o.xMin, o.xMax], gridcolor: COLORS.grid,
      zeroline: false, showline: true, linecolor: "#444", fixedrange: true },
    yaxis: { title: { text: o.yTitle ?? "" }, automargin: true, gridcolor: COLORS.grid, zeroline: false, showline: true, linecolor: "#444",
      fixedrange: true, rangemode: "tozero", nticks: 6, tickformat: ",~r",
      range: o.yMax !== undefined ? [0, o.yMax] : undefined },
    shapes, annotations,
  };
  Plotly.react(el, traces, layout, CONFIG);
}