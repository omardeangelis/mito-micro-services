#!/usr/bin/env node
// Guard for the Effect 3 -> 4 migration (spec brain/specs/crm/effect-4).
//
//   check-assertions.mjs assertions <base> <head> [--exceptions <file>]
//     Compares the assertion chains (`expect(...)...`, `assert.x...`) of every
//     test file touched between two git refs. Reads the AST, not lines.
//   check-assertions.mjs gen-wrappers <ref>
//     Lists the functions whose body is, or returns, a bare `Effect.gen(...)`.
//
// Runs git in the current directory.
import { execFileSync, spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import ts from "typescript"

const git = (args, opts = {}) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 1 << 28, ...opts })

const SOURCE_EXT = /\.(?:[cm]?[jt]s|[jt]sx)$/

const isTestPath = (p) =>
  p.startsWith("src/test/") ||
  p.split("/").includes("_test") ||
  /\.test\.tsx?$/.test(p)

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
  for (let k = scanner.scan(); k !== ts.SyntaxKind.EndOfFileToken; ) {
    if (k === ts.SyntaxKind.TemplateHead) braces.push(true)
    else if (k === ts.SyntaxKind.OpenBraceToken) braces.push(false)
    else if (k === ts.SyntaxKind.CloseBraceToken) {
      if (braces.pop()) k = scanner.reScanTemplateToken(false)
      if (k === ts.SyntaxKind.TemplateMiddle) braces.push(true)
    } else if (
      (k === ts.SyntaxKind.SlashToken || k === ts.SyntaxKind.SlashEqualsToken) &&
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
        !(t.kind === ts.SyntaxKind.CommaToken && CLOSERS.has(tokens[i + 1]?.kind))
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
  if (id.text === "assert") return accessed
  return false
}

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
const TEST_ROOTS = { it: "test", test: "test", describe: "describe", suite: "describe" }
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

const markerChain = (call) => {
  const names = []
  let n = call.expression
  for (;;) {
    if (ts.isPropertyAccessExpression(n)) names.unshift(n.name.text)
    else if (
      ts.isElementAccessExpression(n) &&
      ts.isStringLiteralLike(n.argumentExpression)
    ) {
      names.unshift(n.argumentExpression.text)
    } else if (!(ts.isCallExpression(n) || ts.isNonNullExpression(n))) break
    n = n.expression
  }
  return ts.isIdentifier(n) && Object.hasOwn(TEST_ROOTS, n.text)
    ? { root: TEST_ROOTS[n.text], names }
    : null
}

const markerKey = (call) => {
  const { root, names } = markerChain(call)
  return `${root}:${[...new Set(names.filter((x) => MODIFIERS.has(x)))].sort().join(".")}`
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

const chainsOf = (path, text) => {
  if (!text) return []
  const sf = parse(path, text)
  const found = []
  const walk = (n) => {
    if (ts.isIdentifier(n) && chainStart(n)) found.push(climb(n))
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
      key: normalize(c, sf),
      text: c.getText(sf),
    }))
  for (const c of markersOf(sf)) {
    items.push({
      pos: c.getStart(sf),
      key: `marker${SEP}${markerKey(c)}`,
      text: c.getText(sf).split("\n")[0],
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
  for (let i = 0; i < f.length && f[i]; ) {
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

const readExceptions = (file) => {
  const added = new Map() // "path:line" -> { used, raw }
  const removed = new Map()
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
    const token = line.split(/\s+/)[0]
    const isBase = token.startsWith("base:")
    const loc = isBase ? token.slice(5) : token
    if (!/^.+:\d+$/.test(loc)) {
      console.warn(`warning: unreadable exceptions line: ${line}`)
      continue
    }
    ;(isBase ? removed : added).set(loc, { used: false, raw: line })
  }
  return { added, removed }
}

const indent = (text) => text.split("\n").join("\n      ")

const runAssertions = (base, head, exceptionsFile) => {
  const exc = exceptionsFile
    ? readExceptions(exceptionsFile)
    : { added: new Map(), removed: new Map() }
  const files = changedFiles(base, head)
  const failures = []
  let compared = 0
  let used = 0

  for (const file of files) {
    const before = file.oldPath ? show(base, file.oldPath) : ""
    const after = file.newPath ? show(head, file.newPath) : ""
    if (before === after) continue
    const baseChains = chainsOf(file.oldPath ?? file.newPath, before)
    const headChains = chainsOf(file.newPath ?? file.oldPath, after)

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

    const lines = []
    for (const c of removed) {
      const e = exc.removed.get(`${file.oldPath}:${c.line}`)
      if (e) {
        e.used = true
        used++
      } else lines.push(`- ${file.oldPath}@base:${c.line}  ${indent(c.text)}`)
    }
    for (const c of added) {
      const e = exc.added.get(`${file.newPath}:${c.line}`)
      if (e) {
        e.used = true
        used++
      } else lines.push(`+ ${file.newPath}@head:${c.line}  ${indent(c.text)}`)
    }
    if (lines.length) failures.push(lines.join("\n"))
  }

  for (const [kind, map] of [
    ["", exc.added],
    ["base:", exc.removed],
  ]) {
    for (const [loc, e] of map) {
      if (!e.used) {
        console.warn(`warning: exception matched nothing: ${kind}${loc}`)
      }
    }
  }

  if (failures.length) {
    console.log(failures.join("\n"))
    console.log(
      `\ncheck-assertions: FAILED, assertions changed in ${failures.length} file(s)`
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
  return !!n && ts.isCallExpression(n) && isMember(n.expression, "Effect", "gen")
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
