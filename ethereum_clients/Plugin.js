const fs = require('fs')
const path = require('path')
const os = require('os')
const { EventEmitter } = require('events')
const { getBinaryUpdater, resolvePackagePath } = require('../utils/main/util')
const ControlledProcess = require('./ControlledProcess')
const { dialog } = require('electron')
const { getUserConfig } = require('../Config')

const UserConfig = getUserConfig()
let rpcId = 1

class Plugin extends EventEmitter {
  constructor(config, source, meta) {
    super()
    const { name, repository, filter, prefix } = config
    if (!name || !repository) {
      throw new Error(
        'plugin is missing required fields "name" or "repository"'
      )
    }
    this._meta = meta
    this._source = source
    this.updater = getBinaryUpdater(repository, name, filter, prefix)
    this.config = config
    this.errors = []
    this.process = undefined
    if (config.onInputRequested) {
      this.on('log', log => {
        try {
          config.onInputRequested(log, input => {
            this.process.stdin.write(`${input}\n`)
          })
        } catch (error) {
          console.log(
            `error: plugin ${this.name} could not provide input`,
            error
          )
        }
      })
    }
  }
  get cacheDir() {
    return this.updater.cacheDir
  }
  get name() {
    return this.config.name
  }
  get type() {
    return this.config.type
  }
  get order() {
    return this.config.order
  }
  get displayName() {
    return this.config.displayName
  }
  get settings() {
    return this.config.settings
  }
  get defaultConfig() {
    return this.config.config ? this.config.config.default : {}
  }
  get about() {
    return this.config.about
  }
  get dependencies() {
    return this.config.dependencies
  }
  get source() {
    return this._source
  }
  get metadata() {
    return this._meta
  }
  get state() {
    // FIXME ugly
    return this.process ? this.process.state : 'STOPPED'
  }
  get isRunning() {
    return (this.process && this.process.isRunning) || false
  }
  getLogs() {
    return this.process ? this.process.logs : []
  }
  getErrors() {
    return this.errors
  }
  dismissError(key) {
    this.errors = this.errors.filter(error => error.key !== key)
    if (this.errors.length === 0) {
      this.emit('clearPluginErrors')
    }
  }
  get resolveIpc() {
    return this.config.resolveIpc
  }
  get handleData() {
    return this.config.handleData
  }
  get api() {
    return this.config.api
  }
  registerEventListeners(sourceEmitter, destEmitter) {
    // FIXME memory leaks start here:
    // forward all events from the spawned process
    let eventTypes = [
      'newState',
      'error',
      'log',
      'notification',
      'pluginData',
      'pluginError',
      'setAppBadge',
      'setup-event',
      'clearPluginErrors',
      'ipcPath'
    ]
    eventTypes.forEach(eventName => {
      sourceEmitter.on(eventName, arg => {
        destEmitter.emit(eventName, arg)
        if (eventName !== 'log') {
          console.log(`forward external process event >> ${eventName}`, arg)
        }
        if (eventName == 'pluginError') {
          this.errors.push(arg)
        }
      })
    })
  }
  async getReleases() {
    const releases = await this.updater.getReleases()
    return releases
  }
  async getCachedReleases() {
    const releases = await this.updater.getCachedReleases()
    return releases
  }

