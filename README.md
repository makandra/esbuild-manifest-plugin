# esbuild-manifest-plugin

Plugin for esbuild to generate a manifest file for all digested files.

That manifest can be used by applications to resolve output filenames (which may include content hashes or be nested into directories) from their input filenames.

If you are using the `esbuild-sass-plugin` to have esbuild also compile Sass files, they will be included in the manifest.

This library is written in TypeScript and shipped as both ESM and CommonJS with bundled type definitions.

## Installation

```bash
npm install -D esbuild-manifest-plugin
```

Or add to your project's `package.json`.

## Usage

Add the plugin to the `plugins` section of the esbuild config.

ESM:

```js
import path from 'path'
import esbuild from 'esbuild'
import manifestPlugin from 'esbuild-manifest-plugin'

await esbuild.build({
  entryPoints: ['application.js'],
  entryNames: '[dir]/[name]-[hash]',
  assetNames: '[dir]/[name]-[hash]',
  bundle: true,
  outdir: path.join(__dirname, 'public/assets'),
  absWorkingDir: path.join(__dirname, 'app/assets'),
  plugins: [manifestPlugin()],
})
```

CommonJS:

```js
const path = require('path')
const esbuild = require('esbuild')
const manifestPlugin = require('esbuild-manifest-plugin')

esbuild.build({
  entryPoints: ['application.js'],
  entryNames: '[dir]/[name]-[hash]',
  assetNames: '[dir]/[name]-[hash]',
  bundle: true,
  outdir: path.join(__dirname, 'public/assets'),
  absWorkingDir: path.join(__dirname, 'app/assets'),
  plugins: [manifestPlugin()],
})
```

That generates a `manifest.json` in the configured `outdir` which looks like this:

```json
{
  "application.js": "application-HP2LS2UH.js",
  "application.css": "application-BWAZLURC.css",
  "images/example.png": "images/example-5N2N2WJM.png",
  "bootstrap-icons/bootstrap-icons.svg": "_.._/_.._/node_modules/bootstrap-icons/bootstrap-icons-UNS4ZK23.svg"
}
```

Note that the plugin requires the `metafile` option to be enabled in esbuild for the plugin to work; it will automatically do that for you.

## Options

The plugin accepts the following `ManifestPluginOptions`:

### `filename`

Specifies the manifest filename.

Default: `"manifest.json"`

### `nodeModulesPrefix`

Any non-entrypoint assets with input paths from inside a project's `node_modules` directory are rewritten for convenience.
You may specify the path prefix to use, or `false` to disable that.

Examples for an input source `../node_modules/example-lib/image.png`:
| Value    | Output                                                          |
|----------|-----------------------------------------------------------------|
| `""`     | `"example-lib/image.png"`                                       |
| `"~"`    | `"~example-lib/image.png"`                                      |
| `false`  | `"../node_modules/example-lib/image.png"` (i.e. original value) |

Default: `""`


## Development

After checking out the repo, install dependencies with [pnpm](https://pnpm.io/):

```sh
pnpm install
```

Common scripts:

```sh
pnpm run lint       # Biome lint + format check
pnpm run format     # Biome auto-format
pnpm run typecheck  # tsc --noEmit
pnpm run build      # build.mjs — emits dist/index.{js,cjs,d.ts,d.cts}
pnpm test           # Vitest
```

## Running tests

The test suite runs real `esbuild.build` calls against the fixtures under `test/fixtures/` and asserts on the generated `manifest.json`.

Run the full suite:

```sh
pnpm test
```

GitHub Actions runs `lint`, `typecheck`, and `build` once, and `test` on a Node matrix (18, 20, 22, 24) on every push and pull request to `main`; see `.github/workflows/test.yml`.

## Release process

To release a new version:

1. Update the version in `package.json`.
2. Move the "Unreleased changes" entries in `CHANGELOG.md` under a new version heading with today's date.
3. Commit the changes and tag the commit (`git tag vX.Y.Z`).
4. Push the commit and the tag (`git push && git push --tags`).
5. Ensure you are logged into npm (`pnpm whoami || pnpm login`)
6. Publish to npm with `pnpm publish` (only the `dist/` directory is shipped).
