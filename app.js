/* =========================================================================
   Lifting Log — rendering + animation
   Renders everything from window.STRONG_DATA, then wires scroll animations.
   ========================================================================= */
(function () {
  "use strict";

  var D = window.STRONG_DATA;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var REDUCED = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var HAS_IO = "IntersectionObserver" in window;

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var COLORS = { squat: "#22d3ee", bench: "#ff2e97", deadlift: "#8b5cf6" };

  if (!D) {
    document.body.insertAdjacentHTML("beforeend",
      '<div class="noscript">Could not load workout data (data.js). Run <code>python3 build.py</code> first.</div>');
    return;
  }

  /* ----------------------------- formatting ----------------------------- */
  function commas(n) { return Math.round(n).toLocaleString("en-US"); }
  function compact(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 1 : 1).replace(/\.0$/, "") + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 0) + "k";
    return String(Math.round(n));
  }
  function fmt(val, decimals, format) {
    if (format === "compact") return compact(val);
    if (decimals) return val.toFixed(decimals);
    return commas(val);
  }
  function monthLabel(ym) { var p = ym.split("-"); return MONTHS[(+p[1]) - 1] + " " + p[0]; }
  function prettyDate(iso) { var p = iso.split("-"); return MONTHS[(+p[1]) - 1] + " " + p[0].slice(0) + (p.length > 2 ? "" : ""); }
  function prettyMonthYear(iso) { var p = iso.split("-"); return MONTHS[(+p[1]) - 1] + " " + p[0]; }

  /* ----------------------------- count-up ----------------------------- */
  function countUp(el) {
    if (el.dataset.done) return;
    el.dataset.done = "1";
    var to = parseFloat(el.dataset.count);
    var decimals = parseInt(el.dataset.decimals || "0", 10);
    var format = el.dataset.format || "int";
    if (REDUCED || !window.requestAnimationFrame) { el.textContent = fmt(to, decimals, format); return; }
    var dur = 1500, start = null;
    var ease = function (t) { return 1 - Math.pow(2, -10 * t); };
    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      el.textContent = fmt(to * ease(p), decimals, format);
      if (p < 1) requestAnimationFrame(step); else el.textContent = fmt(to, decimals, format);
    }
    requestAnimationFrame(step);
  }

  /* run once when an element scrolls into view (or immediately if no IO / reduced) */
  function onceInView(el, cb, threshold) {
    if (!HAS_IO) { cb(); return; }
    var o = new IntersectionObserver(function (ents) {
      ents.forEach(function (e) { if (e.isIntersecting) { cb(); o.disconnect(); } });
    }, { threshold: threshold || 0.2, rootMargin: "0px 0px -8% 0px" });
    o.observe(el);
  }

  /* ----------------------------- hero + rings ----------------------------- */
  function renderHero() {
    var start = D.meta.startDate;
    $("#heroEyebrow").textContent = "▲ Since " + prettyMonthYear(start) + " · " + D.meta.years + " years under the bar";
    $("#heroTotal").querySelector(".count").dataset.count = D.totals.plTotal;

    var C = 2 * Math.PI * 52;
    var html = D.big3.map(function (b) {
      var a = accentFor(b.pct);
      var offset = C * (1 - Math.min(b.pct, 100) / 100);
      var hs = b.heaviestSingle ? (b.heaviestSingle.w + " × " + b.heaviestSingle.reps) : "—";
      var togo = b.lbToGo > 0
        ? '<span class="stat-row__val badge-togo">' + b.lbToGo + " lb</span>"
        : '<span class="stat-row__val badge-togo is-pr">AT PR</span>';
      return '' +
        '<article class="ring-card reveal" style="--ring-glow:' + a.glow + ';--ring-tint:' + a.tint + ';--reveal-delay:' + (D.big3.indexOf(b) * 90) + 'ms">' +
          '<h3 class="ring-card__name">' + b.name + "</h3>" +
          '<div class="ring-wrap">' +
            '<svg class="ring" viewBox="0 0 120 120" aria-hidden="true">' +
              "<defs><linearGradient id=\"grad-" + b.key + "\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\">" +
                '<stop offset="0" stop-color="' + a.c0 + '"/><stop offset="1" stop-color="' + a.c1 + '"/>' +
              "</linearGradient></defs>" +
              '<circle class="ring__track" cx="60" cy="60" r="52"/>' +
              '<circle class="ring__bar" cx="60" cy="60" r="52" stroke="url(#grad-' + b.key + ')" ' +
                'stroke-dasharray="' + C.toFixed(2) + '" stroke-dashoffset="' + C.toFixed(2) + '" data-offset="' + offset.toFixed(2) + '"/>' +
            "</svg>" +
            '<div class="ring__center">' +
              '<div class="ring__pct"><span class="count" data-count="' + b.pct + '">0</span><sup>%</sup></div>' +
              '<div class="ring__pct-label">of best</div>' +
            "</div>" +
          "</div>" +
          '<dl class="ring-card__stats">' +
            '<div class="stat-row"><dt class="stat-row__label">Best (est. 1RM)</dt><dd class="stat-row__val">' + b.bestE1rm + ' lb</dd></div>' +
            '<div class="stat-row"><dt class="stat-row__label">Heaviest single</dt><dd class="stat-row__val">' + hs + "</dd></div>" +
            '<div class="stat-row"><dt class="stat-row__label">To go</dt><dd>' + togo + "</dd></div>" +
          "</dl>" +
        "</article>";
    }).join("");
    $("#rings").innerHTML = html;
  }

  function accentFor(pct) {
    if (pct >= 95) return { c0: "#22d3ee", c1: "#b6ff3c", glow: "var(--lime-glow)", tint: "rgba(182,255,60,0.16)" };
    if (pct >= 85) return { c0: "#8b5cf6", c1: "#22d3ee", glow: "var(--cyan-glow)", tint: "rgba(34,211,238,0.16)" };
    return { c0: "#ff2e97", c1: "#8b5cf6", glow: "var(--magenta-glow)", tint: "rgba(255,46,151,0.16)" };
  }

  /* ----------------------------- lifetime totals ----------------------------- */
  function renderTotals() {
    var t = D.totals;
    var cards = [
      { num: t.volumeLb, fmt: "compact", unit: "lb", label: "Total volume", sub: "weight × reps, all time", accent: "var(--cyan)" },
      { num: t.reps, fmt: "int", unit: "", label: "Total reps", sub: "every rep counted", accent: "var(--magenta)" },
      { num: t.sessions, fmt: "int", unit: "", label: "Workouts logged", sub: "sessions since 2016", accent: "var(--violet)" },
      { num: t.hours, fmt: "int", unit: "hrs", label: "Time training", sub: "≈ " + Math.round(t.hours / 24) + " full days", accent: "var(--lime)" },
      { num: D.meta.years, fmt: "dec1", unit: "yrs", label: "Years tracked", sub: "and counting", accent: "var(--amber)" },
      { num: t.exercises, fmt: "int", unit: "", label: "Unique exercises", sub: "movements trained", accent: "var(--cyan)" }
    ];
    $("#statsGrid").innerHTML = cards.map(function (c, i) {
      var decimals = c.fmt === "dec1" ? 1 : 0;
      var format = c.fmt === "compact" ? "compact" : "int";
      var unit = c.unit ? '<span class="stat-card__unit">' + c.unit + "</span>" : "";
      return '' +
        '<article class="stat-card reveal" style="--accent:' + c.accent + ";--reveal-delay:" + (i * 70) + 'ms">' +
          '<span class="stat-card__accent"></span>' +
          '<div class="stat-card__num"><span class="count" data-count="' + c.num + '" data-decimals="' + decimals + '" data-format="' + format + '">0</span>' + unit + "</div>" +
          '<div class="stat-card__label">' + c.label + "</div>" +
          '<div class="stat-card__sub">' + c.sub + "</div>" +
        "</article>";
    }).join("");
  }

  /* ----------------------------- progression chart ----------------------------- */
  var progressChart = null;
  function renderProgress() {
    if (!window.Chart) { $("#progress .chart-box").innerHTML = '<p class="explorer-empty">Chart library failed to load.</p>'; return; }
    setChartDefaults();

    var labels = D.progression.months;
    var datasets = D.big3.map(function (b) {
      return {
        label: b.name,
        data: D.progression.series[b.key],
        borderColor: COLORS[b.key],
        backgroundColor: hexA(COLORS[b.key], 0.08),
        borderWidth: 2.5,
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: COLORS[b.key],
        spanGaps: true,
        fill: true
      };
    });

    // toggle chips
    $("#lineToggles").innerHTML = D.big3.map(function (b) {
      return '<button class="chip" type="button" aria-pressed="true" data-key="' + b.key + '" style="--chip-color:' + COLORS[b.key] + '">' +
        '<span class="chip__dot"></span>' + b.name + "</button>";
    }).join("");

    onceInView($("#progress .chart-card"), function () {
      progressChart = new Chart($("#progressChart"), {
        type: "line",
        data: { labels: labels, datasets: datasets },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          animation: REDUCED ? false : { duration: 1400, easing: "easeOutQuart" },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: "rgba(11,13,24,0.95)", borderColor: "rgba(140,160,220,0.3)", borderWidth: 1,
              padding: 12, titleFont: { family: "'Orbitron',sans-serif", size: 12 },
              callbacks: {
                title: function (items) { return monthLabel(items[0].label); },
                label: function (it) { return it.dataset.label + ": " + it.formattedValue + " lb"; }
              }
            }
          },
          scales: {
            x: {
              grid: { color: "rgba(140,160,220,0.06)" },
              ticks: {
                maxRotation: 0, autoSkip: false,
                callback: function (val) { var l = this.getLabelForValue(val); return /-01$/.test(l) ? l.slice(0, 4) : ""; }
              }
            },
            y: {
              grid: { color: "rgba(140,160,220,0.08)" },
              title: { display: true, text: "est. 1RM (lb)", color: "#6b7390" }
            }
          }
        }
      });
    });

    $("#lineToggles").addEventListener("click", function (e) {
      var chip = e.target.closest(".chip"); if (!chip || !progressChart) return;
      var idx = D.big3.map(function (b) { return b.key; }).indexOf(chip.dataset.key);
      var ds = progressChart.data.datasets[idx];
      ds.hidden = !ds.hidden;
      chip.setAttribute("aria-pressed", String(!ds.hidden));
      progressChart.update();
    });
  }

  /* ----------------------------- consistency ----------------------------- */
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function isoOf(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }

  function renderHeatmap() {
    var cal = D.calendar;
    var end = new Date(cal.through + "T00:00:00");
    // align end to Saturday (end of week)
    var endAligned = new Date(end); endAligned.setDate(end.getDate() + (6 - end.getDay()));
    var start = new Date(endAligned); start.setDate(endAligned.getDate() - 7 * 52 - 6); // back to a Sunday, ~53 weeks
    while (start.getDay() !== 0) start.setDate(start.getDate() - 1);

    var maxSets = cal.maxSets || 1;
    var cells = [];
    var cur = new Date(start);
    while (cur <= endAligned) {
      var iso = isoOf(cur);
      var future = cur > end;
      var sets = cal.days[iso] || 0;
      var level = future ? -1 : (sets === 0 ? 0 : Math.min(4, Math.ceil(sets / maxSets * 4)));
      if (future) {
        cells.push('<span class="hm-cell hm-0" style="visibility:hidden"></span>');
      } else {
        var title = sets > 0 ? (sets + " sets · " + iso) : ("No training · " + iso);
        cells.push('<span class="hm-cell hm-' + level + '" title="' + title + '"></span>');
      }
      cur.setDate(cur.getDate() + 1);
    }
    $("#heatmap").innerHTML = cells.join("");
  }

  function renderYearChart() {
    if (!window.Chart) return;
    setChartDefaults();
    var vy = D.volumeByYear;
    onceInView($("#consistency .consistency-grid"), function () {
      new Chart($("#yearChart"), {
        type: "bar",
        data: {
          labels: vy.map(function (r) { return String(r.year); }),
          datasets: [{
            data: vy.map(function (r) { return r.volume; }),
            backgroundColor: vy.map(function (r) { return hexA("#22d3ee", 0.55); }),
            hoverBackgroundColor: "#b6ff3c",
            borderColor: "#22d3ee", borderWidth: 1, borderRadius: 5
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          animation: REDUCED ? false : { duration: 1200, easing: "easeOutQuart" },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: "rgba(11,13,24,0.95)", borderColor: "rgba(140,160,220,0.3)", borderWidth: 1, padding: 12,
              callbacks: {
                label: function (it) {
                  var r = vy[it.dataIndex];
                  return [commas(r.volume) + " lb", r.sessions + " sessions"];
                }
              }
            }
          },
          scales: {
            x: { grid: { display: false } },
            y: {
              grid: { color: "rgba(140,160,220,0.08)" },
              ticks: { callback: function (v) { return compact(v); } }
            }
          }
        }
      });
    });
  }

  /* ----------------------------- exercise explorer ----------------------------- */
  function renderExplorer() {
    var list = D.exercises;
    $("#exCount").textContent = list.length;

    var order = ["All", "Barbell", "Dumbbell", "Cable", "Machine", "Bodyweight", "Other"];
    var present = {};
    list.forEach(function (e) { present[e.category] = true; });
    var cats = order.filter(function (c) { return c === "All" || present[c]; });
    $("#exFilters").innerHTML = cats.map(function (c, i) {
      return '<button class="chip" type="button" aria-pressed="' + (i === 0) + '" data-cat="' + c + '">' + c + "</button>";
    }).join("");

    var activeCat = "All", query = "";
    var grid = $("#exGrid"), empty = $("#exEmpty");

    function card(e) {
      var s1, s2;
      if (e.bestE1rm > 0) {
        s1 = '<div><div class="ex-stat__num">' + e.bestE1rm + ' <small>lb</small></div><div class="ex-stat__label">est. 1RM</div></div>';
      } else {
        s1 = '<div><div class="ex-stat__num">' + e.sets + '</div><div class="ex-stat__label">sets</div></div>';
      }
      if (e.topSet) {
        s2 = '<div><div class="ex-stat__num">' + e.topSet.w + ' <small>× ' + e.topSet.reps + '</small></div><div class="ex-stat__label">top set</div></div>';
      } else {
        s2 = '<div><div class="ex-stat__num">' + e.sets + '</div><div class="ex-stat__label">sets logged</div></div>';
      }
      return '<article class="ex-card">' +
        '<div class="ex-card__top"><h3 class="ex-card__name">' + e.name + '</h3>' +
          '<span class="ex-tag" data-cat="' + e.category + '">' + e.category + "</span></div>" +
        '<div class="ex-card__stats">' + s1 + s2 + "</div>" +
        "</article>";
    }

    function apply() {
      var q = query.trim().toLowerCase();
      var filtered = list.filter(function (e) {
        if (activeCat !== "All" && e.category !== activeCat) return false;
        if (q && e.name.toLowerCase().indexOf(q) === -1) return false;
        return true;
      });
      grid.innerHTML = filtered.map(card).join("");
      empty.hidden = filtered.length > 0;
    }

    $("#exSearch").addEventListener("input", function (e) { query = e.target.value; apply(); });
    $("#exFilters").addEventListener("click", function (e) {
      var chip = e.target.closest(".chip"); if (!chip) return;
      activeCat = chip.dataset.cat;
      $$("#exFilters .chip").forEach(function (c) { c.setAttribute("aria-pressed", String(c === chip)); });
      apply();
    });
    apply();
  }

  /* ----------------------------- footer ----------------------------- */
  function renderFooter() {
    $("#footerRange").textContent = prettyMonthYear(D.meta.startDate) + " — " + prettyMonthYear(D.meta.endDate);
    $("#footerUpdated").textContent = "Updated " + prettyMonthYear(D.meta.generatedAt);
  }

  /* ----------------------------- chart helpers ----------------------------- */
  var defaultsSet = false;
  function setChartDefaults() {
    if (defaultsSet || !window.Chart) return;
    defaultsSet = true;
    Chart.defaults.color = "#9aa3bd";
    Chart.defaults.font.family = "'Rajdhani', sans-serif";
    Chart.defaults.font.size = 13;
    Chart.defaults.borderColor = "rgba(140,160,220,0.08)";
  }
  function hexA(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }

  /* ----------------------------- reveal + counts ----------------------------- */
  function initReveal() {
    var items = $$(".reveal");
    if (!HAS_IO) {
      items.forEach(function (el) { el.classList.add("in-view"); });
      $$("[data-count]").forEach(countUp);
      return;
    }
    var obs = new IntersectionObserver(function (ents) {
      ents.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target;
        el.classList.add("in-view");
        $$("[data-count]", el).forEach(countUp);
        $$(".ring__bar", el).forEach(function (bar) { bar.style.strokeDashoffset = bar.dataset.offset; });
        obs.unobserve(el);
      });
    }, { threshold: 0.18, rootMargin: "0px 0px -6% 0px" });
    items.forEach(function (el) { obs.observe(el); });
  }

  /* ----------------------------- nav ----------------------------- */
  function initNav() {
    var toggle = $("#navToggle"), links = $("#navLinks");
    toggle.addEventListener("click", function () {
      var open = links.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    links.addEventListener("click", function (e) {
      if (e.target.tagName === "A") { links.classList.remove("open"); toggle.setAttribute("aria-expanded", "false"); }
    });

    if (!HAS_IO) return;
    var map = {};
    $$(".nav__links a").forEach(function (a) { map[a.getAttribute("href").slice(1)] = a; });
    var spy = new IntersectionObserver(function (ents) {
      ents.forEach(function (e) {
        if (!e.isIntersecting) return;
        $$(".nav__links a").forEach(function (a) { a.classList.remove("active"); });
        if (map[e.target.id]) map[e.target.id].classList.add("active");
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    $$("main .section").forEach(function (s) { spy.observe(s); });
  }

  /* ----------------------------- scroll progress ----------------------------- */
  function initScrollbar() {
    var bar = $("#scrollbar"), ticking = false;
    function update() {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      var p = h > 0 ? window.scrollY / h : 0;
      bar.style.transform = "scaleX(" + Math.min(Math.max(p, 0), 1) + ")";
      ticking = false;
    }
    window.addEventListener("scroll", function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }

  /* ----------------------------- boot ----------------------------- */
  renderHero();
  renderTotals();
  renderProgress();
  renderHeatmap();
  renderYearChart();
  renderExplorer();
  renderFooter();
  initReveal();
  initNav();
  initScrollbar();
})();
