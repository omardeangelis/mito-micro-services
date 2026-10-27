#!/usr/bin/env node
// Guard for the Effect 3 -> 4 migration (spec brain/specs/crm/effect-4).
//
//   check-assertions.mjs assertions <base> <head> [--exceptions <file>]
//     Compares the assertion chains (`expect(...)...`, `assert(...)`,
//     `ctx.expect(...)`), the test and suite declarations with their modifiers,
//     `each` tables, options and titles, and the `ctx.skip()` calls of every
//     test file touched between two git refs. Reads the AST, not lines. It
//     does not replace reading the diff: a value moved into a constant, or an
//     assertion moved into a helper nobody calls, keeps the same chains.
//   check-assertions.mjs gen-wrappers <ref>
//     Lists the functions whose body is, or returns, a bare `Effect.gen(...)`.
//
// Runs git in the current directory.
import { execFileSync, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import ts from "typescript"

const git = (args, opts = {}) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 1 << 28, ...opts })

const SOURCE_EXT = /\.(?:[cm]?[jt]s|[jt]sx)$/

const isTestPath = (p) =>
  p.startsWith("src/test/") ||
  p.split("/").includes("_test") ||
  /\.test\.tsx?$/.test(p)

// The files vitest runs, and the project a name puts them in (vitest.config.ts).
const isRunnableTest = (p) => /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(p)
const projectOf = (p) =>
  /\.pg\.test\./.test(p) ? "pg" : /\.db\.test\./.test(p) ? "db" : "unit"

const parse = (path, text) =>
  ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  )

const isId = (n, name) => ts.isIdentifier(n) && n.text === name
const isMember = (n, obj, name) =>
  ts.isPropertyAccessExpression(n) &&
  isId(n.expression, obj) &&
  n.name.text === name

// ---------------------------------------------------------------- assertions

// `yield* Effect.promise(() => X)` -> `await X`
const isEffectPromiseYield = (n) =>
  ts.isYieldExpression(n) &&
  n.asteriskToken &&
  n.expression &&
  ts.isCallExpression(n.expression) &&
  isMember(n.expression.expression, "Effect", "promise") &&
  n.expression.arguments.length === 1 &&
  ts.isArrowFunction(n.expression.arguments[0]) &&
  n.expression.arguments[0].parameters.length === 0 &&
  !ts.isBlock(n.expression.arguments[0].body)

const printer = ts.createPrinter({ removeComments: true })

const SEP = "\u0001"
const CLOSERS = new Set([
  ts.SyntaxKind.CloseParenToken,
  ts.SyntaxKind.CloseBracketToken,
  ts.SyntaxKind.CloseBraceToken,
])
// A `/` after one of these is a division, otherwise it starts a regex.
const OPERAND_END = new Set([
  ts.SyntaxKind.Identifier,
  ts.SyntaxKind.NumericLiteral,
  ts.SyntaxKind.BigIntLiteral,
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateTail,
  ts.SyntaxKind.RegularExpressionLiteral,
  ts.SyntaxKind.ThisKeyword,
  ts.SyntaxKind.CloseParenToken,
  ts.SyntaxKind.CloseBracketToken,
  ts.SyntaxKind.CloseBraceToken,
])

// Tokens of the printed text: layout and a formatter's trailing comma do not
// count, a literal keeps its exact text.
const tokenKey = (printed) => {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    true,
    ts.LanguageVariant.Standard,
    printed
  )
  const tokens = []
  const braces = [] // true for a `${` of a template, false for a plain `{`
  let prev
  for (let k = scanner.scan(); k !== ts.SyntaxKind.EndOfFileToken;) {
    if (k === ts.SyntaxKind.TemplateHead) braces.push(true)
    else if (k === ts.SyntaxKind.OpenBraceToken) braces.push(false)
    else if (k === ts.SyntaxKind.CloseBraceToken) {
      if (braces.pop()) k = scanner.reScanTemplateToken(false)
      if (k === ts.SyntaxKind.TemplateMiddle) braces.push(true)
    } else if (
      (k === ts.SyntaxKind.SlashToken ||
        k === ts.SyntaxKind.SlashEqualsToken) &&
      !OPERAND_END.has(prev)
    ) {
      k = scanner.reScanSlashToken()
    }
    tokens.push({ kind: k, text: scanner.getTokenText() })
    prev = k
    k = scanner.scan()
  }
  return tokens
    .filter(
      (t, i) =>
        !(
          t.kind === ts.SyntaxKind.CommaToken &&
          CLOSERS.has(tokens[i + 1]?.kind)
        )
    )
    .map((t) => t.text)
    .join(SEP)
}