  async getLatestCached() {
    return this.updater.getLatestCached()
  }
  async getLatestRemote() {
    return this.updater.getLatestRemote()
  }
  download(release, onProgress, onExtractionProgress) {
    if (this.config.unpack) {
      // plugin want package contents to be extracted
      return this.updater.download(release, {
        onProgress,
        extractPackage: true,
        onExtractionProgress
      })
    }
    return this.updater.download(release, { onProgress })
  }
  async getLocalBinary(release) {
    const extractBinary = async (pkg, binaryName) => {
      const entries = await this.updater.getEntries(pkg)
      let binaryEntry = undefined
      if (binaryName) {
        binaryEntry = entries.find(e => e.relativePath.endsWith(binaryName))
      } else {
        // try to detect binary
        console.log(
          'no "binaryName" specified - trying to auto-detect executable within package:'
        )
        // const isExecutable = mode => Boolean((mode & 0o0001) || (mode & 0o0010) || (mode & 0o0100))
        if (process.platform === 'win32') {
          binaryEntry = entries.find(e => e.relativePath.endsWith('.exe'))
        } else {
          // no heuristic available: pick first
          binaryEntry = entries[0]
        }
      }

      if (!binaryEntry) {
        throw new Error(
          'binary not found in package: try to specify binaryName'
        )
      } else {
        binaryName = binaryEntry.file.name
        console.log('auto-detected binary:', binaryName)
      }

      const destAbs = path.join(this.cacheDir, binaryName)
      // The unlinking might fail if the binary is e.g. being used by another instance
      if (fs.existsSync(destAbs)) {
        fs.unlinkSync(destAbs)
      }
      // IMPORTANT: if the binary already exists the mode cannot be set
      fs.writeFileSync(
        destAbs,
        await binaryEntry.file.readContent(),
        {
          mode: parseInt('754', 8) // strict mode prohibits octal numbers in some cases
        },
        err => {
          throw `Error while writing binary: ${err}`
        }
      )

      // cache the binary path
      this.binPath = destAbs

      return this.binPath
    }

    release = release || (await this.updater.getLatestCached())
    if (release) {
      // Binary in extracted form was found in e.g. standard location on the system
      if (release.isBinary) {
        return release.location
      } else {
        // Binary is packaged as .zip or.tar.gz -> extract first
        try {
          const binaryPath = await extractBinary(
            release,
            this.config.binaryName
          )
          return {
            binaryPath,
            packagePath: release.location
          }
        } catch (error) {
          console.log('error during binary extraction', error)
        }
      }
    }
    console.warn('no binary found for', release)
    return undefined
  }
  getSelectedRelease() {
    const { name } = this.config
    const selectedRelease = UserConfig.getItem('selectedRelease')
    return selectedRelease ? selectedRelease[name] : null
  }
  setSelectedRelease(release) {
    const { name } = this.config
    const selectedRelease = UserConfig.getItem('selectedRelease')
    const newSelectedRelease = { ...selectedRelease, [name]: release }
    UserConfig.setItem('selectedRelease', newSelectedRelease)
  }
  async requestStart(app, flags, release) {
    return new Promise((resolve, reject) => {
      // TODO move dialog code to different module
      dialog.showMessageBox(
        // currentWindow,
        {
          title: 'Start Requested',
          buttons: ['OK', 'Cancel'],
          message: `The application "${app.name}" requests to start "${
            this.displayName
          }" with flags: [${
            flags ? flags.join(' ') : ''
          }].\n\nPress 'OK' to allow this time.
        `
        },
        async response => {
          const userPermission = response !== 1 // = index of 'cancel'
          if (userPermission) {
            await this.start(flags, release)
          } else {
            console.log('User cancelled start dialog.')
          }
          resolve()
        }
      )
    })
  }
  async determineReleaseForStart() {
    // Check if selectedRelease exists in UserConfig
    let release = this.getSelectedRelease()
    if (release) {
      if (fs.existsSync(release.location)) {
        return release
      }
      // else configured release was deleted -> TODO reset config?
    }
    release = await this.updater.getLatestCached()
    if (release) {
      return release
    }
    // nothing found in cache:
    this.emit('setup-event', {
      type: 'fetch-release'
    })
    // Get release from cache or download latest
    let hasEmittedDownloading = false
    let hasEmittedExtracting = false
    release = await this.updater.getLatest({
      download: true,
      downloadOptions: {
        onProgress: downloadProgress => {
          if (!hasEmittedDownloading) {
            this.emit('newState', 'downloading')
            hasEmittedDownloading = true
          }
          this.emit('setup-event', {
            type: 'download-progress',
            downloadProgress
          })
        },
        extractPackage: true,
        onExtractionProgress: extractionProgress => {
          if (!hasEmittedExactring) {
            this.emit('newState', 'extracting')
            hasEmittedExtracting = true
          }
          this.emit('setup-event', {
            type: 'extraction-progress',
            extractionProgress
          })
        }
      }
    })
    this.emit('setup-event', {
      type: 'release-ready',
      release
    })
    return release
  }
  // releases that are extracted will most likely want to specify an entry point somewhere
  // within the extracted package folder. often these directories are nested and follow a schema
  // *package_name_without_package_extension*/*package_name_without_package_extension*/*package contents*/
  // for a package 'my_client-1.2.2.tar.gz' or 'my_client-1.2.2.zip' the structure of the extracted package folder could be e.g.
  // 'my_client-1.2.2/'my_client-1.2.2/client.js'
  // ideally we would support glob patterns here but for simplicity we will only support level 1 directory resolution
  // %PACKAGE_PATH% -> 'my_client-1.2.2/'
  // %PACKAGE_PATH/*% -> 'my_client-1.2.2/my_client-1.2.2/'
  // %PACKAGE_PATH/*%/bla.txt -> 'my_client-1.2.2/my_client-1.2.2/bla.txt'
  async resolvePathVariablesInFlags(flags, release) {
    let flags_modified = []
    for (let flag of flags) {
      flag = resolvePackagePath(flag, release)
      // turns all \\ in paths into /
      flag = flag.replace(/\\/g, '/')

      flags_modified.push(flag)
    }
    return flags_modified
  }
  async start(flags, release) {
    // console.log('start release', flags, release)
    if (!release) {
      release = await this.determineReleaseForStart()
      // console.log('determined release', release)
    }
    if (!release) {
      throw new Error('unable to start client - no release found')
    }
    // TODO do flag validation here based on proxy metadata
    const { beforeStart } = this.config
    if (beforeStart && beforeStart.execute) {
      const cmds = beforeStart.execute
      for (const cmd of cmds) {
        await this.execute(cmd)
      }
    }

    // binaryPath: the path to the binary Grid is about to start
    // for clients with only a single executable binary (most): Grid will extract the bin from package, binaryPath will point to it.
    // [ NOTE might be ambiguous name: geth or geth.exe which is why getLocalBinary also returns packagePath info ]
    // for clients running in a vm: binaryPath will point to the vm and the flags will specify the entry point to the extracted package
    let binaryPath = undefined
    if (
      this.dependencies &&
      this.dependencies.runtime &&
      this.dependencies.runtime.length > 0
    ) {
      // console.log('start vm client with flags', flags)
      flags = await this.resolvePathVariablesInFlags(flags, release)
      // IMPORTANT CONVENTION: vm-path must be first flag
      binaryPath = flags.shift()
    } else {
      const {
        binaryPath: binaryPathExtracted,
        packagePath
      } = await this.getLocalBinary(release)
      binaryPath = binaryPathExtracted
      console.log(
        `Plugin ${this.name} (${packagePath}) about to start. Binary: ${binaryPath}`
      )
    }

    try {
      this.process = new ControlledProcess(
        binaryPath,
        this.resolveIpc,
        this.handleData
      )
      this.registerEventListeners(this.process, this)
      await this.process.start(flags)
    } catch (error) {
      console.log(`Plugin Start Error: ${error}`)
      throw new Error(`Plugin Start Error: ${error}`)
    }

    return this.process
  }
  async stop() {
    const { beforeStop } = this.config
    if (beforeStop) {
      beforeStop()
    }
    this.errors = []
    this.emit('clearPluginErrors')
    return this.process && this.process.stop()
  }
  // public json rpc
  async rpc(method, params = [], id, result) {
    if (!this.process) {
      console.log('error: rpc not available - process not running', this.state)
      return // FIXME error handling
    }
    const payload = {
      jsonrpc: '2.0',
      id: id || rpcId++
    }
    if (result) {
      payload.result = result
    } else {
      payload.method = method
      payload.params = params
    }
    try {
      const result = await this.process.send(payload)
      return result
    } catch (error) {
      return error
    }
  }
  write(payload) {
    if (!this.process) {
      return
    }
    this.process.write(payload)
  }
  async execute(command) {
    const binary = await this.getLocalBinary()

    if (!binary) {
      console.log(
        'Execution error: binary not found. Bad package path or missing/ambiguous binaryName.'
      )
      // TODO: handle downloads when no binary exists.
      // Challenge: first version not always most appropriate to download.
      dialog.showMessageBox({
        message: 'Please download a release of the plugin first.'
      })
      return Promise.reject(
        new Error(
          'Execution error: binary not found. Please download a version first.'
        )
      )
    }

    return new Promise((resolve, reject) => {
      console.log('execute command:', command)
      const { spawn } = require('child_process')
      let flags = command
      if (typeof command === 'string') {
        flags = command.split(' ')
      }
      let proc = undefined
      try {
        proc = spawn(binary.binaryPath, flags)
      } catch (error) {
        // console.log('spawn error', error)
        reject(error)
      }
      const { stdout, stderr, stdin } = proc
      proc.on('error', error => {
        console.log('process error', error)
      })
      const procData = []
      const onData = data => {
        const log = data.toString()
        if (log) {
          let parts = log.split(/\r|\n/)
          parts = parts.filter(p => p !== '')
          //this.logs.push(...parts)
          parts.map(l => this.emit('log', l))
          procData.push(...parts)
          console.log('process data:', parts)
        }
      }
      stdout.on('data', onData)
      stderr.on('data', onData)
      proc.on('close', () => {
        resolve(procData)
      })
    })
  }
  async checkForUpdates() {
    let result = await this.updater.checkForUpdates()
    return result
  }
}

