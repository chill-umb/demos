// Top bar, side tabs and footer for every page (same layout as the ACE and ReStore demos).
// All links live here, so you only edit them once.

export const LINKS = {
  bufbenchCode: "https://github.com/chill-umb/BufBench",
  sievedbCode: "https://github.com/chill-umb/SIEVE_DB",
  bufbenchPaper: "https://aroma058.github.io/TPCTC26_paper_bufbench.pdf",
  sievedbPaper: "files/SIEVE_DB_EDBT27.pdf",     // TODO: add the PDF to files/
  demoPaper: "files/BufBench_SIGMOD27_demo.pdf", // TODO: add after submission
  video: "files/demo.mp4",                       // TODO: record the video
};

// The policy names used by PostgreSQL's eviction_algorithm setting,
// and how we show them on the website.
export const POLICIES = {
  clock: "CLOCK",
  lru: "LRU",
  cflru: "CFLRU",
  lruwsr: "LRU-WSR",
  sieve: "SIEVE",
  sieve_db: "SIEVE_DB",
};

// Side tabs (only pages that are ready; we add more in later steps)
const TABS = [
  ["index.html", "Home"],
];

const here = location.pathname.split("/").pop() || "index.html";

document.body.insertAdjacentHTML("afterbegin", `
  <header>
    <nav class="navbar navbar-dark fixed-top">
      <div class="container">
        <a class="navbar-brand" href="index.html">BufBench &amp; SIEVE_DB: Buffer Pools in Action</a>
        <ul class="navbar-nav ml-auto">
          <li class="nav-item"><a class="nav-link" href="index.html#publications">Publications</a></li>
          <li class="nav-item"><a class="nav-link" href="index.html#team">The Team</a></li>
          <li class="nav-item"><a class="nav-link" href="${LINKS.bufbenchCode}">Code</a></li>
        </ul>
      </div>
    </nav>
  </header>
  <div id="left-sidebar">
    ${TABS.map(([href, label]) => `<a href="${href}" class="${href === here ? "active" : ""}">${label}</a>`).join("")}
  </div>`);

document.body.insertAdjacentHTML("beforeend", `
  <footer class="site-footer">
    <div class="logos">
      <img src="img/UMB-logo.png" alt="University of Massachusetts Boston">
      <img src="img/chill-logo.png" alt="CHiLL Lab">
    </div>
    <p>Aroma Hoque and Tarikul Islam Papon, CHiLL Lab, University of Massachusetts Boston</p>
  </footer>`);
