# esbuild-manifest-plugin Change Log

## Unreleased changes

*

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
