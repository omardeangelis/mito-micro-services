#!/usr/bin/env node
// State sweep report (STATE-SWEEP.md → Step 4): renders STATES.md and its screenshots as
// one page a person reads top to bottom, one state under the other, the screenshots large.
//
//   node <skillsDir>/prototype/scripts/state-report.mjs <winner-dir> [--base <origin>] [--lang en|it]
//
// <winner-dir> holds STATES.md and states/. Writes <winner-dir>/STATES.html next to them and
// prints its path. --base is the origin the winner runs on (http://localhost:5173): the
// prototype and live-state links become absolute, so they work from file:// too. Without it
// they stay relative to the page. --lang picks the language of the page's own labels; the
// content is STATES.md's, as written. Reads the States table by its header names, so a
// column added or moved does not break it. Plain Node, no dependencies, no network.
// On failure: a message on stderr and exit 1.

import fs from "node:fs"
import path from "node:path"

const LABELS = {
  en: {
    open: "Open the prototype ↗",
    live: "Open the live state ↗",
    states: "states",
    legend: "Legend",
    present: "Prototype",
    presentTip: "Present, and reachable by interacting with the prototype.",
    built: "Alternative state",
    builtTip:
      "Not reachable by using the prototype: it appears only when certain conditions occur. Opened here through the state switch.",
    realOnly: "Real system only",
    realTip:
      "A real state the prototype cannot reproduce. It goes to the spec as a criterion or an open question.",
    approvedTip:
      "Whether the user approved these states. The UX and UI reviews start only after approved: yes.",
    decisionTip:
      "The choices taken on this state, with exact copy and values. They enter the spec as decisions already taken.",
    needsTip:
      "A product question: the code proves the state exists but not what to show. With the pick taken and who took it.",
    origin: "Where it comes from",
    trigger: "Real trigger",
    source: "Source",
    decision: "Decision taken",
    needs: "Needs you",
    pick: "Pick:",
    shared: "Decisions shared by several states",
    needsAll: "Needs you",
    question: "Question",
    takenBy: "Taken by",
    real: "Real system only",
    dropped: "Dropped",
    none: "None.",
    noShot: "No screenshot: open the live state.",
    generated: "generated from",
    top: "Top",
    end: "End of report",
    degraded: "DEGRADED — no screenshots",
  },
  it: {
    open: "Apri il prototipo ↗",
    live: "Apri lo stato vivo ↗",
    states: "stati",
    legend: "Legenda",
    present: "Prototipo",
    presentTip: "Presente e osservabile interagendo con il prototipo.",
    built: "Stato alternativo",
    builtTip:
      "Stato non osservabile nel prototipo, ma presente al verificarsi di determinate condizioni. Qui si apre con lo switch degli stati.",
    realOnly: "Solo sul sistema reale",
    realTip:
      "Stato vero che il prototipo non può riprodurre. Finisce nella spec come criterio o come domanda aperta.",
    approvedTip:
      "Se l'utente ha approvato questi stati. Le review UX e UI partono solo dopo approved: yes.",
    decisionTip:
      "Le scelte prese su questo stato, con testo e valori esatti. Entrano nella spec come decisioni già prese.",
    needsTip:
      "Una domanda di prodotto: il codice dice che lo stato esiste ma non cosa mostrare. Con la scelta presa e chi l'ha presa.",
    origin: "Da dove viene",
    trigger: "Trigger reale",
    source: "Fonte",
    decision: "Decisione presa",
    needs: "Needs you",
    pick: "Scelta:",
    shared: "Decisioni comuni a più stati",
    needsAll: "Needs you",
    question: "Domanda",
    takenBy: "Presa da",
    real: "Solo sul sistema reale",
    dropped: "Tolti",
    none: "Nessuno.",
    noShot: "Nessuno screenshot: apri lo stato vivo.",
    generated: "generato da",
    top: "Inizio",
    end: "Fine report",
    degraded: "DEGRADED — nessuno screenshot",
  },
}