const normalize = (node, sf) => {
  const transformer = (ctx) => (root) => {
    const visit = (n) => {
      if (isEffectPromiseYield(n)) {
        const body = n.expression.arguments[0].body
        return ctx.factory.createAwaitExpression(ts.visitNode(body, visit))
      }
      return ts.visitEachChild(n, visit, ctx)
    }
    return ts.visitNode(root, visit)
  }
  const result = ts.transform(node, [transformer])
  const printed = printer.printNode(
    ts.EmitHint.Unspecified,
    result.transformed[0],
    sf
  )
  result.dispose()
  return tokenKey(printed)
}

const CALLED_OR_ACCESSED = new Set(["expect", "expectTypeOf"])

const chainStart = (id) => {
  const p = id.parent
  if (!p) return false
  if (ts.isPropertyAccessExpression(p) && p.name === id) return false
  const called = ts.isCallExpression(p) && p.expression === id
  const accessed = ts.isPropertyAccessExpression(p) && p.expression === id
  if (CALLED_OR_ACCESSED.has(id.text)) return called || accessed
  if (id.text === "assertType") return called
  if (id.text === "assert") return called || accessed
  return false
}

// `ctx.expect(...)`, the `expect` of the test context
const isContextExpect = (n) =>
  ts.isPropertyAccessExpression(n) &&
  n.name.text === "expect" &&
  ts.isIdentifier(n.expression) &&
  !!n.parent &&
  ts.isCallExpression(n.parent) &&
  n.parent.expression === n

const climb = (id) => {
  let node = id
  for (;;) {
    const p = node.parent
    if (
      p &&
      (ts.isPropertyAccessExpression(p) ||
        ts.isElementAccessExpression(p) ||
        ts.isCallExpression(p) ||
        ts.isNonNullExpression(p)) &&
      p.expression === node
    ) {
      node = p
    } else return node
  }
}

// Test and suite declarations: `it`, `test`, `describe`, `suite` and their
// modifiers. Only skip/only/todo and the like count, so `it` -> `it.effect`
// is free.
const TEST_ROOTS = {
  it: "test",
  test: "test",
  describe: "describe",
  suite: "describe",
}
// `layer(L)("name", (it) => ...)` of @effect/vitest is a suite: only when called
// twice, so a plain `layer(...)` call is not one.
const CURRIED_ROOTS = { layer: "describe" }
const MODIFIERS = new Set([
  "skip",
  "only",
  "todo",
  "fails",
  "skipIf",
  "runIf",
  "concurrent",
  "sequential",
])

// Modifiers whose arguments decide which tests run, or with which values.
const ARG_MODIFIERS = new Set(["skipIf", "runIf", "each", "for"])
// Test options that skip, focus or invert a test.
const OPTION_MODIFIERS = new Set(
  [...MODIFIERS].filter((m) => !ARG_MODIFIERS.has(m))
)

