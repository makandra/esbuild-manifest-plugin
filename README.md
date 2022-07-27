# esbuild-manifest-plugin

Plugin for esbuild to generate a manifest file for all digested files.

That manifest can be used by applications to resolve output filenames (which may include content hashes or be nested into directories) from their input filenames.

If you are using the `esbuild-sass-plugin` to have esbuild also compile Sass files, they will be included in the manifest.


## Installation

```bash
npm install -D esbuild-manifest-plugin
```

Or add to your project's `package.json`.


## Usage

Simply `require` and add the plugin to the `plugins` section of the esbuild config.

Example:

```js
const esbuild = require('esbuild')
const manifestPlugin = require('esbuild-manifest-plugin')

esbuild.build({
  entryPoints: ['application.js'],
  entryNames: '[dir]/[name]-[hash].digested',
  assetNames: '[dir]/[name]-[hash].digested',
  bundle: true,
  outdir: path.join(__dirname, 'public/assets'),
  plugins: [manifestPlugin()]
})
```

That generates a `manifest.json` in the configured `outdir` which looks like this:

```json
{
  "application.js": "application-HP2LS2UH.digested.js",
  "application.css": "application-BWAZLURC.digested.css",
  "images/example.png": "images/example-5N2N2WJM.digested.png",
  "bootstrap-icons/bootstrap-icons.svg", "_.._/_.._/node_modules/bootstrap-icons/bootstrap-icons-UNS4ZK23.digested.svg"
}
```

Note that the plugin requires the `metafile` option to be enabled in esbuild for the plugin to work; it will automaticall do that for you.


## Options

The plugin may be called with the following options.

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


## Roadmap

1. Tests
2. Migrate to TypeScript
3. More configuration options, if applicable (like `serializeManifest`)
