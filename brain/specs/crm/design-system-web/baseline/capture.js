// @ts-nocheck: a script for the browser's console, not code of the repo;
// the root tsconfig checks every .js with checkJs
// What a page shows, for the parity check of design-system-web (AC23, AC25):
// T0 runs it before the change, T22 after, and the two outputs are compared.
// Run it with `agent-browser eval --stdin < capture.js`.
(() => {
  const visible = (el) => {
    const r = el.getBoundingClientRect()
    const s = getComputedStyle(el)
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"
  }
  const clean = (t) => (t ?? "").replace(/\s+/g, " ").trim()
  const name = (el) =>
    clean(el.getAttribute("aria-label") || el.getAttribute("title") || el.innerText || el.textContent)
  const all = (sel) => [...document.querySelectorAll(sel)].filter(visible)
  const list = (sel) => all(sel).map(name)
  const fieldName = (el) =>
    clean(
      el.getAttribute("aria-label") ||
        el.getAttribute("placeholder") ||
        el.labels?.[0]?.innerText ||
        el.getAttribute("name") ||
        el.tagName.toLowerCase()
    )
  return JSON.stringify(
    {
      url: location.pathname + location.search,
      title: document.title,
      headings: list("h1,h2,h3,h4,h5,h6,[role=heading]"),
      columns: list("th,[role=columnheader]"),
      buttons: list("button,[role=button]"),
      links: all("a[href]").map((a) => `${name(a)} -> ${a.getAttribute("href")}`),
      fields: all("input,textarea,select,[role=combobox]").map(fieldName),
      tabs: list("[role=tab]"),
      dialogs: list("[role=dialog],[role=alertdialog]").map((t) => t.slice(0, 300)),
      text: document.body.innerText.replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim(),
      scroll: {
        viewport: [innerWidth, innerHeight],
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      },
    },
    null,
    2
  )
})()
