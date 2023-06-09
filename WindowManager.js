const electron = require('electron')
const { BrowserWindow, ipcMain } = electron
const path = require('path')
const fs = require('fs')

class WindowManager {
  getById(windowId) {
    return BrowserWindow.fromId(windowId)
  }

  hide(windowId) {
    const win = this.getById(windowId)
    if (win) {
      win.hide()
      return true
    }
    return false
  }

  createWindow(options = {}, data = {}) {
    const preloadPath = path.join(__dirname, 'preload.js')

    let baseOptions = {
      width: 1200,
      height: 700,
      minWidth: 800,
      minHeight: 600,
      frame: false
    }

    // Open new window in center with offset
    const offset = 35 * (BrowserWindow.getAllWindows().length - 1)
    let bounds = electron.screen.getPrimaryDisplay().bounds
    baseOptions.x =
      Math.ceil(bounds.x + (bounds.width - baseOptions.width) / 2) + offset
    baseOptions.y =
      Math.ceil(bounds.y + (bounds.height - baseOptions.height) / 2) + offset

    if (options.title) {
      baseOptions.title = options.title
    }

    let popupOptions = {
      // parent: win, // The child window will always show on top of the top window.
      modal: true
    }

    if (!fs.existsSync(preloadPath)) {
      throw new Error(
        'for security reasons application cannot be started without preload script: does not exist'
      )
    }

    // don't make any changes here
    let enforcedOptions = {
      webPreferences: {
        // https://electronjs.org/docs/tutorial/security#3-enable-context-isolation-for-remote-content
        contextIsolation: false, // FIXME true,
        preload: preloadPath,
        // https://electronjs.org/docs/tutorial/security#2-disable-nodejs-integration-for-remote-content
        nodeIntegration: false,
        // https://electronjs.org/docs/tutorial/security#5-do-not-disable-websecurity
        webSecurity: true,
        // https://electronjs.org/docs/tutorial/security#7-do-not-set-allowrunninginsecurecontent-to-true
        allowRunningInsecureContent: false,
        // https://electronjs.org/docs/tutorial/security#8-do-not-enable-experimental-features
        experimentalFeatures: false,
        webviewTag: true, // needs to be set: defaults to nodeIntegration otherwise
        // https://electronjs.org/docs/tutorial/security#9-do-not-use-enableblinkfeatures
        enableBlinkFeatures: undefined // DO NOT USE
      }
    }

    // avoid potentially immutable or non-overwritable values on the passed options
    if (options && options.webPreferences) {
      delete options.webPreferences
      // TODO alert
    }

    let config = Object.assign(baseOptions, options)

    let isPopup = false
    if (isPopup) {
      config = Object.assign(config, popupOptions)
    }

    // must be last call to assign values to config - should overwrite existing values
    const windowConfig = Object.assign(config, enforcedOptions)

    const hasFrame = process.platform !== 'win32'
    windowConfig.frame = hasFrame

    let win = new BrowserWindow(windowConfig)
    win.hasFrame = hasFrame
    win.setMenuBarVisibility(false)

    let webContents = win.webContents

    // TODO https://github.com/electron/electron/blob/master/docs/api/web-contents.md#event-remote-require
    // TODO https://github.com/electron/electron/blob/master/docs/api/web-contents.md#event-remote-get-global
    webContents.on('crashed', () => {
      // TODO notify updater about bad app
      console.log('webpage crashed')
    })

    // https://github.com/electron/electron/issues/1594#issuecomment-105366717
    // if title is explicitly set don't let renderer overwrite it
    if (options.title) {
      win.on('page-title-updated', evt => {
        evt.preventDefault()
      })
    }

    // pass initial data to window
    /*
    win.data = JSON.stringify(data)

    win.update = changes => {
      win.webContents.send('__update', {
        ...changes
      })
    }
    */

    return win
  }
}

module.exports = new WindowManager()