const markerChain = (call) => {
  const names = []
  const args = [] // [modifier, arguments] of skipIf/runIf/each/for
  let n = call.expression
  let curried = false
  for (;;) {
    if (ts.isPropertyAccessExpression(n)) names.unshift(n.name.text)
    else if (
      ts.isElementAccessExpression(n) &&
      ts.isStringLiteralLike(n.argumentExpression)
    ) {
      names.unshift(n.argumentExpression.text)
    } else if (ts.isCallExpression(n)) {
      curried = true
      const callee = n.expression
      const name = ts.isPropertyAccessExpression(callee)
        ? callee.name.text
        : null
      if (name && ARG_MODIFIERS.has(name)) args.unshift([name, n.arguments])
    } else if (!ts.isNonNullExpression(n)) break
    n = n.expression
  }
  if (!ts.isIdentifier(n)) return null
  if (Object.hasOwn(TEST_ROOTS, n.text))
    return { root: TEST_ROOTS[n.text], names, args }
  if (curried && Object.hasOwn(CURRIED_ROOTS, n.text)) {
    return { root: CURRIED_ROOTS[n.text], names, args }
  }
  return null
}

// The options object of `it(name, { skip: true }, fn)`: its skip/only/todo/...
// properties, whatever their value.
const optionsKey = (call, sf) =>
  call.arguments
    .filter(ts.isObjectLiteralExpression)
    .flatMap((o) => o.properties)
    .filter(
      (p) =>
        p.name &&
        (ts.isIdentifier(p.name) || ts.isStringLiteralLike(p.name)) &&
        OPTION_MODIFIERS.has(p.name.text)
    )
    .map((p) => normalize(p, sf))
    .sort()

// The initializers of the variables a file declares, by name: an `each` table
// or a skipIf condition passed by name is compared through its value.
const declarations = new WeakMap()
const declarationsOf = (sf) => {
  if (!declarations.has(sf)) {
    const byName = new Map()
    const walk = (n) => {
      if (
        ts.isVariableDeclaration(n) &&
        ts.isIdentifier(n.name) &&
        n.initializer
      ) {
        const list = byName.get(n.name.text) ?? []
        list.push(n.initializer)
        byName.set(n.name.text, list)
      }
      ts.forEachChild(n, walk)
    }
    walk(sf)
    declarations.set(sf, byName)
  }
  return declarations.get(sf)
}

const argKey = (a, sf) => {
  const key = normalize(a, sf)
  const inits = ts.isIdentifier(a) && declarationsOf(sf).get(a.text)
  return inits ? `${key}=${inits.map((i) => normalize(i, sf)).join("|")}` : key
}

const markerKey = (call, sf) => {
  const { root, names, args } = markerChain(call)
  const modifiers = [...new Set(names.filter((x) => MODIFIERS.has(x)))].sort()
  const parts = [`${root}:${modifiers.join(".")}`]
  for (const [name, list] of args) {
    parts.push(`${name}(${list.map((a) => argKey(a, sf)).join(",")})`)
  }
  const options = optionsKey(call, sf)
  if (options.length) parts.push(`options{${options.join(",")}}`)
  const [title] = call.arguments
  if (title && !ts.isFunctionLike(title))
    parts.push(`title=${normalize(title, sf)}`)
  return parts.join(SEP)
}

// `ctx.skip()` (or a destructured `skip()`) inside a test body: the names the
// test callbacks give to their context.
const contextSkips = (sf) => {
  const out = []
  const walk = (n, ctxNames) => {
    if (ts.isCallExpression(n) && markerChain(n)) {
      const names = new Set(ctxNames)
      for (const a of n.arguments) {
        if (!ts.isFunctionLike(a) || !a.parameters?.length) continue
        const first = a.parameters[0].name
        if (ts.isIdentifier(first)) names.add(`${first.text}.skip`)
        else if (ts.isObjectBindingPattern(first)) {
          for (const el of first.elements) {
            const prop = el.propertyName ?? el.name
            if (
              ts.isIdentifier(prop) &&
              prop.text === "skip" &&
              ts.isIdentifier(el.name)
            ) {
              names.add(el.name.text)
            }
          }
        }
      }
      ts.forEachChild(n, (c) => walk(c, names))
      return
    }
    if (ts.isCallExpression(n)) {
      const e = n.expression
      const name = ts.isIdentifier(e)
        ? e.text
        : ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression)
          ? `${e.expression.text}.${e.name.text}`
          : null
      if (name && ctxNames.has(name)) out.push(n)
    }
    ts.forEachChild(n, (c) => walk(c, ctxNames))
  }
  walk(sf, new Set())
  return out
}

