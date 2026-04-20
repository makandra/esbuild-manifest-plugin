const fs = require('fs')
const os = require('os')
const path = require('path')
const esbuild = require('esbuild')
const manifestPlugin = require('../lib')

const fixturesDir = path.join(__dirname, 'fixtures')

describe('manifestPlugin', () => {
  let outdir

  beforeEach(() => {
    outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-plugin-'))
  })

  afterEach(() => {
    fs.rmSync(outdir, { recursive: true, force: true })
  })

  function readManifest() {
    return JSON.parse(fs.readFileSync(path.join(outdir, 'manifest.json'), 'utf8'))
  }

  it('writes manifest.json mapping application.js to its fingerprinted output', async () => {
    await esbuild.build({
      absWorkingDir: path.join(fixturesDir, 'simple'),
      entryPoints: ['application.js'],
      entryNames: '[name]-[hash]',
      bundle: true,
      outdir,
      plugins: [manifestPlugin()],
    })

    const manifest = readManifest()
    expect(manifest['application.js']).toMatch(/^application-[A-Z0-9]{8,}\.js$/)
    expect(fs.existsSync(path.join(outdir, manifest['application.js']))).toBe(true)
    expect(manifest).not.toHaveProperty(['application.css'])
  })

  it('maps both JS and CSS siblings of an entrypoint', async () => {
    await esbuild.build({
      absWorkingDir: path.join(fixturesDir, 'with-css'),
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
      absWorkingDir: path.join(fixturesDir, 'simple'),
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
      absWorkingDir: path.join(fixturesDir, 'with-copy'),
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
    expect(fs.existsSync(path.join(outdir, manifest['logo.svg']))).toBe(true)
  })

  it('writes the manifest to the filename specified in options', async () => {
    await esbuild.build({
      absWorkingDir: path.join(fixturesDir, 'simple'),
      entryPoints: ['application.js'],
      bundle: true,
      outdir,
      plugins: [manifestPlugin({ filename: 'assets.json' })],
    })

    expect(fs.existsSync(path.join(outdir, 'assets.json'))).toBe(true)
    expect(fs.existsSync(path.join(outdir, 'manifest.json'))).toBe(false)
    const manifest = JSON.parse(fs.readFileSync(path.join(outdir, 'assets.json'), 'utf8'))
    expect(manifest).toHaveProperty(['application.js'])
  })

  describe('nodeModulesPrefix option', () => {
    function buildWithNodeModules(pluginOptions) {
      return esbuild.build({
        absWorkingDir: path.join(fixturesDir, 'with-node-modules'),
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

  it('does not throw an error or write the manifest.json file when the build fails', async () => {
    await expect(esbuild.build({
      absWorkingDir: path.join(fixturesDir, 'broken'),
      entryPoints: ['application.js'],
      bundle: true,
      outdir,
      logLevel: 'silent',
      plugins: [manifestPlugin()],
    })).rejects.toThrow()

    expect(fs.existsSync(path.join(outdir, 'manifest.json'))).toBe(false)
  })
})
