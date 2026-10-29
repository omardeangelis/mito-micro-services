// The detector of the color gate (spec design-system-web, AC2): it finds the
// colors that sit outside the tokens of the theme. Pure, so a test can feed it
// any text; src/_test/colors.test.ts runs it over the sources of the app.

export type ViolationKind =
  "palette" | "arbitrary" | "composed" | "shadow" | "literal"

export type Violation = {
  /** 1-based */
  line: number
  /** The class or literal, without its variants */
  text: string
  kind: ViolationKind
}

// Tailwind's palette (the last four came with 4.2) and the typo `grey`
const PALETTE =
  "slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|mauve|olive|mist|taupe"
// `white` and `black` are colors of the palette too
const NAMED = `(?:${PALETTE}|white|black)(?![a-z])`
const COLOR = `(?:(?:${PALETTE})-\\d{2,3}|white|black)`

// The utilities that take a color: `text-` and `border-` are also a size and
// a width, which is why a class counts only with a color after it
const UTILITY =
  "(?:bg|text|border(?:-[xytrblse])?|ring(?:-offset)?|inset-ring|outline|fill|stroke|divide|from|via|to|placeholder|decoration|accent|caret|(?:(?:inset|drop|text)-)?shadow)"

// A class starts after a space, a quote, `{`, `(` or the `:` of a variant, so
// `text-tag-blue-text` and `bg-clip-text` never read as a color. The `!` is
// the old important modifier
const START = "(?<=^|[\\s\"'`{(:])!?"
const OPACITY = "(?:/(?:\\d+|\\[[^\\]\\s]*\\]|\\([^)\\s]*\\)))?"

// `bg-red-100`, `hover:text-white/50`: transparent, current and inherit are
// not in the palette, so they pass
const PALETTE_CLASS = new RegExp(
  `${START}(${UTILITY}-${COLOR}${OPACITY})(?![\\w-])`,
  "g"
)

// The named colors of CSS and its system colors (`Canvas`, `CanvasText`);
// `transparent` and `currentColor` are not a color of their own
const SYSTEM_COLORS =
  "accentcolor|accentcolortext|activetext|buttonborder|buttonface|buttontext|canvas|canvastext|field|fieldtext|graytext|highlight|highlighttext|linktext|mark|marktext|selecteditem|selecteditemtext|visitedtext"
const CSS_NAMES =
  SYSTEM_COLORS +
  "|aliceblue|antiquewhite|aqua|aquamarine|azure|beige|bisque|black|blanchedalmond|blue|blueviolet|brown|burlywood|cadetblue|chartreuse|chocolate|coral|cornflowerblue|cornsilk|crimson|cyan|darkblue|darkcyan|darkgoldenrod|darkgray|darkgreen|darkgrey|darkkhaki|darkmagenta|darkolivegreen|darkorange|darkorchid|darkred|darksalmon|darkseagreen|darkslateblue|darkslategray|darkslategrey|darkturquoise|darkviolet|deeppink|deepskyblue|dimgray|dimgrey|dodgerblue|firebrick|floralwhite|forestgreen|fuchsia|gainsboro|ghostwhite|gold|goldenrod|gray|green|greenyellow|grey|honeydew|hotpink|indianred|indigo|ivory|khaki|lavender|lavenderblush|lawngreen|lemonchiffon|lightblue|lightcoral|lightcyan|lightgoldenrodyellow|lightgray|lightgreen|lightgrey|lightpink|lightsalmon|lightseagreen|lightskyblue|lightslategray|lightslategrey|lightsteelblue|lightyellow|lime|limegreen|linen|magenta|maroon|mediumaquamarine|mediumblue|mediumorchid|mediumpurple|mediumseagreen|mediumslateblue|mediumspringgreen|mediumturquoise|mediumvioletred|midnightblue|mintcream|mistyrose|moccasin|navajowhite|navy|oldlace|olive|olivedrab|orange|orangered|orchid|palegoldenrod|palegreen|paleturquoise|palevioletred|papayawhip|peachpuff|peru|pink|plum|powderblue|purple|rebeccapurple|red|rosybrown|royalblue|saddlebrown|salmon|sandybrown|seagreen|seashell|sienna|silver|skyblue|slateblue|slategray|slategrey|snow|springgreen|steelblue|tan|teal|thistle|tomato|turquoise|violet|wheat|white|whitesmoke|yellow|yellowgreen"