const markersOf = (sf) => {
  const out = []
  const walk = (n) => {
    if (ts.isCallExpression(n) && markerChain(n)) {
      const p = n.parent
      const inner =
        p &&
        (ts.isPropertyAccessExpression(p) ||
          ts.isElementAccessExpression(p) ||
          ts.isCallExpression(p) ||
          ts.isNonNullExpression(p)) &&
        p.expression === n
      if (!inner) out.push(n)
    }
    ts.forEachChild(n, walk)
  }
  walk(sf)
  return out
}

// A `.resolves`/`.rejects` chain asserts only when awaited or returned: what
// settles it is part of the chain.
const settledBy = (chain) => {
  let async = false
  for (let n = chain; n; n = n.expression) {
    if (
      ts.isPropertyAccessExpression(n) &&
      ["resolves", "rejects"].includes(n.name.text)
    ) {
      async = true
      break
    }
    if (!(
      ts.isPropertyAccessExpression(n) ||
      ts.isCallExpression(n) ||
      ts.isElementAccessExpression(n) ||
      ts.isNonNullExpression(n)
    ))
      break
  }
  if (!async) return ""
  let child = chain
  while (child.parent && ts.isParenthesizedExpression(child.parent))
    child = child.parent
  const p = child.parent
  if (p && ts.isAwaitExpression(p)) return `await${SEP}`
  if (
    p &&
    (ts.isReturnStatement(p) || (ts.isArrowFunction(p) && p.body === child))
  ) {
    return `return${SEP}`
  }
  return `floating${SEP}`
}

const hashOf = (key) => createHash("sha1").update(key).digest("hex").slice(0, 8)

const chainsOf = (path, text) => {
  if (!text) return []
  const sf = parse(path, text)
  const found = []
  const walk = (n) => {
    if (ts.isIdentifier(n) && chainStart(n)) found.push(climb(n))
    else if (isContextExpect(n)) found.push(climb(n))
    ts.forEachChild(n, walk)
  }
  walk(sf)
  const outermost = found.filter(
    (c) =>
      !found.some(
        (o) =>
          o !== c &&
          o.getStart(sf) <= c.getStart(sf) &&
          c.getEnd() <= o.getEnd() &&
          (o.getStart(sf) < c.getStart(sf) || c.getEnd() < o.getEnd())
      )
  )
  const seen = new Set()
  const items = outermost
    .filter((c) => !seen.has(c) && seen.add(c))
    .map((c) => ({
      pos: c.getStart(sf),
      key: settledBy(c) + normalize(c, sf),
      text: c.getText(sf),
    }))
  for (const c of markersOf(sf)) {
    items.push({
      pos: c.getStart(sf),
      key: `marker${SEP}${markerKey(c, sf)}`,
      text: c.getText(sf).split("\n")[0],
    })
  }
  for (const c of contextSkips(sf)) {
    items.push({
      pos: c.getStart(sf),
      key: `context-skip${SEP}${normalize(c, sf)}`,
      text: c.getText(sf),
    })
  }
  return items
    .sort((a, b) => a.pos - b.pos)
    .map((i) => ({
      key: i.key,
      text: i.text,
      line: sf.getLineAndCharacterOfPosition(i.pos).line + 1,
    }))
}

const show = (ref, path) => {
  const r = spawnSync("git", ["show", `${ref}:${path}`], {
    encoding: "utf8",
    maxBuffer: 1 << 28,
  })
  return r.status === 0 ? r.stdout : ""
}

const changedFiles = (base, head) => {
  const out = git(["diff", "--name-status", "-M", "-z", base, head])
  const f = out.split("\0")
  const files = []
  for (let i = 0; i < f.length && f[i];) {
    const status = f[i][0]
    if (status === "R" || status === "C") {
      files.push({ status, oldPath: f[i + 1], newPath: f[i + 2] })
      i += 3
    } else {
      const p = f[i + 1]
      files.push({
        status,
        oldPath: status === "A" ? null : p,
        newPath: status === "D" ? null : p,
      })
      i += 2
    }
  }
  return files.filter(
    (x) =>
      [x.oldPath, x.newPath].some((p) => p && isTestPath(p)) &&
      [x.oldPath, x.newPath].some((p) => p && SOURCE_EXT.test(p))
  )
}

