const Hyperdrive = require('hyperdrive')
const Corestore = require('corestore')

module.exports = {
  createDrives,
  createTouch
}

async function createDrives(t) {
  const drive = new Hyperdrive(new Corestore(await t.tmp()))
  await drive.ready()
  const clone = new Hyperdrive(new Corestore(await t.tmp()), drive.core.key)

  const s1 = drive.corestore.replicate(true)
  const s2 = clone.corestore.replicate(false)

  s1.pipe(s2).pipe(s1)

  t.teardown(async () => {
    await drive.close()
    await clone.close()
  })

  return [drive, clone]
}

function createTouch(drive, u) {
  let tick = 0

  async function touchAndUpdate(key, src) {
    await drive.put(key, src || '' + tick++)
    while (drive.core.length !== u.drive.core.length) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    await u.update()
    await u.applyUpdate()
  }

  return touchAndUpdate
}
