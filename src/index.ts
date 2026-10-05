import { writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, posix, relative, resolve, sep } from 'node:path'
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
      const outputExtensions = ['.js', '.css'].map(ext => outExtension?.[ext] ?? ext)

      const manifestFilePath = join(effectiveOutdir, filename)
      const relativeOutDir = relative(absWorkingDir, effectiveOutdir)

      build.initialOptions.metafile = true

      function generateManifest(outputs: Outputs): Manifest {
        return {
          ...getEntryPointsManifest(outputs),
          ...getAssetsManifest(outputs),
        }
      }

      function outputPathRegExp(entry: EntryName, ext: string): RegExp {
        if (outfile) {
          // With outfile the output filename is fixed, regardless of entryNames.
          return new RegExp(
            `^${escapeRegExp(basename(outfile, extname(outfile)))}${escapeRegExp(ext)}$`,
          )
        }
        return entryOutputRegExp(entryNames, entry, ext)
      }

      function getEntryPointsManifest(outputs: Outputs): Manifest {
        const manifest: Manifest = {}
        const paths = Object.keys(outputs).map(outputPath => relative(relativeOutDir, outputPath))

        for (const entry of entryOutputNames) {
          const key = posix.join(entry.dir, entry.name)

          // A JS entry point may produce a sibling CSS file (and a CSS entry point no JS file).
          // Missing outputs end up as `undefined` and are dropped when serializing the manifest.
          for (const ext of outputExtensions) {
            const regExp = outputPathRegExp(entry, ext)
            manifest[`${key}${ext}`] = paths.find(path => regExp.test(path))
          }
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

interface EntryName {
  /** Output directory relative to outbase, as used for esbuild's `[dir]` placeholder. */
  dir: string
  /** Output file stem, as used for esbuild's `[name]` placeholder. */
  name: string
}

// Normalises the three forms that esbuild accepts for `entryPoints` into a
// flat list of `[dir]`/`[name]` pairs so the rest of the plugin can iterate uniformly.
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
// For string entries, esbuild derives `[dir]` from the entry path relative to `outbase`.
// When `outbase` is not set, it defaults to the lowest common ancestor directory of all
// string entry points (entries with an explicit `out` are not taken into account).
// See https://esbuild.github.io/api/#outbase
function collectEntryNames(
  entryPoints: BuildOptions['entryPoints'],
  outbase: string | undefined,
  absWorkingDir: string,
): EntryName[] {
  if (entryPoints === undefined) {
    throw buildError('entryPoints option is required')
  }
  if (!Array.isArray(entryPoints)) {
    return Object.keys(entryPoints).map(splitOutPath)
  }

  const absEntries = entryPoints.flatMap(entry =>
    typeof entry === 'string' ? [resolve(absWorkingDir, entry)] : [],
  )
  const absOutbase =
    outbase !== undefined
      ? resolve(absWorkingDir, outbase)
      : lowestCommonAncestorDirectory(absEntries.map(entry => dirname(entry)))

  return entryPoints.map(entry => {
    if (typeof entry !== 'string') return splitOutPath(entry.out)

    const relativeEntry = relative(absOutbase, resolve(absWorkingDir, entry))
    return {
      dir: toPosixPath(dirname(relativeEntry)),
      name: basename(relativeEntry, extname(relativeEntry)),
    }
  })
}

// An explicit `out` path is split into `[dir]` and `[name]` as-is (no extension is stripped).
function splitOutPath(out: string): EntryName {
  const posixOut = toPosixPath(out)
  return { dir: posix.dirname(posixOut), name: posix.basename(posixOut) }
}

function lowestCommonAncestorDirectory(dirs: string[]): string {
  const [first, ...rest] = dirs.map(dir => dir.split(sep))
  if (first === undefined) return ''

  let length = first.length
  for (const segments of rest) {
    length = Math.min(length, segments.length)
    for (let i = 0; i < length; i++) {
      if (segments[i] !== first[i]) {
        length = i
        break
      }
    }
  }

  return first.slice(0, length).join(sep) || sep
}

// Builds a RegExp matching the output path esbuild generates for an entry point by
// substituting the placeholders of the `entryNames` pattern (default: `[dir]/[name]`).
// See https://esbuild.github.io/api/#entry-names
function entryOutputRegExp(
  entryNames: string | undefined,
  { dir, name }: EntryName,
  ext: string,
): RegExp {
  const path = (entryNames ?? '[dir]/[name]')
    .split('[dir]')
    .join(dir)
    .split('[name]')
    .join(name)
    .split('[ext]')
    .join(ext.replace(/^\./, ''))
  // esbuild drops empty segments, e.g. `[dir]/[name]` with an empty `[dir]` becomes `[name]`.
  const normalizedPath = posix.normalize(path).replace(/^(\.?\/)+/, '')
  const hashRegex = '[A-Z0-9]{8,}'
  const pattern = normalizedPath.split('[hash]').map(escapeRegExp).join(hashRegex)

  return new RegExp(`^${pattern}${escapeRegExp(ext)}$`)
}

function escapeRegExp(string: string): string {
  return string.replace(/[-\\^$*+?.()|[\]{}/]/g, '\\$&')
}

function toPosixPath(path: string): string {
  return path.split(sep).join(posix.sep)
}
