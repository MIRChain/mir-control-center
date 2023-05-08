/**
 *
 */
const { getShippedGridUiPath } = require('../utils/main/util')
const { AppManager } = require('@pavelkrolevets/app-manager')

const GRID_UI_CACHE = getShippedGridUiPath()

const updater = new AppManager({
  repository: 'https://github.com/MIRChain/mir-grid-ui',
  auto: false,
  cacheDir: GRID_UI_CACHE
})

;(async function() {
  await updater.clearCache()
  await updater.getLatest({
    download: true
  })
})()
