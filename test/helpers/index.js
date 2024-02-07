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

  t.teardown(async () => {
    await drive.close()
    await clone.close()
  })

  return [drive, clone]
}

function createTouch (drive, u) {
  let tick = 0

  return async function touchAndUpdate (key, src) {
    await drive.put(key, src || ('' + (tick++)))
    await eventFlush()
    await u.update()
    await u.applyUpdate()
  }
}