// One line per chain the change is allowed to add or remove, as the failure
// output prints it, followed by the reason:
//   <file>:<line>#<hash> <reason>        a chain added (line in head)
//   base:<file>:<line>#<hash> <reason>   a chain removed (line in base)
//   rename:<old path> <reason>           a test file that stops running, or
//                                        changes project, on purpose
// The hash is the chain's own, so a different chain on the same line is not
// covered. Each line covers one chain, and a line that covers nothing fails.
const readExceptions = (file) => {
  const entries = new Map() // token -> { used, raw }
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
    const token = line.split(/\s+/)[0]
    if (!/^(?:(?:base:)?.+:\d+#[0-9a-f]{8}|rename:.+)$/.test(token)) {
      console.error(`unreadable exceptions line: ${line}`)
      process.exit(2)
    }
    entries.set(token, { used: false, raw: line })
  }
  return entries
}

const indent = (text) => text.split("\n").join("\n      ")

const runAssertions = (base, head, exceptionsFile) => {
  const exc = exceptionsFile ? readExceptions(exceptionsFile) : new Map()
  const covered = (token) => {
    const e = exc.get(token)
    if (!e || e.used) return false
    e.used = true
    return true
  }
  const files = changedFiles(base, head)
  const failures = []
  let compared = 0

  for (const file of files) {
    const lines = []
    const { oldPath, newPath } = file
    // A test file renamed so that vitest no longer runs it, or runs it in
    // another project, loses or moves all its tests even with the same text.
    let runs = true
    if (oldPath && newPath && oldPath !== newPath && isRunnableTest(oldPath)) {
      const lost = !isRunnableTest(newPath)
      runs = !lost
      if (lost || projectOf(oldPath) !== projectOf(newPath)) {
        const what = lost
          ? "vitest no longer runs it"
          : `project ${projectOf(oldPath)} -> ${projectOf(newPath)}`
        if (!covered(`rename:${oldPath}`)) {
          lines.push(`! rename:${oldPath}  renamed to ${newPath}: ${what}`)
        }
      }
    }
    const before = oldPath ? show(base, oldPath) : ""
    const after = newPath && runs ? show(head, newPath) : ""
    if (before === after && !lines.length) continue
    const baseChains = chainsOf(oldPath ?? newPath, before)
    const headChains = chainsOf(newPath ?? oldPath, after)

    // Cancel equal keys pairwise (multiset), in order of appearance.
    const pool = new Map()
    for (const c of headChains) {
      if (!pool.has(c.key)) pool.set(c.key, [])
      pool.get(c.key).push(c)
    }
    const removed = []
    for (const c of baseChains) {
      const list = pool.get(c.key)
      if (list?.length) {
        list.shift()
        compared++
      } else removed.push(c)
    }
    const added = [...pool.values()].flat().sort((a, b) => a.line - b.line)

    for (const c of removed) {
      const token = `base:${oldPath}:${c.line}#${hashOf(c.key)}`
      if (!covered(token)) lines.push(`- ${token}  ${indent(c.text)}`)
    }
    for (const c of added) {
      const token = `${newPath}:${c.line}#${hashOf(c.key)}`
      if (!covered(token)) lines.push(`+ ${token}  ${indent(c.text)}`)
    }
    if (lines.length) failures.push(lines.join("\n"))
  }

  const unused = [...exc.values()].filter((e) => !e.used)
  for (const e of unused) console.log(`? exception covers nothing: ${e.raw}`)
  const used = exc.size - unused.length

  if (failures.length || unused.length) {
    if (failures.length) console.log(failures.join("\n"))
    console.log(
      `\ncheck-assertions: FAILED, assertions changed in ${failures.length} file(s), ${unused.length} unused exception(s)`
    )
    process.exit(1)
  }
  console.log(
    `check-assertions: ok, ${files.length} test file(s) checked, ${compared} chain(s) compared, ${used} exception(s) used`
  )
}

