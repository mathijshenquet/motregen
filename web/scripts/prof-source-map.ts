import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, dirname, resolve, sep } from 'node:path'
import { originalPositionFor, sourceContentFor, TraceMap, type SourceMapInput } from '@jridgewell/trace-mapping'
import ts from 'typescript'

export interface ProfileCallFrame {
  functionName: string
  url: string
  lineNumber: number
  columnNumber: number
}

interface SourceFunction {
  start: number
  end: number
  name?: string
}

function sourceFunctions(file: ts.SourceFile): SourceFunction[] {
  const functions: SourceFunction[] = []
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)
      || ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
      const parent = node.parent
      let name = 'name' in node && node.name ? node.name.getText(file) : undefined
      let start = node.getStart(file)
      if (!name && (ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent))) {
        name = parent.name.getText(file)
        start = parent.name.getStart(file)
      }
      if (ts.isGetAccessorDeclaration(node)) name = `get ${name}`
      if (ts.isSetAccessorDeclaration(node)) name = `set ${name}`
      functions.push({ start, end: node.end, name })
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return functions.sort((left, right) => left.end - left.start - (right.end - right.start))
}

export function createSourceMapResolver(dist: string): (frame: ProfileCallFrame) => ProfileCallFrame {
  const root = resolve(dist)
  const maps = new Map<string, TraceMap>()
  const sources = new Map<string, { file: ts.SourceFile; functions: SourceFunction[] }>()
  const frames = new Map<string, ProfileCallFrame>()
  return (frame) => {
    if (!frame.url || frame.lineNumber < 0 || frame.columnNumber < 0) return frame
    const frameKey = JSON.stringify(frame)
    const cached = frames.get(frameKey)
    if (cached) return cached
    const pathname = decodeURIComponent(new URL(frame.url, 'http://trace.invalid').pathname)
    const filename = basename(pathname)
    let map = maps.get(pathname)
    if (!map) {
      const relativePath = pathname.replace(/^\/+/, '')
      const nested = resolve(root, relativePath)
      if (!nested.startsWith(`${root}${sep}`)) throw new Error(`bundelpad valt buiten --dist: ${pathname}`)
      const bundle = existsSync(nested) ? nested : resolve(root, filename)
      if (!existsSync(bundle) || !existsSync(`${bundle}.map`)) {
        const found = existsSync(dirname(nested)) ? readdirSync(dirname(nested)).filter((entry) => entry.endsWith('.js')).join(', ') : 'geen'
        throw new Error(`buildhash komt niet overeen of sourcemap ontbreekt: verwacht ${filename} + .map in ${root}; gevonden: ${found}`)
      }
      const data = JSON.parse(readFileSync(`${bundle}.map`, 'utf8')) as SourceMapInput & { file?: string }
      if (data.file !== filename) throw new Error(`sourcemap-buildhash komt niet overeen: trace ${filename}, map.file ${data.file ?? '(ontbreekt)'}`)
      const comment = readFileSync(bundle, 'utf8').match(/[#@] sourceMappingURL=([^\s]+)/)?.[1]
      if (comment !== `${filename}.map`) throw new Error(`bundel ${filename} verwijst naar een andere sourcemap: ${comment ?? '(ontbreekt)'}`)
      map = new TraceMap(data)
      maps.set(pathname, map)
    }
    // Chrome-callFrames zijn 0-based; originalPositionFor verwacht een 1-based regel.
    const original = originalPositionFor(map, { line: frame.lineNumber + 1, column: frame.columnNumber })
    if (original.source === null || original.line === null || original.column === null) {
      throw new Error(`geen sourcemap-positie voor ${filename}:${frame.lineNumber + 1}:${frame.columnNumber + 1}`)
    }
    const sourceKey = `${pathname}:${original.source}`
    let source = sources.get(sourceKey)
    if (!source) {
      const content = sourceContentFor(map, original.source)
      if (content !== null) {
        const file = ts.createSourceFile(original.source, content, ts.ScriptTarget.Latest, true)
        source = { file, functions: sourceFunctions(file) }
        sources.set(sourceKey, source)
      }
    }
    let functionName = original.name ?? frame.functionName
    if (source) {
      const lineStarts = source.file.getLineStarts()
      const lineStart = lineStarts[original.line - 1]
      const lineEnd = lineStarts[original.line] ?? source.file.text.length
      // Sommige dependency-maps wijzen voorbij hun sourcesContent (o.a. lucide-solid).
      if (lineStart !== undefined && lineStart + original.column <= lineEnd) {
        const offset = lineStart + original.column
        const enclosing = source.functions.find((candidate) => candidate.start <= offset && offset < candidate.end)
        // Een map-name kan een parameter zijn; benoem de functie uit sourcesContent.
        if (enclosing && frame.functionName !== '(anonymous)') functionName = enclosing.name ?? '(anonymous)'
      }
    }
    const resolved = {
      functionName,
      url: original.source.replace(/^(?:\.\.\/)+/, ''),
      lineNumber: original.line - 1,
      columnNumber: original.column,
    }
    frames.set(frameKey, resolved)
    return resolved
  }
}
