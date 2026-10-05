# esbuild-manifest-plugin Change Log

## Unreleased changes
* Support the esbuild [`outExtension`](https://esbuild.github.io/api/#out-extension) option: manifest keys and values use the configured JS/CSS extensions (e.g. `application.mjs`).
* Support the esbuild [`outbase`](https://esbuild.github.io/api/#outbase) option: manifest keys are entry paths relative to `outbase`. Without an explicit `outbase`, the lowest common ancestor directory of all entry points is used, like esbuild does.
* Support the esbuild [`entryNames`](https://esbuild.github.io/api/#entry-names) option with all its placeholders (`[dir]`, `[name]`, `[hash]`, `[ext]`), e.g. `assets/[dir]/[name]-[hash]`.
* Support the esbuild [`outfile`](https://esbuild.github.io/api/#outfile) option as an alternative to `outdir`. The manifest is written next to the output file.

## 2.0.0 (2026-05-11)

* Rewrite the plugin in TypeScript. The package now ships both ESM and CommonJS builds with type declarations; `ManifestPluginOptions` is exported for TypeScript consumers. **The public JavaScript API is unchanged**.
* Support all three esbuild `entryPoints` shapes:
  * String array: `['application.js']`
  * Object array: `[{ in: 'application.js', out: 'application' }]` (new)
  * Plain object: `{ application: 'application.js' }` (new)
* Throw an explicit error when required esbuild options `outdir`, `absWorkingDir`, or `entryPoints` are not configured, instead of implicitly failing.

## 1.0.0 (2026-04-21)

* Add a Jest based test suite
* Fix `nodeModulesPrefix: false` incorrectly prepending the string `"false"` to asset paths instead of keeping the original path

## 0.2.0 (2022-09-23)

* Include entrypoints without a `[hash]` in their output name (useful when not using content hashes in development)
* If builds fail because of an error, the plugin no longer produces an additional error because result.metafile is missing.

## 0.1.2 (2022-07-27)

* Fixes typo in documentation

## 0.1.1 (2022-07-27)

* More flexibility when matching entrypoints' digested filenames.

## 0.1.0 (2022-07-27)

* First public release