// A word of a value: `_` separates the words of an arbitrary Tailwind value
const CSS_NAME = new RegExp(`(?<![a-z0-9-])(?:${CSS_NAMES})(?![a-z0-9-])`, "gi")

// The functions that write a color; `color-mix` before `color`
const FUNCTIONS =
  "rgba?|hsla?|hwb|oklch|oklab|lab|lch|color-mix|color|device-cmyk"

// The name of a `var()` is a token, not a color (`--tag-red-bg`); its fallback
// is a value like any other (`var(--x, red)`). Blanked, so offsets stay
const blankVarNames = (value: string) =>
  value.replace(/var\(\s*--[\w-]+\s*,?/gi, (v) => " ".repeat(v.length))

// A value that holds a color: a hex, a color function, a palette variable or
// a named color. A `url()` is an image
function holdsColor(value: string): boolean {
  if (/^url\(/i.test(value)) return false
  const words = blankVarNames(value)
  return (
    /#[0-9a-f]{3,8}(?![\w-])/i.test(value) ||
    new RegExp(`(?<![\\w-])(?:${FUNCTIONS})\\(`, "i").test(value) ||
    new RegExp(`--color-${NAMED}`, "i").test(value) ||
    new RegExp(CSS_NAME.source, "i").test(words)
  )
}

// Any arbitrary value of a color utility, kept when it holds a color:
// `bg-[#e5e7eb]`, `bg-[red]`, `text-[rgb(55,65,81)]`, `bg-(--color-red-500)`,
// and the gradients of Tailwind 4 (`bg-linear-[red,blue]`, `bg-conic-45-[…]`);
// `ring-[3px]` and `bg-(--primary)` pass
const GRADIENT = "bg-(?:linear|radial|conic)(?:-[\\w-]+?)?"
const ARBITRARY_CLASS = new RegExp(
  `${START}((?:${GRADIENT}|${UTILITY})-(\\[[^\\]\\s]+\\]|\\([^)\\s]+\\))${OPACITY})(?![\\w-])`,
  "g"
)

// An arbitrary property with a color: `[color:red]`, `[background-color:#fff]`
const ARBITRARY_PROPERTY = new RegExp(
  `${START}(\\[[a-z-]+:([^\\]\\s]+)\\])`,
  "g"
)

// `bg-${color}-50`, `bg-[${color}]`, `bg-[#${hex}]` in a template literal: the
// color is picked at runtime
const COMPOSED_CLASS = new RegExp(`${START}(${UTILITY}-(?:\\[#?)?\\$\\{)`, "g")

// Every shadow class but `shadow-xs`, `-card`, `-pop`, `-sidebar-active` and
// `-none` of appendix A: Tailwind's sizes, a color (`shadow-primary`), an
// arbitrary value, and a token with an opacity (`shadow-xs/50` is another
// shadow). The inset, drop and text shadows are not tokens at all: any of them
// but `-none`. A `shadow:` is an object key (the config of tailwind-merge) and
// a `drop-shadow(` a function of `filter`, not a class
const TOKEN_SHADOWS = "(?:xs|card|pop|sidebar-active|none)(?![\\w-])"
const SHADOW_VALUE = "(?:\\[[^\\]\\s]*\\]|\\([^)\\s]*\\)|[\\w-]+)"
const SHADOW_CLASS = new RegExp(
  `${START}((?:inset|drop|text)-shadow(?:-(?!none(?![\\w-]))${SHADOW_VALUE})?${OPACITY}|shadow(?:-(?!${TOKEN_SHADOWS})${SHADOW_VALUE})?${OPACITY}|shadow-${TOKEN_SHADOWS}/(?:\\d+|\\[[^\\]\\s]*\\]|\\([^)\\s]*\\)))(?![\\w(-]|\\s*:)`,
  "g"
)

// A shadow written as a property, in a style object or in CSS, whose value is
// not `none` or a shadow of appendix A; and the `drop-shadow()` of a filter
const SHADOW_PROPERTY =
  /(?<![\w-])(?:box-shadow|text-shadow|boxShadow|textShadow)\s*:\s*["'`]?([^"'`;}\n]*[^"'`;}\n\s])/g
const TOKEN_SHADOW = /^(?:none|var\(--shadow-(?:xs|card|pop|sidebar-active)\))$/
const DROP_SHADOW_FUNCTION =
  /(?<![\w-])drop-shadow\((?:[^()\n]|\([^()\n]*\))*\)?/g

// `#3b82f6`, but not the `#` of `#main` or `#dead-section`, an entity
// (`&#123;`) or `url(#gradient)`
const HEX =
  /(?<![\w&])(?<!url\(["']?)#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})(?![\w-])/gi
const COLOR_FUNCTION = new RegExp(
  `(?<![\\w.$-])(?:${FUNCTIONS})\\([^)\\n]*\\)?`,
  "gi"
)
const PALETTE_VARIABLE = new RegExp(`var\\(--color-${NAMED}[^)\\s]*\\)?`, "g")

// A named color as the value of a property that paints: an attribute
// (`fill="white"`, `<CopyIcon color="white" />`), a key of a style object
// (`color: "red"`, `borderTop: "1px solid red"`, `"--x": "red"`) or a CSS
// declaration (`border-inline-start: 1px solid black`). A property paints
// when its name holds one of these words, in either case: `scrollbarColor`,
// `background-image`, `textDecoration`, `columnRule`, `WebkitBoxShadow`. A custom property may
// hold a color too
const PAINTS =
  "[\\w-]*(?:color|background|border|outline|fill|stroke|decoration|rule|emphasis|shadow)[\\w-]*|--[\\w-]+"
// In TS and TSX a value is an expression: only its string literals are
// colors (`ok ? "white" : "black"`), not its identifiers (`field.color`,
// `highlight ? …`). In CSS it is the text up to the `;`
const STRING = "\"[^\"\\n]*\"|'[^'\\n]*'|`[^`]*`"
const ATTRIBUTE = new RegExp(
  `(?<![\\w-])(${PAINTS})=(${STRING}|\\{(?:${STRING}|[^{}"'\`])*\\})`,
  "gi"
)
const DECLARATION = new RegExp(
  `(?<![\\w-])["']?(${PAINTS})["']?\\s*:\\s*((?:${STRING}|[^,;{}\\n"'\`])*)`,
  "gi"
)
const CSS_DECLARATION = new RegExp(
  `(?<![\\w-])(${PAINTS})\\s*:\\s*([^;{}\\n]*)`,
  "gi"
)
const LITERAL = new RegExp(`(?:${STRING})`, "g")
// The `color` prop of these components takes a tone of the chart palette
// (`<ProgressCircle color="blue" />`), not a CSS color; so does every
// `colors`, the list of tones of the charts (`colors={["blue", "orange"]}`)
const TONE_COMPONENTS = new Set(["ProgressCircle"])
const isToneList = (name = "") => name.toLowerCase() === "colors"

// The file that defines the tokens: the declarations of its custom properties
// (`--primary: oklch(…)`) are the definitions; the rest counts as anywhere
const TOKENS_FILE = /(^|\/)styles\/globals\.css$/
const CUSTOM_PROPERTY = /--[\w-]+\s*:[^;{}]*/g

// Comments hold no color that reaches the screen; they are blanked, not cut,
// so the lines stay where they are. A `/*` or `//` counts only after a space or
// a bracket: `accept="image/*"` and `https://` are text
const TS_COMMENT =
  /(?<=^|[\s{(,;=])\/\*[\s\S]*?\*\/|(?<=^|[\s;,{}()])\/\/[^\n]*/g
const CSS_COMMENT = /\/\*[\s\S]*?\*\//g

function blankComments(source: string, path: string): string {
  const comment = path.endsWith(".css") ? CSS_COMMENT : TS_COMMENT
  return source.replace(comment, (text) => text.replace(/[^\n]/g, " "))
}

type Found = { start: number; end: number; text: string; kind: ViolationKind }

function find(
  code: string,
  pattern: RegExp,
  kind: ViolationKind,
  keep: (match: RegExpExecArray) => boolean = () => true
): Found[] {
  return [...code.matchAll(pattern)].filter(keep).map((match) => {
    // The group is the class without the variants; a literal has none
    const text = match[1] ?? match[0]
    const start = match.index + match[0].lastIndexOf(text)
    return { start, end: start + text.length, text, kind }
  })
}

/** The JSX element an attribute at `index` belongs to */
function elementAt(code: string, index: number): string {
  const open = code.lastIndexOf("<", index)
  return /^<([\w.]+)/.exec(code.slice(open))?.[1] ?? ""
}

/**
 * The named colors in the values that `pattern` captures as its group 2,
 * after the name of the property or attribute in group 1; in a CSS file the
 * whole value, elsewhere its string literals
 */
function findNamed(
  code: string,
  pattern: RegExp,
  css: boolean,
  keep: (match: RegExpExecArray) => boolean = () => true
): Found[] {
  return [...code.matchAll(pattern)].filter(keep).flatMap((match) => {
    const value = match[2] ?? ""
    const valueStart = match.index + match[0].length - value.length
    // Outside CSS, everything but the string literals is blanked
    const kept = css
      ? value
      : [...value.matchAll(LITERAL)].reduce(
          (text, literal) =>
            text.slice(0, literal.index) +
            literal[0] +
            text.slice(literal.index + literal[0].length),
          " ".repeat(value.length)
        )
    const words = blankVarNames(kept)
    return [...words.matchAll(CSS_NAME)].map((name) => ({
      start: valueStart + name.index,
      end: valueStart + name.index + name[0].length,
      text: name[0],
      kind: "literal" as const,
    }))
  })
}

/**
 * The colors outside the tokens in `source` (a TS, TSX or CSS file), in source
 * order: classes of the palette, arbitrary color classes, classes composed at
 * runtime, shadows outside appendix A, and color literals. `path` tells the
 * file that defines the tokens
 */
export function findColorViolations(source: string, path: string): Violation[] {
  const normalized = path.replaceAll("\\", "/")
  const uncommented = blankComments(source, path)
  const code = TOKENS_FILE.test(normalized)
    ? uncommented.replace(CUSTOM_PROPERTY, (text) => " ".repeat(text.length))
    : uncommented

  // Earlier ones win: a shadow with an `rgba()` inside is one violation
  const found: Found[] = []
  const take = (candidates: Found[]) => {
    for (const candidate of candidates) {
      const overlaps = found.some(
        (f) => candidate.start < f.end && candidate.end > f.start
      )
      if (!overlaps) found.push(candidate)
    }
  }
  take(find(code, SHADOW_CLASS, "shadow"))
  take(
    find(code, SHADOW_PROPERTY, "shadow", (m) => !TOKEN_SHADOW.test(m[1] ?? ""))
  )
  take(find(code, DROP_SHADOW_FUNCTION, "shadow"))
  take(
    find(code, ARBITRARY_PROPERTY, "arbitrary", (m) => holdsColor(m[2] ?? ""))
  )
  take(
    find(code, ARBITRARY_CLASS, "arbitrary", (m) =>
      holdsColor((m[2] ?? "").slice(1, -1).replace(/^color:/, ""))
    )
  )
  take(find(code, PALETTE_CLASS, "palette"))
  take(find(code, COMPOSED_CLASS, "composed"))
  take(find(code, HEX, "literal"))
  take(find(code, COLOR_FUNCTION, "literal"))
  take(find(code, PALETTE_VARIABLE, "literal"))
  const css = normalized.endsWith(".css")
  if (!css) {
    take(
      findNamed(
        code,
        ATTRIBUTE,
        false,
        (m) =>
          !isToneList(m[1]) &&
          (m[1]?.toLowerCase() !== "color" ||
            !TONE_COMPONENTS.has(elementAt(code, m.index)))
      )
    )
  }
  take(
    findNamed(code, css ? CSS_DECLARATION : DECLARATION, css, (m) =>
      css ? true : !isToneList(m[1])
    )
  )

  found.sort((a, b) => a.start - b.start)

  const violations: Violation[] = []
  let line = 1
  let cursor = 0
  for (const f of found) {
    for (; cursor < f.start; cursor++) {
      if (source[cursor] === "\n") line++
    }
    violations.push({ line, text: f.text, kind: f.kind })
  }
  return violations
}
