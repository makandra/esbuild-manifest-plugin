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

  it.each(['ts', 'tsx', 'jsx', 'mjs', 'cjs', 'mts', 'cts'])(
    'maps a .%s entrypoint to the .js output key',
    async ext => {
      await esbuild.build({
        absWorkingDir: join(fixturesDir, 'entry-extensions'),
        entryPoints: [`application.${ext}`],
        entryNames: '[name]-[hash]',
        bundle: true,
        outdir,
        plugins: [manifestPlugin()],
      })

      const manifest = readManifest()
      expect(manifest['application.js']).toMatch(/^application-[A-Z0-9]{8,}\.js$/)
    },
  )

  it('maps a CSS entrypoint to the .css output key only', async () => {
    await esbuild.build({
      absWorkingDir: join(fixturesDir, 'with-css'),
      entryPoints: ['application.css'],
      entryNames: '[name]-[hash]',
      bundle: true,
      outdir,
      plugins: [manifestPlugin()],
    })

    const manifest = readManifest()
    expect(manifest['application.css']).toMatch(/^application-[A-Z0-9]{8,}\.css$/)
    expect(manifest).not.toHaveProperty(['application.js'])
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

  describe('entryNames option', () => {
    it('handles a static directory prefix in entryNames', async () => {
      await esbuild.build({
        absWorkingDir: join(fixturesDir, 'simple'),
        entryPoints: ['application.js'],
        entryNames: 'assets/[name]-[hash]',
        bundle: true,
        outdir,
        plugins: [manifestPlugin()],
      })

      const manifest = readManifest()
      expect(manifest['application.js']).toMatch(/^assets\/application-[A-Z0-9]{8,}\.js$/)
    })

    it('handles [dir] token in entryNames', async () => {
      await esbuild.build({
        absWorkingDir: fixturesDir,
        entryPoints: ['simple/application.js'],
        outbase: fixturesDir,
        entryNames: '[dir]/[name]-[hash]',
        bundle: true,
        outdir,
        plugins: [manifestPlugin()],
      })

      const manifest = readManifest()
      expect(manifest['simple/application.js']).toMatch(/^simple\/application-[A-Z0-9]{8,}\.js$/)
    })

    it('resolves [ext] to the effective JS/CSS out extension', async () => {
      await esbuild.build({
        absWorkingDir: join(fixturesDir, 'with-css'),
        entryPoints: ['application.js'],
        entryNames: 'entries/[ext]/[name]',
        bundle: true,
        outdir,
        plugins: [manifestPlugin()],
      })

      const manifest = readManifest()
      expect(manifest['application.js']).toBe('entries/js/application.js')
      expect(manifest['application.css']).toBe('entries/css/application.css')
    })

    it('defaults outbase like esbuild does when [dir] is used without an explicit outbase', async () => {
      // esbuild computes a default outbase (lowest common ancestor of entry points) when none
      // is given. Here that's the entry's own directory, so [dir] resolves to "".
      await esbuild.build({
        absWorkingDir: fixturesDir,
        entryPoints: ['simple/application.js'],
        entryNames: '[dir]/[name]-[hash]',
        bundle: true,
        outdir,
        plugins: [manifestPlugin()],
      })

      const manifest = readManifest()
      expect(manifest['application.js']).toMatch(/^application-[A-Z0-9]{8,}\.js$/)
    })
  })

  describe('outbase option', () => {
    it('strips the outbase prefix from manifest keys', async () => {
      await esbuild.build({
        absWorkingDir: fixturesDir,
        entryPoints: ['simple/application.js'],
        outbase: join(fixturesDir, 'simple'),
        entryNames: '[name]-[hash]',
        bundle: true,
        outdir,
        plugins: [manifestPlugin()],
      })

      const manifest = readManifest()
      expect(manifest['application.js']).toMatch(/^application-[A-Z0-9]{8,}\.js$/)
    })

    describe('with entry points in subdirectories', () => {
      function buildNested(options: esbuild.BuildOptions) {
        return esbuild.build({
          absWorkingDir: join(fixturesDir, 'nested'),
          entryNames: '[dir]/[name]-[hash]',
          bundle: true,
          outdir,
          plugins: [manifestPlugin()],
          ...options,
        })
      }

      describe('without explicit outbase (defaults to the lowest common ancestor directory)', () => {
        it('handles a single entry point in a directory', async () => {
          await buildNested({ entryPoints: ['path/application.js'] })

          const manifest = readManifest()
          expect(manifest['application.js']).toMatch(/^application-[A-Z0-9]{8,}\.js$/)
        })

        it('handles multiple entry points in the same directory', async () => {
          await buildNested({ entryPoints: ['shared/application.js', 'shared/other.js'] })

          const manifest = readManifest()
          expect(manifest['application.js']).toMatch(/^application-[A-Z0-9]{8,}\.js$/)
          expect(manifest['other.js']).toMatch(/^other-[A-Z0-9]{8,}\.js$/)
        })

        it('handles multiple entry points in different directories', async () => {
          await buildNested({ entryPoints: ['shared/a/application.js', 'shared/b/other.js'] })

          const manifest = readManifest()
          expect(manifest['a/application.js']).toMatch(/^a\/application-[A-Z0-9]{8,}\.js$/)
          expect(manifest['b/other.js']).toMatch(/^b\/other-[A-Z0-9]{8,}\.js$/)
        })

        it('handles multiple entry points in different directories when entryNames has no [dir] token', async () => {
          await buildNested({
            entryPoints: ['shared/a/application.js', 'shared/b/other.js'],
            entryNames: '[name]-[hash]',
          })

          const manifest = readManifest()
          expect(manifest['a/application.js']).toMatch(/^application-[A-Z0-9]{8,}\.js$/)
          expect(manifest['b/other.js']).toMatch(/^other-[A-Z0-9]{8,}\.js$/)
        })

        it('ignores entry points with an explicit out path when computing the common ancestor', async () => {
          await buildNested({
            entryPoints: [{ in: 'shared/a/application.js', out: 'bundle' }, 'shared/b/other.js'],
          })

          const manifest = readManifest()
          expect(manifest['bundle.js']).toMatch(/^bundle-[A-Z0-9]{8,}\.js$/)
          expect(manifest['other.js']).toMatch(/^other-[A-Z0-9]{8,}\.js$/)
        })
      })

      describe('with explicit outbase', () => {
        it('handles a single entry point in a directory', async () => {
          await buildNested({ entryPoints: ['path/application.js'], outbase: '.' })

          const manifest = readManifest()
          expect(manifest['path/application.js']).toMatch(/^path\/application-[A-Z0-9]{8,}\.js$/)
        })

        it('handles multiple entry points in the same directory', async () => {
          await buildNested({
            entryPoints: ['shared/application.js', 'shared/other.js'],
            outbase: '.',
          })

          const manifest = readManifest()
          expect(manifest['shared/application.js']).toMatch(
            /^shared\/application-[A-Z0-9]{8,}\.js$/,
          )
          expect(manifest['shared/other.js']).toMatch(/^shared\/other-[A-Z0-9]{8,}\.js$/)
        })

        it('handles multiple entry points in different directories', async () => {
          await buildNested({
            entryPoints: ['shared/a/application.js', 'shared/b/other.js'],
            outbase: '.',
          })

          const manifest = readManifest()
          expect(manifest['shared/a/application.js']).toMatch(
            /^shared\/a\/application-[A-Z0-9]{8,}\.js$/,
          )
          expect(manifest['shared/b/other.js']).toMatch(/^shared\/b\/other-[A-Z0-9]{8,}\.js$/)
        })

        it('handles an outbase between the working directory and the entry points', async () => {
          await buildNested({
            entryPoints: ['shared/a/application.js', 'shared/b/other.js'],
            outbase: 'shared',
          })

          const manifest = readManifest()
          expect(manifest['a/application.js']).toMatch(/^a\/application-[A-Z0-9]{8,}\.js$/)
          expect(manifest['b/other.js']).toMatch(/^b\/other-[A-Z0-9]{8,}\.js$/)
        })

        it('handles an absolute outbase', async () => {
          await buildNested({
            entryPoints: ['shared/a/application.js', 'shared/b/other.js'],
            outbase: join(fixturesDir, 'nested', 'shared'),
          })

          const manifest = readManifest()
          expect(manifest['a/application.js']).toMatch(/^a\/application-[A-Z0-9]{8,}\.js$/)
          expect(manifest['b/other.js']).toMatch(/^b\/other-[A-Z0-9]{8,}\.js$/)
        })
      })
    })
  })

  describe('outExtension option', () => {
    it('uses the mapped JS extension for manifest key and value', async () => {
      await esbuild.build({
        absWorkingDir: join(fixturesDir, 'simple'),
        entryPoints: ['application.js'],
        entryNames: '[name]-[hash]',
        outExtension: { '.js': '.mjs' },
        bundle: true,
        outdir,
        plugins: [manifestPlugin()],
      })

      const manifest = readManifest()
      expect(manifest['application.mjs']).toMatch(/^application-[A-Z0-9]{8,}\.mjs$/)
      expect(manifest).not.toHaveProperty('application.js')
    })

    it('uses the mapped CSS extension for manifest key and value', async () => {
      await esbuild.build({
        absWorkingDir: join(fixturesDir, 'with-css'),
        entryPoints: ['application.js'],
        entryNames: '[name]-[hash]',
        outExtension: { '.js': '.mjs', '.css': '.module.css' },
        bundle: true,
        outdir,
        plugins: [manifestPlugin()],
      })

      const manifest = readManifest()
      expect(manifest['application.mjs']).toMatch(/^application-[A-Z0-9]{8,}\.mjs$/)
      expect(manifest['application.module.css']).toMatch(/^application-[A-Z0-9]{8,}\.module\.css$/)
    })
  })

  describe('outfile option', () => {
    it('supports outfile as an alternative to outdir', async () => {
      await esbuild.build({
        absWorkingDir: join(fixturesDir, 'simple'),
        entryPoints: ['application.js'],
        bundle: true,
        outfile: join(outdir, 'out.js'),
        plugins: [manifestPlugin()],
      })

      const manifest = readManifest()
      expect(manifest['application.js']).toBe('out.js')
    })
  })

  it('throws when neither outdir nor outfile is set', async () => {
    await expect(
      esbuild.build({
        absWorkingDir: join(fixturesDir, 'simple'),
        entryPoints: ['application.js'],
        bundle: true,
        logLevel: 'silent',
        plugins: [manifestPlugin()],
      }),
    ).rejects.toThrow('manifestPlugin: outdir or outfile option is required')
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