class PluginProxy extends EventEmitter {
  constructor(plugin) {
    super()
    this.plugin = plugin
    // FIXME if listeners are not removed properly this can introduce very nasty memory leaks and effects
    this.plugin.registerEventListeners(this.plugin, this)
  }
  get name() {
    return this.plugin.name
  }
  get type() {
    return this.plugin.type
  }
  get api() {
    return this.plugin.api
  }
  get order() {
    return this.plugin.order
  }
  get displayName() {
    return this.plugin.displayName
  }
  get state() {
    return this.plugin.state
  }
  get settings() {
    return this.plugin.settings
  }
  get config() {
    return this.plugin.defaultConfig
  }
  get source() {
    return this.plugin.source
  }
  get metadata() {
    return this.plugin.metadata
  }
  // FIXME make private
  get cacheDir() {
    return this.plugin.cacheDir
  }
  get about() {
    return this.plugin.about
  }
  get dependencies() {
    return this.plugin.dependencies
  }
  get isRunning() {
    return this.plugin.isRunning
  }
  get error() {
    return ''
  }
  getLogs() {
    return this.plugin.getLogs()
  }
  getErrors() {
    return this.plugin.getErrors()
  }
  dismissError(key) {
    return this.plugin.dismissError(key)
  }
  // FIXME doesn't handle corrupted packages well
  getReleases() {
    return this.plugin.getReleases()
  }
  getCachedReleases() {
    return this.plugin.getCachedReleases()
  }
  getLatestCached() {
    return this.plugin.getLatestCached()
  }
  getLatestRemote() {
    return this.plugin.getLatestRemote()
  }
  getSelectedRelease() {
    return this.plugin.getSelectedRelease()
  }
  setSelectedRelease(release) {
    return this.plugin.setSelectedRelease(release)
  }
  download(release, onProgress = () => {}, onExtractionProgress) {
    return this.plugin.download(release, onProgress, onExtractionProgress)
  }
  getLocalBinary(release) {
    return this.plugin.getLocalBinary(release)
  }
  requestStart(app, flags, release) {
    return this.plugin.requestStart(app, flags, release)
  }
  start(flags, release) {
    return this.plugin.start(flags, release)
  }
  stop() {
    console.log(`Plugin ${this.name} stopped`)
    return this.plugin.stop()
  }
  rpc(method, params = [], id, result) {
    return this.plugin.rpc(method, params, id, result)
  }
  write(payload) {
    return this.plugin.write(payload)
  }
  execute(command) {
    return this.plugin.execute(command)
  }
  checkForUpdates() {
    return this.plugin.checkForUpdates()
  }
}

module.exports = {
  Plugin,
  PluginProxy
}
