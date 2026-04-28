import { execSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as esbuild from 'esbuild'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const fixturesDir = join(__dirname, 'fixtures')
const distDir = join(__dirname, '..', 'dist')

describe('dist output', () => {
  let outdir: string

  beforeAll(() => {
    execSync('pnpm run build', { stdio: 'inherit', cwd: join(__dirname, '..') })
  })

  beforeEach(() => {
    outdir = mkdtempSync(join(tmpdir(), 'manifest-plugin-dist-'))
  })

  afterEach(() => {
    rmSync(outdir, { recursive: true, force: true })
  })

  function readManifest(name = 'manifest.json'): Record<string, string> {
    return JSON.parse(readFileSync(join(outdir, name), 'utf8'))
  }

  it('ESM: exports a callable plugin factory that writes manifest.json', async () => {
    const { default: manifestPlugin } = await import(pathToFileURL(join(distDir, 'index.js')).href)

    await esbuild.build({
      absWorkingDir: join(fixturesDir, 'simple'),
      entryPoints: ['application.js'],
      entryNames: '[name]-[hash]',
      bundle: true,
      outdir,
      plugins: [manifestPlugin()],
    })

    expect(readManifest()['application.js']).toMatch(/^application-[A-Z0-9]{8,}\.js$/)
  })

  it('CJS: exports a callable plugin factory that writes manifest.json', async () => {
    const require = createRequire(__filename)
    const manifestPlugin = require(join(distDir, 'index.cjs'))

    await esbuild.build({
      absWorkingDir: join(fixturesDir, 'simple'),
      entryPoints: ['application.js'],
      entryNames: '[name]-[hash]',
      bundle: true,
      outdir,
      plugins: [manifestPlugin()],
    })

    expect(readManifest()['application.js']).toMatch(/^application-[A-Z0-9]{8,}\.js$/)
  })
})
