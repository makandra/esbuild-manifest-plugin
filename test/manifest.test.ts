import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as esbuild from 'esbuild'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import manifestPlugin, { type ManifestPluginOptions } from '../src/index.js'

const fixturesDir = join(__dirname, 'fixtures')

describe('manifestPlugin', () => {
  let outdir: string

  beforeEach(() => {
    outdir = mkdtempSync(join(tmpdir(), 'manifest-plugin-'))
  })

  afterEach(() => {
    rmSync(outdir, { recursive: true, force: true })
  })

  function readManifest(name = 'manifest.json'): Record<string, string> {
    return JSON.parse(readFileSync(join(outdir, name), 'utf8'))
  }

  it('writes manifest.json mapping application.js to its fingerprinted output', async () => {
    await esbuild.build({
      absWorkingDir: join(fixturesDir, 'simple'),
      entryPoints: ['application.js'],
      entryNames: '[name]-[hash]',
      bundle: true,
      outdir,
      plugins: [manifestPlugin()],
    })

    const manifest = readManifest()
    expect(manifest['application.js']).toMatch(/^application-[A-Z0-9]{8,}\.js$/)
    expect(existsSync(join(outdir, manifest['application.js']!))).toBe(true)
    expect(manifest).not.toHaveProperty(['application.css'])
  })

  it('maps both JS and CSS siblings of an entrypoint', async () => {
    await esbuild.build({
      absWorkingDir: join(fixturesDir, 'with-css'),
      entryPoints: ['application.js'],
      entryNames: '[name]-[hash]',
      bundle: true,
      outdir,
      plugins: [manifestPlugin()],
    })

    const manifest = readManifest()
    expect(manifest['application.js']).toMatch(/^application-[A-Z0-9]{8,}\.js$/)
    expect(manifest['application.css']).toMatch(/^application-[A-Z0-9]{8,}\.css$/)
  })

  it('maps entrypoints even when entryNames has no [hash] token', async () => {
    await esbuild.build({
      absWorkingDir: join(fixturesDir, 'simple'),
      entryPoints: ['application.js'],
      bundle: true,
      outdir,
      plugins: [manifestPlugin()],
    })

    const manifest = readManifest()
    expect(manifest['application.js']).toBe('application.js')
  })

  it('maps copied assets to their fingerprinted output', async () => {
    await esbuild.build({
      absWorkingDir: join(fixturesDir, 'with-copy'),
      entryPoints: ['application.js'],
      entryNames: '[name]-[hash]',
      assetNames: '[name]-[hash]',
      bundle: true,
      outdir,
      loader: { '.svg': 'copy' },
      plugins: [manifestPlugin()],
    })

    const manifest = readManifest()
    expect(manifest['logo.svg']).toMatch(/^logo-[A-Z0-9]{8,}\.svg$/)
    expect(existsSync(join(outdir, manifest['logo.svg']!))).toBe(true)
  })

  it('writes the manifest to the filename specified in options', async () => {
    await esbuild.build({
      absWorkingDir: join(fixturesDir, 'simple'),
      entryPoints: ['application.js'],
      bundle: true,
      outdir,
      plugins: [manifestPlugin({ filename: 'assets.json' })],
    })

    expect(existsSync(join(outdir, 'assets.json'))).toBe(true)
    expect(existsSync(join(outdir, 'manifest.json'))).toBe(false)
    const manifest = readManifest('assets.json')
    expect(manifest).toHaveProperty(['application.js'])
  })

  describe('support for different entryPoints option shapes', () => {
    function buildWithEntryPoints(entryPoints: NonNullable<esbuild.BuildOptions['entryPoints']>) {
      return esbuild.build({
        absWorkingDir: join(fixturesDir, 'simple'),
        entryPoints,
        bundle: true,
        outdir,
        plugins: [manifestPlugin()],
      })
    }

    it('handles string array', async () => {
      await buildWithEntryPoints(['application.js'])

      expect(readManifest()['application.js']).toBe('application.js')
    })

    it('handles object array ({ in, out })', async () => {
      await buildWithEntryPoints([{ in: 'application.js', out: 'bundle' }])

      expect(readManifest()['bundle.js']).toBe('bundle.js')
    })

    it('handles record ({ output: input })', async () => {
      await buildWithEntryPoints({ bundle: 'application.js' })

      expect(readManifest()['bundle.js']).toBe('bundle.js')
    })

    it('throws an error when entryPoints is not set', async () => {
      await expect(
        esbuild.build({
          absWorkingDir: join(fixturesDir, 'simple'),
          outdir,
          logLevel: 'silent',
          plugins: [manifestPlugin()],
        }),
      ).rejects.toThrow('manifestPlugin: entryPoints option is required')
    })
  })

  describe('nodeModulesPrefix option', () => {
    function buildWithNodeModules(pluginOptions: ManifestPluginOptions) {
      return esbuild.build({
        absWorkingDir: join(fixturesDir, 'with-node-modules'),
        entryPoints: ['application.js'],
        assetNames: '[name]-[hash]',
        bundle: true,
        outdir,
        loader: { '.svg': 'copy' },
        plugins: [manifestPlugin(pluginOptions)],
      })
    }

    it('strips the node_modules/ prefix by default', async () => {
      await buildWithNodeModules({})

      const manifest = readManifest()
      expect(Object.keys(manifest)).toContain('test-lib/icon.svg')
    })

    it('prepends a custom prefix when nodeModulesPrefix is a string', async () => {
      await buildWithNodeModules({ nodeModulesPrefix: '~' })

      const manifest = readManifest()
      expect(Object.keys(manifest)).toContain('~test-lib/icon.svg')
    })

    it('keeps the original path when nodeModulesPrefix is false', async () => {
      await buildWithNodeModules({ nodeModulesPrefix: false })

      const manifest = readManifest()
      expect(Object.keys(manifest)).toContain('node_modules/test-lib/icon.svg')
    })
  })

  it('throws when outdir is not set', async () => {
    await expect(
      esbuild.build({
        absWorkingDir: join(fixturesDir, 'simple'),
        entryPoints: ['application.js'],
        bundle: true,
        outfile: join(outdir, 'out.js'),
        logLevel: 'silent',
        plugins: [manifestPlugin()],
      }),
    ).rejects.toThrow('manifestPlugin: outdir option is required')
  })

  it('throws when absWorkingDir is not set', async () => {
    await expect(
      esbuild.build({
        entryPoints: [join(fixturesDir, 'simple', 'application.js')],
        bundle: true,
        outdir,
        logLevel: 'silent',
        plugins: [manifestPlugin()],
      }),
    ).rejects.toThrow('manifestPlugin: absWorkingDir option is required')
  })

  it('does not throw an error or write the manifest.json file when the build fails', async () => {
    await expect(
      esbuild.build({
        absWorkingDir: join(fixturesDir, 'broken'),
        entryPoints: ['application.js'],
        bundle: true,
        outdir,
        logLevel: 'silent',
        plugins: [manifestPlugin()],
      }),
    ).rejects.toThrow()

    expect(existsSync(join(outdir, 'manifest.json'))).toBe(false)
  })
})
