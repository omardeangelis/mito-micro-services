import { describe, expect, it } from "vitest"
import { findColorViolations } from "../colorGate"

// The detector of the color gate (spec design-system-web, AC2): colors outside
// the tokens of the theme, in the sources of apps/web
const texts = (source: string, path = "x.tsx") =>
  findColorViolations(source, path).map((v) => v.text)

describe("findColorViolations", () => {
  it("reports palette classes, with variants and opacity", () => {
    expect(
      findColorViolations(
        '<div className="hover:bg-red-100 text-white" />',
        "x.tsx"
      )
    ).toHaveLength(2)
    expect(
      texts(
        'cn("data-[state=open]:bg-black/50 dark:bg-gray-800 text-grey-800 border-neutral-200")'
      )
    ).toHaveLength(4)
    expect(
      texts(
        '"ring-blue-500 outline-red-500 fill-emerald-500 stroke-slate-300 placeholder:text-gray-400 divide-zinc-100 from-sky-50 to-rose-50 ring-offset-white decoration-amber-600"'
      )
    ).toHaveLength(10)
  })

  it("accepts the tokens and the fixed values", () => {
    expect(
      texts(
        '<div className="bg-transparent text-current border-inherit bg-primary-soft" />'
      )
    ).toEqual([])
    expect(
      texts(
        'cn("text-tag-blue-text bg-tag-red-bg border-tag-amber-border fill-tag-green-dot text-success-soft-foreground border-destructive-text hover:bg-primary-hover")'
      )
    ).toEqual([])
  })

  it("leaves alone the utilities that share a prefix with the colors", () => {
    expect(
      texts(
        '"text-sm text-xs text-2xl text-left text-title border-2 border-t bg-cover bg-clip-text ring-2 ring-offset-2 outline-none outline-2 fill-none stroke-2 font-label"'
      )
    ).toEqual([])
  })

  it("reports arbitrary color classes", () => {
    expect(
      texts(
        '"bg-[#e5e7eb] text-[rgb(55,65,81)] border-[var(--color-gray-200)]"'
      )
    ).toHaveLength(3)
  })

  it("reports classes composed at runtime on a color prefix", () => {
    expect(texts("const c = `bg-${color}-50 text-${color}-700`")).toHaveLength(
      2
    )
  })

  it("reports color literals in TS and TSX", () => {
    expect(texts('const blue = "#3b82f6"', "palette.ts")).toHaveLength(1)
    expect(
      texts(
        '<Bar fill="#fff" stroke="rgb(0 0 0)" style={{ color: "rgba(0,0,0,.5)" }} />'
      )
    ).toHaveLength(3)
    expect(
      texts('const a = "hsl(0 0% 9%)"; const b = "oklch(40% 0.15 272)"')
    ).toHaveLength(2)
  })

  it("leaves alone the # that are not colors", () => {
    expect(
      texts('<a href="#main" /><a href="#dead-section" /><div id="faded" />')
    ).toEqual([])
  })

  it("reports the shadows outside the tokens", () => {
    expect(
      texts(
        '"shadow-sm shadow shadow-md shadow-lg shadow-[0_1px_2px_rgba(0,0,0,0.1)]"'
      )
    ).toHaveLength(5)
    expect(
      texts(
        '"shadow-xs shadow-card shadow-pop shadow-sidebar-active shadow-none"'
      )
    ).toEqual([])
    // the key of the shadows in the config of tailwind-merge (lib/utils.ts)
    expect(texts('{ shadow: ["card", "pop"] }', "utils.ts")).toEqual([])
  })

  it("reports palette variables and literals in CSS", () => {
    expect(
      texts(
        ".x { color: var(--color-gray-400); background: #fff; }",
        "src/x.css"
      )
    ).toHaveLength(2)
  })

  it("in the tokens file reports only classes and shadows", () => {
    const css = [
      ":root { --primary: oklch(40% 0.15 272); --shadow: 0 1px 2px #16161612; }",
      ".badge-with-close:hover { @apply bg-neutral-200 text-black shadow-md; }",
    ].join("\n")
    expect(
      findColorViolations(css, "src/styles/globals.css").map((v) => [
        v.line,
        v.text,
      ])
    ).toEqual([
      [2, "bg-neutral-200"],
      [2, "text-black"],
      [2, "shadow-md"],
    ])
  })

  // Every form AC2 names, one case each: a weaker detector fails here, not
  // later on a color that slipped into the app
  const PALETTE =
    "slate gray grey zinc neutral stone red orange amber yellow lime green emerald teal cyan sky blue indigo violet purple fuchsia pink rose mauve olive mist taupe".split(
      " "
    )
  const UTILITIES =
    "bg text border border-x border-y border-t border-r border-b border-l border-s border-e ring ring-offset inset-ring outline fill stroke divide from via to placeholder decoration accent caret shadow".split(
      " "
    )

  it.each(PALETTE)("reports the palette color %s", (color) => {
    expect(texts(`"bg-${color}-500"`)).toEqual([`bg-${color}-500`])
  })

  it.each(UTILITIES)("reports a palette color after %s-", (utility) => {
    expect(texts(`"${utility}-red-500"`)).toEqual([`${utility}-red-500`])
  })

  it.each([
    ['"!bg-red-100"', "bg-red-100"],
    ['"bg-red-100!"', "bg-red-100"],
    ['"md:hover:!bg-red-100"', "bg-red-100"],
    ['"bg-red-100/[0.5]"', "bg-red-100/[0.5]"],
    ['"text-white/50"', "text-white/50"],
    ['"[&>svg]:fill-black"', "fill-black"],
  ])("reports %s with its modifiers", (source, text) => {
    expect(texts(source)).toEqual([text])
  })

  it.each([
    ['"bg-[#e5e7eb]/50"', "bg-[#e5e7eb]/50"],
    ['"bg-[color:#e5e7eb]"', "bg-[color:#e5e7eb]"],
    ['"bg-(--color-red-500)"', "bg-(--color-red-500)"],
    ['"bg-[red]"', "bg-[red]"],
    ['"bg-[tomato]"', "bg-[tomato]"],
    ['"text-[black]"', "text-[black]"],
    ['"from-[White]"', "from-[White]"],
    [
      '"bg-[color-mix(in_oklab,red,blue)]"',
      "bg-[color-mix(in_oklab,red,blue)]",
    ],
    ['"bg-[RGB(0,0,0)]"', "bg-[RGB(0,0,0)]"],
    ['"[color:red]"', "[color:red]"],
    ['"hover:[background-color:#fff]"', "[background-color:#fff]"],
  ])("reports the arbitrary color %s", (source, text) => {
    expect(texts(source)).toEqual([text])
  })

  it.each([
    ["`bg-[${c}]`", "bg-[${"],
    ["`bg-[#${hex}]`", "bg-[#${"],
    ["`hover:text-${c}-700`", "text-${"],
  ])("reports the composed class %s", (source, text) => {
    expect(texts(source)).toEqual([text])
  })

  it.each([
    "shadow-2xs",
    "shadow-inner",
    "shadow-xl",
    "shadow-2xl",
    "shadow-(--x)",
    "inset-shadow-xs",
    "inset-shadow-sm",
    "drop-shadow-xs",
    "drop-shadow-md",
    "drop-shadow-[0_0_2px_red]",
    "text-shadow-xs",
    "text-shadow-lg",
  ])("reports the shadow %s", (shadow) => {
    expect(texts(`"${shadow}"`)).toEqual([shadow])
  })

  it.each([
    [
      '<div style={{ boxShadow: "0 0 0 1px currentColor" }} />',
      "x.tsx",
      "0 0 0 1px currentColor",
    ],
    [
      '<div style={{ textShadow: "0 1px 2px var(--border)" }} />',
      "x.tsx",
      "0 1px 2px var(--border)",
    ],
    [
      ".x { box-shadow: 0 4px 8px var(--border); }",
      "src/x.css",
      "0 4px 8px var(--border)",
    ],
    [
      ".x { filter: drop-shadow(0 0 2px var(--border)); }",
      "src/x.css",
      "drop-shadow(0 0 2px var(--border))",
    ],
  ])("reports the shadow written as a property: %s", (source, path, text) => {
    expect(texts(source, path)).toEqual([text])
  })

  it("accepts the shadows of the tokens written as a property", () => {
    expect(
      texts(
        '<div style={{ boxShadow: "none" }} /><div style={{ boxShadow: "var(--shadow-card)" }} />'
      )
    ).toEqual([])
    expect(
      texts(
        ".x { box-shadow: var(--shadow-pop); text-shadow: none; }",
        "src/x.css"
      )
    ).toEqual([])
    expect(
      texts('"shadow-none inset-shadow-none drop-shadow-none text-shadow-none"')
    ).toEqual([])
  })

  it.each([
    ['"#fff"', "#fff"],
    ['"#ffff"', "#ffff"],
    ['"#3b82f6cc"', "#3b82f6cc"],
    ['"rgba(0,0,0,.5)"', "rgba(0,0,0,.5)"],
    ['"hwb(0 0% 0%)"', "hwb(0 0% 0%)"],
    ['"lab(50% 40 59)"', "lab(50% 40 59)"],
    ['"lch(50% 40 59)"', "lch(50% 40 59)"],
    ['"oklab(50% 0.1 0.1)"', "oklab(50% 0.1 0.1)"],
    ['"color(srgb 1 0 0)"', "color(srgb 1 0 0)"],
    ['"color-mix(in oklab, red, blue)"', "color-mix(in oklab, red, blue)"],
    ['"RGB(0, 0, 0)"', "RGB(0, 0, 0)"],
    ['"HSL(0 0% 9%)"', "HSL(0 0% 9%)"],
    ['"device-cmyk(0 0 0 1)"', "device-cmyk(0 0 0 1)"],
    ['"var(--color-gray-400)"', "var(--color-gray-400)"],
    ['"var(--color-white)"', "var(--color-white)"],
    ['"var(--color-black)"', "var(--color-black)"],
    ['"#FFF"', "#FFF"],
    ['"#3B82F6"', "#3B82F6"],
  ])("reports the literal %s", (source, text) => {
    expect(texts(source)).toEqual([text])
  })

  it.each([
    ['<path fill="white" />', "x.tsx", "white"],
    ['<Pie stroke="white" />', "x.tsx", "white"],
    ['<Bar fill={"steelblue"} />', "x.tsx", "steelblue"],
    ['<stop stopColor="Black" />', "x.tsx", "Black"],
    ['<p style={{ color: "red" }} />', "x.tsx", "red"],
    ["<p style={{ backgroundColor: 'white' }} />", "x.tsx", "white"],
    [".x { color: red; }", "src/x.css", "red"],
    [".x { border: 1px solid black; }", "src/x.css", "black"],
    [".x { background: white }", "src/x.css", "white"],
    // Every key and attribute that paints, not a list of them
    ['<p style={{ borderTop: "1px solid red" }} />', "x.tsx", "red"],
    ['<p style={{ borderLeft: "1px solid red" }} />', "x.tsx", "red"],
    ['<p style={{ borderBottomColor: "red" }} />', "x.tsx", "red"],
    ['<p style={{ outline: "2px solid red" }} />', "x.tsx", "red"],
    ['<p style={{ outlineColor: "red" }} />', "x.tsx", "red"],
    ['<p style={{ caretColor: "red" }} />', "x.tsx", "red"],
    ['<p style={{ accentColor: "red" }} />', "x.tsx", "red"],
    ['<p style={{ textDecoration: "underline red" }} />', "x.tsx", "red"],
    ['<p style={{ textDecorationColor: "red" }} />', "x.tsx", "red"],
    ['<p style={{ scrollbarColor: "red" }} />', "x.tsx", "red"],
    ['<p style={{ fill: "red" }} />', "x.tsx", "red"],
    ['<p style={{ columnRule: "1px solid red" }} />', "x.tsx", "red"],
    ['<p style={{ textEmphasis: "dot red" }} />', "x.tsx", "red"],
    ['<p style={{ WebkitBoxShadow: "0 0 1px red" }} />', "x.tsx", "red"],
    ['<p style={{ stroke: "red" }} />', "x.tsx", "red"],
    ['<p style={{ "color": "white" }} />', "x.tsx", "white"],
    ['<p style={{ "--x": "red" }} />', "x.tsx", "red"],
    ['<feFlood floodColor="red" />', "x.tsx", "red"],
    ['<feDiffuseLighting lightingColor="red" />', "x.tsx", "red"],
    ['<path fill="Canvas" />', "x.tsx", "Canvas"],
    ['<CopyIcon color="white" />', "x.tsx", "white"],
    // Only its `color` is a tone: another attribute is a color like anywhere
    ['<ProgressCircle value={1} stroke="white" />', "x.tsx", "white"],
    [".x { border-inline-start: 1px solid black; }", "src/x.css", "black"],
    [".x { color: CanvasText; }", "src/x.css", "CanvasText"],
    [".x { --x: red; }", "src/x.css", "red"],
  ])("reports the named color in %s", (source, path, text) => {
    expect(texts(source, path)).toEqual([text])
  })

  it("accepts the values that are not colors of their own", () => {
    expect(
      texts(
        '<path fill="none" stroke="currentColor" /><circle fill="transparent" /><p style={{ color: "inherit", fill: "var(--tag-red-dot)" }} />'
      )
    ).toEqual([])
    expect(
      texts(
        ".x { color: currentColor; background: var(--tag-red-bg); }",
        "src/x.css"
      )
    ).toEqual([])
    // A tone of the chart palette passed to a component, not a CSS color
    expect(texts('<ProgressCircle color="blue" />')).toEqual([])
    expect(
      texts(
        '"ring-[3px] border-[1.5px] text-[13px] bg-(--primary) bg-[url(/x.png)] bg-[url(/img/white.png)]"'
      )
    ).toEqual([])
    expect(texts('chartColor("blue"); label("x")')).toEqual([])
  })

  it.each([
    ['"bg-[Canvas]"', "bg-[Canvas]"],
    ['"[color:CanvasText]"', "[color:CanvasText]"],
    ['"shadow-primary"', "shadow-primary"],
    ['"shadow-xs/50"', "shadow-xs/50"],
    ['"shadow-card/[0.1]"', "shadow-card/[0.1]"],
    ['<p style={{ backgroundImage: "linear-gradient(red, white)" }} />', "red"],
  ])("reports %s", (source, text) => {
    expect(texts(source)[0]).toBe(text)
  })

  // A color picked by an expression is still in the source
  it.each([
    ['<Check color={ok ? "white" : "black"} />', ["white", "black"]],
    ['<path fill={ok ? "white" : "none"} />', ["white"]],
    ['<p style={{ color: ok ? "red" : "blue" }} />', ["red", "blue"]],
    ['<p style={{ backgroundColor: ok ? "white" : undefined }} />', ["white"]],
    ["<p style={{ background: `linear-gradient(${a}, red)` }} />", ["red"]],
  ])("reports the named colors of an expression in %s", (source, colors) => {
    expect(texts(source)).toEqual(colors)
  })

  it.each([
    ['"bg-linear-[red,blue]"', "bg-linear-[red,blue]"],
    ['"bg-radial-[white,black]"', "bg-radial-[white,black]"],
    ['"bg-conic-[red,blue]"', "bg-conic-[red,blue]"],
    ['"bg-linear-45-[red,blue]"', "bg-linear-45-[red,blue]"],
    ['"bg-[var(--nope,red)]"', "bg-[var(--nope,red)]"],
    ['"shadow-card-foreground"', "shadow-card-foreground"],
  ])("reports the class %s", (source, text) => {
    expect(texts(source)).toEqual([text])
  })

  it("reports the fallback of a var()", () => {
    expect(texts('<p style={{ color: "var(--x, red)" }} />')).toEqual(["red"])
    expect(texts(".x { color: var(--x, white); }", "src/x.css")).toEqual([
      "white",
    ])
  })

  it("reports a shadow property that is a token but not a shadow", () => {
    expect(texts('<p style={{ boxShadow: "var(--ring)" }} />')).toEqual([
      "var(--ring)",
    ])
  })

  // The system colors of CSS Color 4, and a sample of the named ones
  it.each(
    "AccentColor AccentColorText ActiveText ButtonBorder ButtonFace ButtonText Canvas CanvasText Field FieldText GrayText Highlight HighlightText LinkText Mark MarkText SelectedItem SelectedItemText VisitedText navy rebeccapurple tomato silver gold".split(
      " "
    )
  )("reports the named color %s", (name) => {
    expect(texts(`<p style={{ color: "${name}" }} />`)).toEqual([name])
    expect(texts(`.x { outline: 1px solid ${name}; }`, "src/x.css")).toEqual([
      name,
    ])
  })

  it("leaves alone the identifiers and the text that look like a color", () => {
    expect(
      texts(
        "<p style={{ color: field.color, borderColor: highlight ? a : b, background: mark.bg }} />"
      )
    ).toEqual([])
    expect(texts("const s = { fillStyle: canvas }")).toEqual([])
    expect(texts("<p>Color: blue</p>")).toEqual([])
    // The tones of a chart
    expect(texts('<BarChart colors={["green", "orange"]} />')).toEqual([])
    expect(texts('const colors: Tone[] = ["blue", "orange"]')).toEqual([])
  })

  it("reports a gradient with named colors in CSS", () => {
    expect(
      texts(
        ".x { background-image: linear-gradient(red, white); }",
        "src/x.css"
      )
    ).toEqual(["red", "white"])
  })

  it("leaves the comments out, and only the comments", () => {
    expect(texts("const a = 1 // bg-red-100")).toEqual([])
    expect(texts("/* bg-red-100 */ const a = 1")).toEqual([])
    expect(texts("{/* #fff */}")).toEqual([])
    expect(
      texts(".x { /* #fff */ color: var(--foreground); }", "src/x.css")
    ).toEqual([])
    expect(texts('<input accept="image/*" className="bg-red-100" />')).toEqual([
      "bg-red-100",
    ])
    // A `/*` inside a string opens no comment, even with a `*/` after it
    expect(
      texts(
        '<input accept="image/*" className="bg-red-100" /> /* a */ const b = 1'
      )
    ).toEqual(["bg-red-100"])
    expect(texts('const u = "https://x.test"; const c = "bg-red-100"')).toEqual(
      ["bg-red-100"]
    )
  })

  it("leaves alone url(#…), entities and the words that end like a function", () => {
    expect(texts('<path fill="url(#grad)" /><p>&#169;</p>')).toEqual([])
  })

  it("in the tokens file exempts only the declarations of the tokens", () => {
    const tokens = "src/styles/globals.css"
    // A token ends at its `;`: the declaration after it is not one
    expect(
      texts(":root { --primary: oklch(40% 0.15 272); color: #fff; }", tokens)
    ).toEqual(["#fff"])
    expect(
      texts(
        ":root { --primary: oklch(40% 0.15 272); --shadow-xs: 0 1px 2px #16161612; }",
        tokens
      )
    ).toEqual([])
    expect(texts(".x { color: #fff; }", tokens)).toEqual(["#fff"])
    expect(
      texts("input::placeholder { color: var(--color-gray-400); }", tokens)
    ).toEqual(["var(--color-gray-400)"])
    // Only that file: another one with the same name is a file like any other
    expect(texts(":root { --x: #fff; }", "src/notstyles/globals.css")).toEqual([
      "#fff",
    ])
  })

  it("gives the line of each violation", () => {
    const source = [
      'const a = "ok"',
      "",
      '<p className="text-red-700" />',
    ].join("\n")
    expect(findColorViolations(source, "x.tsx")).toMatchObject([
      { line: 3, text: "text-red-700" },
    ])
  })

  it("counts the lines of a comment it leaves out", () => {
    const source = ["/* one", "two", "three */", '"text-red-700"'].join("\n")
    expect(findColorViolations(source, "x.tsx")).toMatchObject([
      { line: 4, text: "text-red-700" },
    ])
    expect(
      findColorViolations(
        ["/* one", "two */", ".x { color: #fff; }"].join("\n"),
        "src/x.css"
      )
    ).toMatchObject([{ line: 3, text: "#fff" }])
  })
})