// -------------------------------------------------------------- gen-wrappers

const unwrap = (n) => {
  while (n && ts.isParenthesizedExpression(n)) n = n.expression
  return n
}

const isEffectGen = (n) => {
  n = unwrap(n)
  return (
    !!n && ts.isCallExpression(n) && isMember(n.expression, "Effect", "gen")
  )
}

const bodyIsGen = (fn) => {
  const body = fn.body
  if (!body) return false
  if (!ts.isBlock(body)) return isEffectGen(body)
  if (body.statements.length !== 1) return false
  const [s] = body.statements
  return ts.isReturnStatement(s) && isEffectGen(s.expression)
}

const nameOf = (fn) => {
  if (fn.name) return fn.name.getText()
  let p = fn.parent
  while (
    p &&
    (ts.isParenthesizedExpression(p) ||
      ts.isAsExpression(p) ||
      ts.isSatisfiesExpression(p))
  ) {
    p = p.parent
  }
  if (
    p &&
    (ts.isVariableDeclaration(p) ||
      ts.isPropertyAssignment(p) ||
      ts.isPropertyDeclaration(p)) &&
    p.name
  ) {
    return p.name.getText()
  }
  return "<anonymous>"
}

const readBlobs = (ref, paths) => {
  const input = paths.map((p) => `${ref}:${p}\n`).join("")
  const r = spawnSync("git", ["cat-file", "--batch"], {
    input,
    maxBuffer: 1 << 30,
  })
  if (r.status !== 0) throw new Error(`git cat-file failed: ${r.stderr}`)
  const buf = r.stdout
  const out = new Map()
  let pos = 0
  for (const p of paths) {
    const eol = buf.indexOf(10, pos)
    const header = buf.toString("utf8", pos, eol).split(" ")
    pos = eol + 1
    if (header[1] === "missing") continue
    const size = Number(header[2])
    out.set(p, buf.toString("utf8", pos, pos + size))
    pos += size + 1
  }
  return out
}

const runGenWrappers = (ref) => {
  const paths = git(["ls-tree", "-r", "--name-only", ref])
    .split("\n")
    .filter(
      (p) =>
        /^(?:packages|apps|src)\//.test(p) &&
        /\.tsx?$/.test(p) &&
        !p.endsWith(".d.ts") &&
        !p.split("/").includes("node_modules") &&
        !isTestPath(p)
    )
  const blobs = readBlobs(ref, paths)
  const rows = []
  for (const path of paths) {
    const text = blobs.get(path)
    if (!text || !text.includes("Effect.gen")) continue
    const sf = parse(path, text)
    const walk = (n) => {
      if (
        (ts.isFunctionDeclaration(n) ||
          ts.isFunctionExpression(n) ||
          ts.isArrowFunction(n) ||
          ts.isMethodDeclaration(n)) &&
        bodyIsGen(n)
      ) {
        const line = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1
        rows.push(`${path}:${line} ${nameOf(n)}`)
      }
      ts.forEachChild(n, walk)
    }
    walk(sf)
  }
  for (const r of rows) console.log(r)
  console.log(`total: ${rows.length}`)
}

// ---------------------------------------------------------------------- main

const usage = () => {
  console.error(
    "usage: check-assertions.mjs assertions <base> <head> [--exceptions <file>]\n" +
      "       check-assertions.mjs gen-wrappers <ref>"
  )
  process.exit(2)
}

const [mode, ...rest] = process.argv.slice(2)
if (mode === "assertions") {
  const args = []
  let exceptions
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--exceptions") exceptions = rest[++i]
    else args.push(rest[i])
  }
  if (args.length !== 2 || (rest.includes("--exceptions") && !exceptions)) {
    usage()
  }
  runAssertions(args[0], args[1], exceptions)
} else if (mode === "gen-wrappers" && rest.length === 1) {
  runGenWrappers(rest[0])
} else usage()
