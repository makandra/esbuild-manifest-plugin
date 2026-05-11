# esbuild-manifest-plugin Change Log

## Unreleased changes
*

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
