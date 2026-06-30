import { writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import type { BuildOptions, Metafile, Plugin } from 'esbuild'

type Outputs = Metafile['outputs']
type Manifest = Record<string, string | undefined>

export interface ManifestPluginOptions {
  /** Manifest filename written into `outdir`. Default: `"manifest.json"`. */
  filename?: string
  /**
   * Prefix applied to non-entrypoint assets whose input path lives inside a
   * `node_modules/` directory. Pass `false` to keep the original path.
   * Default: `""` (strips the `node_modules/` prefix).
   */
  nodeModulesPrefix?: string | false
}

const defaultOptions = {
  filename: 'manifest.json',
  nodeModulesPrefix: '' as string | false,
} satisfies Required<ManifestPluginOptions>

const name = 'manifestPlugin'

export default function manifestPlugin(options: ManifestPluginOptions = {}): Plugin {
  const { filename, nodeModulesPrefix } = { ...defaultOptions, ...options }

  return {
    name,
    setup(build) {
      const { entryPoints, outdir, outfile, absWorkingDir, outExtension, outbase, entryNames } =
        build.initialOptions

      if (outdir === undefined && outfile === undefined) {
        throw buildError('outdir or outfile option is required')
      }
      if (absWorkingDir === undefined) {
        throw buildError('absWorkingDir option is required')
      }

      const effectiveOutdir =
        outdir !== undefined ? outdir : resolve(absWorkingDir, dirname(outfile as string))

      const entryOutputNames = collectEntryNames(entryPoints, outbase, absWorkingDir)
      const dirPrefix = entryNamesDirPrefix(entryNames)

      const manifestFilePath = join(effectiveOutdir, filename)
      const relativeOutDir = relative(absWorkingDir, effectiveOutdir)

      build.initialOptions.metafile = true

      function generateManifest(outputs: Outputs): Manifest {
        return {
          ...getEntryPointsManifest(outputs),
          ...getAssetsManifest(outputs),
        }
      }

      function getEntryPointsManifest(outputs: Outputs): Manifest {
        const manifest: Manifest = {}
        const paths = Object.keys(outputs).map(outputPath => relative(relativeOutDir, outputPath))

        const jsExt = outExtension?.['.js'] ?? '.js'
        const cssExt = outExtension?.['.css'] ?? '.css'
        const escapedJsExt = jsExt.replace(/\./g, '\\.')
        const escapedCssExt = cssExt.replace(/\./g, '\\.')

        for (const entrypoint of entryOutputNames) {
          const name = entrypoint.replace(/\.js$/, '')

          let jsPath: string | undefined
          let cssPath: string | undefined

          if (outfile) {
            // With outfile the output filename is fixed — no need for regex matching.
            const stem = basename(outfile, extname(outfile))
            jsPath = paths.find(p => p === `${stem}${jsExt}`)
            cssPath = paths.find(p => p === `${stem}${cssExt}`)
          } else {
            const escapedName = name.replace(/[-\\^$*+?.()|[\]{}]/g, '\\$&')
            const hashRegex = '[A-Z0-9]{8,}'
            const jsRegExp = new RegExp(
              `^${dirPrefix}${escapedName}(-${hashRegex})?${escapedJsExt}$`,
            )
            const cssRegExp = new RegExp(
              `^${dirPrefix}${escapedName}(-${hashRegex})?${escapedCssExt}$`,
            )
            jsPath = paths.find(path => jsRegExp.test(path))
            cssPath = paths.find(path => cssRegExp.test(path))
          }

          manifest[`${name}${jsExt}`] = jsPath
          manifest[`${name}${cssExt}`] = cssPath
        }

        return manifest
      }

      function getAssetsManifest(outputs: Outputs): Manifest {
        const manifest: Manifest = {}

        for (const [buildPath, { entryPoint, inputs }] of Object.entries(outputs)) {
          const sourcePaths = Object.keys(inputs)

          if (!entryPoint && sourcePaths.length === 1) {
            const [rawPath] = sourcePaths as [string]
            const sourcePath =
              nodeModulesPrefix === false
                ? rawPath
                : rawPath.replace(/^([^/]+\/)*?node_modules\//, nodeModulesPrefix)
            manifest[sourcePath] = relative(relativeOutDir, buildPath)
          }
        }

        return manifest
      }

      function serializeManifest(manifest: Manifest): string {
        return JSON.stringify(manifest, null, 2)
      }

      build.onEnd(result => {
        if (result.metafile) {
          const manifest = generateManifest(result.metafile.outputs)
          const json = serializeManifest(manifest)

          writeFileSync(manifestFilePath, json)
        }
      })
    },
  }
}

function buildError(message: string): Error {
  return new Error(`${name}: ${message}`)
}

// Normalises the three forms that esbuild accepts for `entryPoints` into a
// flat list of output names so the rest of the plugin can iterate uniformly.
//
// Array example:
//   entryPoints: ['home.ts', 'settings.ts'],
//
// Array of objects example
//   entryPoints: [
//     { out: 'out1', in: 'home.ts'},
//     { out: 'out2', in: 'settings.ts'},
//   ],
//
// Plain object example
//   entryPoints: { bundle: 'application.ts' },
//
// See https://esbuild.github.io/api/#entry-points
// (and https://github.com/evanw/esbuild/blob/6a794dff68e6a43539f6da671e3080efdf11ca70/lib/shared/common.ts#L362 for the last undocumented variant)
//
// When `outbase` is set, esbuild strips the outbase prefix from string entry paths
// to compute the output name. We mirror that here so the manifest keys match.

// Extracts the static directory prefix from an entryNames pattern.
// For example, 'assets/[name]-[hash]' → 'assets/', 'assets/[dir]/[name]-[hash]' → 'assets/'.
// [dir] is implicitly handled: the entry path relative to outbase already contains the
// directory, which ends up in `name` and therefore in the regex.
function entryNamesDirPrefix(entryNames: string | undefined): string {
  if (!entryNames) return ''

  const nameTokenIndex = entryNames.indexOf('[name]')
  if (nameTokenIndex === -1) return ''

  const beforeName = entryNames.slice(0, nameTokenIndex)
  const lastSlash = beforeName.lastIndexOf('/')
  if (lastSlash === -1) return ''

  const dirPart = beforeName.slice(0, lastSlash + 1)
  const firstToken = dirPart.indexOf('[')
  return firstToken === -1 ? dirPart : dirPart.slice(0, firstToken)
}

function collectEntryNames(
  entryPoints: BuildOptions['entryPoints'],
  outbase: string | undefined,
  absWorkingDir: string,
): string[] {
  if (entryPoints === undefined) {
    throw buildError('entryPoints option is required')
  }
  if (Array.isArray(entryPoints)) {
    return entryPoints.map(entry => {
      if (typeof entry !== 'string') return entry.out
      if (!outbase) return entry

      const absEntry = resolve(absWorkingDir, entry)
      const absOutbase = resolve(absWorkingDir, outbase)
      return relative(absOutbase, absEntry)
    })
  }
  return Object.keys(entryPoints)
}
