const path = require('path')
const fsp = require('fs/promises')
const ReadyResource = require('ready-resource')
const Bootdrive = require('@holepunchto/boot-drive')
const Localdrive = require('localdrive')
const { Readable } = require('streamx')
const safetyCatch = require('safety-catch')

class Watcher extends Readable {
  constructor (updater, opts) {
    super(opts)
    this.updater = updater
    this.updater._watchers.add(this)
  }

  _destroy (cb) {
    this.updater._watchers.delete(this)
    cb(null)
  }
}

module.exports = class PearUpdater extends ReadyResource {
  constructor (drive, {
    directory,
    swap = null,
    next = null,
    current = null,
    checkout = null,
    byArch = true,
    platform = process.platform,
    arch = process.arch,
    onupdating = noop,
    onupdate = noop
  } = {}) {
    if (!directory) throw new Error('directory must be set')

    super()

    this.drive = drive
    this.checkout = checkout
    this.onupdate = onupdate
    this.onupdating = onupdating

    this.directory = directory
    this.swap = swap

    this.swapNumber = 0
    this.swapCurrent = 0
    this.swapDirectory = null

    this.platform = platform
    this.arch = arch

    this.next = next || path.join(directory, 'next')
    this.current = current || path.join(directory, 'current')

    this.snapshot = null
    this._updating = null
    this.updated = false

    this._byArch = byArch ? '/by-arch/' + platform + '-' + arch : null
    this._watchers = new Set()
    this._bumpBound = this._bump.bind(this)

    this.drive.core.on('append', this._bumpBound)
    this.drive.core.on('truncate', this._bumpBound)

    this.ready().catch(safetyCatch)
  }

  get updating () {
    return !!this._updating
  }

  async wait ({ length, fork }, opts) {
    for await (const checkout of this.watch(opts)) {
      if (fork < checkout.fork || (fork === checkout.fork && length < checkout.length)) return checkout
    }

    return null
  }

  watch (opts) {
    return new Watcher(this, opts)
  }

  async update () {
    if (this.opened === false) await this.ready()
    if (this.closing) throw new Error('Updater closing')

    if (this._updating) await this._updating
    if (this._updating) return this._updating // debounce

    if (this.drive.core.length === this.checkout.length && this.drive.core.fork === this.checkout.fork) {
      return this.checkout
    }

    try {
      this._updating = this._update()
      await this._updating
      this.updated = true
    } finally {
      this._updating = null
    }

    return this.checkout
  }

  _bump () {
    this.update().catch(safetyCatch)
  }

  async _update () {
    const old = this.checkout
    const checkout = {
      key: this.drive.core.id,
      length: this.drive.core.length,
      fork: this.drive.core.fork
    }

    await this.onupdating(checkout, old)
    this.emit('updating', checkout, old)

    this.snapshot = this.drive.checkout(checkout.length)

    try {
      await this._updateToSnapshot()
    } finally {
      await this.snapshot.close()
      this.snapshot = null
    }

    this.checkout = checkout

    await this.onupdate(checkout, old)
    this.emit('update', checkout, old)

    for (const w of this._watchers) w.push(checkout)
  }

  async _updateToSnapshot (checkout) {
    const pkg = JSON.parse(((await this.snapshot.get('/package.json')) || '{}').toString())
    const main = pkg.main || '/index.js'

    const updateSwap = await this._updateByArch()
    if (updateSwap) await this._updateSwap()

    const boot = new Bootdrive(this.snapshot, {
      entrypoint: main,
      cwd: this.swap,
      platform: this.platform,
      arch: this.arch,
      sourceOverwrites: {
        '/checkout.js': Buffer.from('module.exports = ' + JSON.stringify(checkout))
      },
      additionalBuiltins: ['electron']
    })

    const entrypoints = pkg.pear?.entrypoints || pkg.pear?.stage?.entrypoints || []

    for (const entrypoint of entrypoints) {
      await boot.warmup(entrypoint)
    }

    const local = new Localdrive(this.swap, { atomic: true })
    const hasEntrypoint = !!(await this.snapshot.entry(boot.entrypoint))

    if (hasEntrypoint) {
      await boot.warmup()
      await local.put(boot.entrypoint, boot.stringify())
    } else {
      await local.del(boot.entrypoint)
    }

    await local.close()

    if (updateSwap) await this._updateLinks()
  }

  async _updateByArch () {
    if (this.snapshot.core.length < 1 || this._byArch === null) return false

    const blobs = await this.snapshot.getBlobs()
    const ranges = []
    const libs = []

    let needsFullUpdate = false

    for await (const { left, right } of this.snapshot.diff(this.checkout.length, this._byArch)) {
      const blob = left && left.value.blob

      if (blob) {
        ranges.push(blobs.core.download({ start: blob.blockOffset, length: blob.blockLength }))

        // Just a sanity check so we dont use too much mem (2048 is arbitrary).
        // We just fall back to a full new local mirror if its a really big update
        if (ranges.length >= 2048) {
          needsFullUpdate = true
          break
        }

        // Allow lib updates to be inplace if they are simply a new file addition
        if (needsFullUpdate === false && right === null && left.key.startsWith(this._byArch + '/lib')) {
          libs.push(left)
          continue
        }
      }

      needsFullUpdate = true
    }

    for (const r of ranges) await r.done()
    if (needsFullUpdate || libs.length === 0) return needsFullUpdate

    const local = new Localdrive(this.swap, { atomic: true })
    await this.snapshot.mirror(local, { entries: libs, prune: false }).done()
    await local.close()

    return false
  }

  async _updateSwap () {
    let swapNumber = (this.swapNumber + 1) & 3
    if (swapNumber === this.swapCurrent) swapNumber = (swapNumber + 1) & 3

    const swap = path.join(this.swapDirectory, swapNumber + '')

    const local = new Localdrive(swap)
    await this.snapshot.mirror(local, { prefix: this._byArch }).done()
    await local.close()

    this.swap = swap
    this.swapNumber = swapNumber
  }

  async _open () {
    await this.drive.ready()

    if (this.checkout === null) {
      this.checkout = {
        key: this.drive.core.id,
        length: this.drive.core.length,
        fork: this.drive.core.fork
      }
    }

    if (!this.swap) {
      this.swap = path.join(this.directory, 'by-dkey', this.drive.discoveryKey.toString('hex'), '0')
    }

    this.swapNumber = Number(path.basename(this.swap))
    this.swapCurrent = this.swapNumber
    this.swapDirectory = path.dirname(this.swap)

    // mostly for win but cleanup the links
    if (await exists(this.next)) {
      if (await exists(this.current)) await fsp.unlink(this.current)
      await fsp.rename(this.next, this.current)
    }

    // cleanup unused swaps...
    let target = null
    for (const name of await readdir(this.swapDirectory)) {
      const swap = path.join(this.swapDirectory, name)
      if (swap === this.swap) continue
      if (!target) target = await realpath(this.current)
      if (swap === target) continue
      await nuke(swap) // unused, nuke it
    }

    this._bump() // bg
  }

  async _close () {
    if (this.snapshot) await this.snapshot.close()

    this.drive.core.removeListener('append', this._bumpBound)
    this.drive.core.removeListener('truncate', this._bumpBound)

    for (const w of this._watchers) w.push(null)
    this._watchers.clear()
  }

  async _updateLinks () {
    await fsp.symlink(path.resolve(this.swap), this.next, 'junction')
    if (process.platform === 'win32' && await exists(this.current)) await fsp.unlink(this.current)
    await fsp.rename(this.next, this.current)
  }
}

async function nuke (path) {
  await fsp.rm(path, { recursive: true })
}

async function realpath (path) {
  try {
    return await fsp.realpath(path)
  } catch (err) {
    if (err.code === 'ENOENT') return path
    throw err
  }
}

async function readdir (path) {
  try {
    return await fsp.readdir(path)
  } catch (err) {
    if (err.code === 'ENOENT') return []
    throw err
  }
}

async function exists (path) {
  try {
    await fsp.lstat(path)
    return true
  } catch {
    return false
  }
}

function noop () {}