const fail = (msg) => {
  process.stderr.write(`state-report: ${msg}\n`)
  process.exit(1)
}

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(name)
  return i === -1 ? undefined : args.splice(i, 2)[1]
}
const base = (flag("--base") ?? "").replace(/\/$/, "")
const L = LABELS[flag("--lang") ?? "en"] ?? fail("--lang must be en or it")
const dir = args[0] ?? fail("usage: state-report.mjs <winner-dir> [--base <origin>] [--lang en|it]")
const mdPath = path.join(dir, "STATES.md")
if (!fs.existsSync(mdPath)) fail(`no STATES.md in ${dir}`)
const md = fs.readFileSync(mdPath, "utf8")

const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
const inline = (t) =>
  esc(t)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/^_(.+)_$/, "<em>$1</em>")

const section = (name) => {
  const m = md.match(new RegExp(`^## ${name}\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "m"))
  return m ? m[1].trim() : ""
}
const bulletsOf = (body) => [...body.matchAll(/^- (.+)$/gm)].map((m) => m[1])
// A table as objects keyed by lower-cased header names.
const table = (body) => {
  const lines = body.split("\n").filter((l) => l.startsWith("|"))
  if (lines.length < 2) return []
  const cells = (l) => l.trim().replace(/^\||\|$/g, "").split(" | ").map((c) => c.trim())
  const head = cells(lines[0]).map((h) => h.toLowerCase())
  return lines.slice(2).map((l) => Object.fromEntries(cells(l).map((c, i) => [head[i], c])))
}
// The S-ids a text names, ranges such as S12–S18 expanded.
const idsIn = (text) =>
  [...text.matchAll(/S(\d+)(?:\s*[–-]\s*S(\d+))?/g)].flatMap(([, a, b]) => {
    const lo = Number(a)
    const hi = Number(b ?? a)
    return Array.from({ length: hi - lo + 1 }, (_, k) => `S${lo + k}`)
  })

const title = md.match(/^# (.+)$/m)?.[1] ?? "State sweep"
const winner = md.match(/^Winner: (.+)$/m)?.[1] ?? ""
const approved = md.match(/^approved: (.+)$/m)?.[1] ?? "no"
const route = winner.match(/at `([^`]+)`/)?.[1] ?? ""
const href = (state) => {
  const url = `${base}${route}`
  return state ? `${url}${url.includes("?") ? "&" : "?"}state=${state}` : url
}

const rows = table(section("States"))
if (rows.length === 0) fail("STATES.md has no States table")
const col = (r, ...names) => names.map((n) => r[n]).find((v) => v !== undefined) ?? ""
const states = rows.map((r) => ({
  id: col(r, "id"),
  area: col(r, "action or region"),
  state: col(r, "state"),
  description: col(r, "description"),
  trigger: col(r, "real trigger"),
  source: col(r, "source"),
  proto: col(r, "in the prototype"),
  shots: [...col(r, "screenshots").matchAll(/`(states\/[^`]+)`/g)].map((m) => m[1]),
}))
const shown = states.filter((s) => !s.proto.startsWith("real only"))
const realRows = states.filter((s) => s.proto.startsWith("real only"))

// A decision whose bold label names one to three states sits under those states; a wider
// one, or one that names none, is shared and stays at the top.
const perState = {}
const shared = []
for (const d of bulletsOf(section("Decisions"))) {
  const label = d.match(/^\*\*([^*]+)\*\*/)
  const named = label ? idsIn(label[1]) : []
  if (named.length >= 1 && named.length <= 3) for (const id of named) (perState[id] ??= []).push(d)
  else shared.push(d)
}
const needs = table(section("Needs you"))
const needsByState = {}
for (const n of needs) for (const id of idsIn(col(n, "question"))) (needsByState[id] ??= []).push(n)

const realBullets = bulletsOf(section("Real only"))
const anyShot = shown.some((s) => s.shots.length > 0)
const built = shown.filter((s) => s.proto === "built").length
const list = (items) =>
  items.map((i) => `<li>${inline(i)}</li>`).join("") || `<li class="muted">${L.none}</li>`
// A label that explains itself: its meaning opens on hover and on keyboard focus.
// `end` anchors the tooltip to the label's right edge, for labels near the right margin.
const tag = (kind, text, tip, end = false) =>
  `<span class="tag ${kind}" tabindex="0">${text}<span class="tip${end ? " end" : ""}" role="tooltip">${esc(tip)}</span></span>`

const shot = (s, id) => {
  const w = path.basename(s, ".png").split("-").slice(1).join(" ")
  const kind = /^\d+/.test(w) && Number.parseInt(w, 10) < 768 ? "phone" : "desk"
  return `<a class="shot ${kind}" href="${s}" target="_blank"><img loading="lazy" src="${s}" alt="${id}, ${w}"><span>${w} px</span></a>`
}

const groups = new Map()
for (const s of shown) groups.set(s.area, [...(groups.get(s.area) ?? []), s])

const nav = []
const body = []
let pos = 0
for (const [area, items] of groups) {
  nav.push(`<p class="navarea">${inline(area)}</p>`)
  body.push(`<h2 class="area">${inline(area)}</h2>`)
  for (const s of items) {
    pos += 1
    nav.push(`<a href="#${s.id}"><b>${s.id}</b> ${inline(s.state)}</a>`)
    const notes = [
      perState[s.id]
        ? `<div class="note"><h4>${tag("plain", L.decision, L.decisionTip)}</h4><ul>${list(perState[s.id])}</ul></div>`
        : "",
      ...(needsByState[s.id] ?? []).map(
        (n) =>
          `<div class="note needs"><h4>${tag("plain", `${L.needs} #${inline(col(n, "#"))}`, L.needsTip)}</h4><p>${inline(col(n, "question"))}</p><p><strong>${L.pick}</strong> ${inline(col(n, "pick"))}</p></div>`,
      ),
    ].join("")
    body.push(`<section class="state" id="${s.id}">
  <header>
    <span class="count">${pos} / ${shown.length}</span>
    <h3><span class="sid">${s.id}</span> ${inline(s.state)}</h3>
    ${s.proto === "built" ? tag("built", L.built, L.builtTip, true) : tag("present", L.present, L.presentTip, true)}
  </header>
  ${s.description ? `<p class="desc">${inline(s.description)}</p>` : ""}
  <div class="shots">${s.shots.map((x) => shot(x, s.id)).join("") || `<p class="noshot">${L.noShot}</p>`}</div>
  <div class="meta">
    <details><summary>${L.origin}</summary><dl><dt>${L.trigger}</dt><dd>${inline(s.trigger)}</dd><dt>${L.source}</dt><dd>${inline(s.source)}</dd></dl></details>
    <a class="open" href="${href(s.id)}" target="_blank">${L.live}</a>
  </div>
  ${notes}
</section>`)
  }
}

const needsRows = needs
  .map(
    (n) =>
      `<tr><td>${inline(col(n, "#"))}</td><td>${inline(col(n, "question"))}</td><td>${inline(col(n, "pick"))}</td><td class="muted">${inline(col(n, "taken by"))}</td></tr>`,
  )
  .join("")
const realItems = [
  ...realRows.map(
    (s) => `**${s.id}** ${s.state}${s.description ? `: ${s.description}` : ""} (${s.proto.replace(/^real only:?\s*/, "")})`,
  ),
  ...realBullets,
]

const page = `<!doctype html>
<html lang="${L === LABELS.it ? "it" : "en"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
:root{--bg:#f6f6f4;--card:#fff;--fg:#1b1b1a;--muted:#6b6a66;--line:#e4e3df;--accent:#1f6feb;--ok:#1a7f37;--warn:#9a6700;--chip:#efeee9;--note:#f3f6fb;--needs:#fbf6ea}
@media (prefers-color-scheme:dark){:root{--bg:#141413;--card:#1e1e1c;--fg:#ecebe7;--muted:#a19f98;--line:#33322f;--accent:#6ea8fe;--ok:#4ac26b;--warn:#d4a72c;--chip:#2a2a27;--note:#1b2230;--needs:#2a2416}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.layout{display:grid;grid-template-columns:240px minmax(0,1fr);max-width:1480px;margin:0 auto}
nav{position:sticky;top:0;height:100vh;overflow-y:auto;padding:28px 12px 28px 20px;border-right:1px solid var(--line);font-size:13px}
nav a{display:block;color:var(--fg);text-decoration:none;padding:3px 8px;border-radius:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
nav a:hover{background:var(--chip)}nav a b{color:var(--accent);display:inline-block;min-width:30px}
.navarea{margin:16px 0 4px 8px;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
main{padding:32px 40px 120px;min-width:0}
h1{font-size:28px;margin:0 0 4px}
.lede{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px;margin:16px 0 8px}
.cta{background:var(--accent);color:#fff;text-decoration:none;font-weight:600;border-radius:8px;padding:8px 14px}
.pill{background:var(--card);border:1px solid var(--line);border-radius:999px;padding:4px 12px;font-size:13px}
.pill.no{border-color:var(--warn);color:var(--warn)}.pill.yes{border-color:var(--ok);color:var(--ok)}
.muted{color:var(--muted)}code{font:12.5px ui-monospace,Menlo,monospace;background:var(--chip);padding:1px 5px;border-radius:4px;word-break:break-word}
h2.area{font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin:72px 0 0;padding-bottom:8px;border-bottom:2px solid var(--fg)}
.state{padding:36px 0 44px;border-bottom:1px solid var(--line);scroll-margin-top:8px}
.state header{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 14px}
.state h3{font-size:21px;line-height:1.3;margin:0;flex:1 1 420px}.sid{color:var(--accent);margin-right:6px}
.count{font-size:12px;color:var(--muted);flex-basis:100%}
.tag{position:relative;display:inline-block;font-size:12px;border-radius:999px;padding:2px 10px;background:var(--chip);white-space:nowrap;cursor:help;outline-offset:2px}
.tag.present{color:var(--muted)}.tag.built{color:var(--ok)}.tag.real{color:var(--warn)}
.tag.plain{background:none;padding:0;border-radius:0;font-size:inherit;text-decoration:underline dotted;text-underline-offset:3px}
.tag.pill{font-size:13px;padding:4px 12px;border:1px solid var(--line);background:var(--card)}
h2 .tag{font-size:inherit;background:none;padding:0;color:inherit;text-decoration:underline dotted;text-underline-offset:4px}
.tip{position:absolute;left:0;top:calc(100% + 6px);z-index:10;width:max-content;max-width:300px;padding:8px 10px;border-radius:8px;background:var(--fg);color:var(--bg);font:400 12.5px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:0;text-transform:none;white-space:normal;text-align:left;opacity:0;visibility:hidden;pointer-events:none;transition:opacity .12s ease-out,visibility .12s}
.tip.end{left:auto;right:0}
.tag:hover .tip,.tag:focus-visible .tip{opacity:1;visibility:visible}
.legend{margin-top:28px}.legend h2{font-size:20px;margin:0 0 12px}
.legend dl{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;grid-template-columns:max-content 1fr;gap:10px 18px;align-items:baseline;font-size:14px}
.desc{font-size:16px;max-width:72ch;margin:10px 0 20px}
/* Desktop and phone at the same height: each flexes by its aspect ratio. */
.shots{display:flex;gap:20px;align-items:flex-start}
.shot{display:block;text-decoration:none;color:var(--muted);font-size:12px;min-width:0}
.shot.desk{flex:1.6 1 0}.shot.phone{flex:.462 1 0}
.shot img{display:block;width:100%;border:1px solid var(--line);border-radius:10px;box-shadow:0 1px 2px rgba(0,0,0,.04),0 8px 24px rgba(0,0,0,.06)}
.shot span{display:block;margin-top:6px}
.noshot{border:1px dashed var(--line);border-radius:10px;padding:32px;color:var(--muted);margin:0;flex:1}
.meta{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:8px 24px;margin-top:16px;font-size:13.5px}
details{flex:1 1 480px}summary{cursor:pointer;color:var(--muted)}
dl{display:grid;grid-template-columns:auto 1fr;gap:2px 14px;margin:8px 0 0}dt{color:var(--muted)}dd{margin:0;min-width:0}
.open{color:var(--accent);text-decoration:none;font-weight:600;white-space:nowrap}
.note{margin-top:14px;background:var(--note);border-radius:10px;padding:12px 16px;font-size:14px}
.note.needs{background:var(--needs)}.note h4{margin:0 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
.note ul{margin:0;padding-left:18px}.note p{margin:4px 0}
h2.tail{font-size:20px;margin:72px 0 12px}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);font-size:13.5px}
td,th{padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:top;text-align:left}th{font-size:12px;color:var(--muted);font-weight:600}
.tablewrap{overflow-x:auto}ul.list{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 14px 14px 32px;margin:0}ul.list li{margin:6px 0}
@media (max-width:1000px){.layout{display:block}nav{display:none}main{padding:24px 16px 80px}
.shots{flex-direction:column}.shot.desk,.shot.phone{flex:none;width:100%}.shot.phone{max-width:300px}}
</style></head><body><div class="layout">
<nav><a href="#top"><b>↑</b> ${L.top}</a>${nav.join("")}<p class="navarea">${L.end}</p><a href="#shared">${L.shared}</a><a href="#needs">${L.needsAll}</a><a href="#real">${L.real}</a><a href="#dropped">${L.dropped}</a></nav>
<main id="top">
<h1>${inline(title)}</h1>
<p class="muted">${inline(winner)} · ${L.generated} <code>STATES.md</code>${anyShot ? "" : ` · <strong>${L.degraded}</strong>`}</p>
<div class="lede"><a class="cta" href="${href()}" target="_blank">${L.open}</a>
${tag(`pill ${approved.startsWith("yes") ? "yes" : "no"}`, `approved: ${inline(approved)}`, L.approvedTip)}
<span class="pill">${shown.length} ${L.states}</span>
${tag("pill present", `${shown.length - built} · ${L.present}`, L.presentTip)}
${tag("pill built", `${built} · ${L.built}`, L.builtTip)}
${tag("pill real", `${realItems.length} · ${L.realOnly}`, L.realTip)}</div>
<section class="legend" aria-labelledby="legend"><h2 id="legend">${L.legend}</h2><dl>
<dt>${tag("present", L.present, L.presentTip)}</dt><dd>${L.presentTip}</dd>
<dt>${tag("built", L.built, L.builtTip)}</dt><dd>${L.builtTip}</dd>
<dt>${tag("real", L.realOnly, L.realTip)}</dt><dd>${L.realTip}</dd>
<dt>${tag("plain", "approved", L.approvedTip)}</dt><dd>${L.approvedTip}</dd>
<dt>${tag("plain decision", L.decision, L.decisionTip)}</dt><dd>${L.decisionTip}</dd>
<dt>${tag("plain needs", L.needs, L.needsTip)}</dt><dd>${L.needsTip}</dd>
</dl></section>
<h2 class="tail" id="shared">${L.shared}</h2><ul class="list">${list(shared)}</ul>
${body.join("\n")}
<h2 class="tail" id="needs">${L.needsAll}</h2><div class="tablewrap"><table><tr><th>#</th><th>${L.question}</th><th>${L.pick.replace(":", "")}</th><th>${L.takenBy}</th></tr>${needsRows}</table></div>
<h2 class="tail" id="real">${tag("real", L.real, L.realTip)}</h2><ul class="list">${list(realItems)}</ul>
<h2 class="tail" id="dropped">${L.dropped}</h2><ul class="list">${list(bulletsOf(section("Dropped")))}</ul>
</main></div></body></html>
`

const out = path.join(dir, "STATES.html")
fs.writeFileSync(out, page)
process.stdout.write(`${out}\n`)
