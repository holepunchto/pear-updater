const Hyperdrive = require('hyperdrive')
const Corestore = require('corestore')
const RAM = require('random-access-memory')

module.exports = {
  eventFlush,
  createDrives,
  createTouch
}

function eventFlush () {
  return new Promise(resolve => setImmediate(resolve))
}

async function createDrives (t) {
  const drive = new Hyperdrive(new Corestore(RAM.reusable()))
  await drive.ready()
  const clone = new Hyperdrive(new Corestore(RAM.reusable()), drive.core.key)

  const s1 = drive.corestore.replicate(true)
  const s2 = clone.corestore.replicate(false)

  s1.pipe(s2).pipe(s1)

  t.teardown(() => {
    return new Promise(resolve => {
      let missing = 2

      s1.on('error', noop)
      s1.on('close', done)

      s2.on('error', noop)
      s2.on('close', done)

      s1.destroy()
      s2.destroy()

      function done () {
        if (--missing === 0) return resolve()
      }
    })
  })

  return [drive, clone]
}

function noop () {}

function createTouch (drive, u) {
  let tick = 0

  return async function touchAndUpdate (key) {
    await drive.put(key, '' + (tick++))
    await eventFlush()
    await u.update()
  }
}
