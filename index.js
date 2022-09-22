const fs = require('fs')
const path = require('path')

const defaultOptions = {
  filename: 'manifest.json',
  nodeModulesPrefix: '', // e.g. "~" turns ".../node_modules/example-lib/image.svg" into "~example-lib/image.svg"
}

function manifestPlugin(options = {}) {
  const { filename, nodeModulesPrefix } = { ...defaultOptions, ...options }

  return {
    name: 'manifestPlugin',
    setup(build) {
      const {
        entryPoints,
        outdir,
        absWorkingDir,
      } = build.initialOptions
      const manifestFilePath = path.join(outdir, filename)
      const relativeOutDir = path.relative(absWorkingDir, outdir)

      build.initialOptions.metafile = true

      function generateManifest(outputs) {
        return {
          ...getEntryPointsManifest(outputs),
          ...getAssetsManifest(outputs),
        }
      }

      function getEntryPointsManifest(outputs) {
        const manifest = {}
        const paths = Object.keys(outputs).map(outputPath => path.relative(relativeOutDir, outputPath))

        entryPoints.forEach((entrypoint) => {
          const name = entrypoint.replace(/\.js$/, '')
          const escapedName = name.replace(/[-\\^$*+?.()|[\]{}]/g, '\\$&')
          const hashRegex = '[A-Z0-9]{8,}'

          const jsRegExp = new RegExp(`^${escapedName}(-${hashRegex})?\\.js$`)
          const cssRegExp = new RegExp(`^${escapedName}(-${hashRegex})?\\.css$`)

          const jsPath = paths.find(path => jsRegExp.test(path))
          const cssPath = paths.find(path => cssRegExp.test(path))

          manifest[`${name}.js`] = jsPath
          manifest[`${name}.css`] = cssPath
        })

        return manifest
      }

      function getAssetsManifest(outputs) {
        const manifest = {}

        Object.entries(outputs).forEach(([buildPath, { entryPoint, inputs }]) => {
          const sourcePaths = Object.keys(inputs)

          if (!entryPoint && sourcePaths.length === 1) {
            const sourcePath = sourcePaths[0].replace(/^([^/]+\/)*?node_modules\//, nodeModulesPrefix)
            manifest[sourcePath] = path.relative(relativeOutDir, buildPath)
          }
        })

        return manifest
      }

      function serializeManifest(manifest) {
        return JSON.stringify(manifest, null, 2)
      }

      build.onEnd((result) => {
        if (result.metafile) {
          const manifest = generateManifest(result.metafile.outputs)
          const json = serializeManifest(manifest)

          fs.writeFileSync(manifestFilePath, json)
        }
      })
    },
  }
}

module.exports = manifestPlugin
