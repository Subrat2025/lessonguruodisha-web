// Test-only ESM loader: maps '@/…' to the project root, treats project .js files as ESM,
// swaps lib/mongodb for an in-memory fake, optionally swaps lib/storage for a fake R2,
// and resolves bare packages from $TEST_DEPS (a folder with node_modules).
import { pathToFileURL, fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const HERE = path.dirname(fileURLToPath(import.meta.url))
const DEPS = process.env.TEST_DEPS ? pathToFileURL(path.join(process.env.TEST_DEPS, 'package.json')).href : null

function withExt(p) {
  for (const c of [p, p + '.js', p + '.mjs', path.join(p, 'index.js')]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c
  return p
}

export async function resolve(spec, ctx, next) {
  if (spec === '@/lib/mongodb') return { url: pathToFileURL(path.join(HERE, 'fake-mongo.mjs')).href, shortCircuit: true }
  if (spec === '@/lib/storage' && process.env.TEST_FAKE_R2 === '1') return { url: pathToFileURL(path.join(HERE, 'fake-storage.mjs')).href, shortCircuit: true }
  if (spec.startsWith('@/')) return { url: pathToFileURL(withExt(path.join(ROOT, spec.slice(2)))).href, shortCircuit: true }
  try { return await next(spec, ctx) } catch (e) {
    if (DEPS && !spec.startsWith('.') && !spec.startsWith('/') && !spec.startsWith('node:')) {
      // packages without an "exports" map (e.g. next@14's next/server) need the .js suffix under ESM
      try { return await next(spec, { ...ctx, parentURL: DEPS }) } catch (_) { return next(spec + '.js', { ...ctx, parentURL: DEPS }) }
    }
    throw e
  }
}

export async function load(url, ctx, next) {
  if (url.startsWith('file:') && url.endsWith('.js')) {
    const p = fileURLToPath(url)
    if (p.startsWith(ROOT) && !p.includes('node_modules')) {
      return { format: 'module', source: fs.readFileSync(p, 'utf8'), shortCircuit: true }
    }
  }
  return next(url, ctx)
}
