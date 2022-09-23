# esbuild-manifest-plugin Change Log

## Unreleased changes

## 0.2.0 (2022-09-23)

* Include entrypoints without a `[hash]` in their output name (useful when not using content hashes in development)
* If builds fail because of an error, the plugin no longer produces an additional error because result.metafile is missing.

## 0.1.2 (2022-07-27)

* Fixes typo in documentation

## 0.1.1 (2022-07-27)

* More flexibility when matching entrypoints' digested filenames.

## 0.1.0 (2022-07-27)

* First public release
