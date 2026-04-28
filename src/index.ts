import { writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
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
      const { entryPoints, outdir, absWorkingDir } = build.initialOptions

      if (outdir === undefined) {
        throw buildError('outdir option is required')
      }
      if (absWorkingDir === undefined) {
        throw buildError('absWorkingDir option is required')
      }

      const entryNames = collectEntryNames(entryPoints)

      const manifestFilePath = join(outdir, filename)
      const relativeOutDir = relative(absWorkingDir, outdir)

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

        for (const entrypoint of entryNames) {
          const name = entrypoint.replace(/\.js$/, '')
          const escapedName = name.replace(/[-\\^$*+?.()|[\]{}]/g, '\\$&')
          const hashRegex = '[A-Z0-9]{8,}'

          const jsRegExp = new RegExp(`^${escapedName}(-${hashRegex})?\\.js$`)
          const cssRegExp = new RegExp(`^${escapedName}(-${hashRegex})?\\.css$`)

          const jsPath = paths.find(path => jsRegExp.test(path))
          const cssPath = paths.find(path => cssRegExp.test(path))

          manifest[`${name}.js`] = jsPath
          manifest[`${name}.css`] = cssPath
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

function collectEntryNames(entryPoints: BuildOptions['entryPoints']): string[] {
  if (entryPoints === undefined) {
    throw buildError('entryPoints option is required')
  }
  if (Array.isArray(entryPoints)) {
    return entryPoints.map(entry => (typeof entry === 'string' ? entry : entry.out))
  }
  return Object.keys(entryPoints)
}
