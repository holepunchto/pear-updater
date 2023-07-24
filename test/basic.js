const test = require('brittle')
const Updater = require('../')
const { createDrives, eventFlush } = require('./helpers')
const tmp = require('test-tmp')
const path = require('path')

test('basic full swap updates', async function (t) {
  const directory = await tmp(t)
  const [drive, clone] = await createDrives(t)

  let tick = 0

  const u = new Updater(clone, {
    platform: 'universal',
    arch: 'universal',
    directory,
    swap: path.join(directory, 'swap', '0')
  })

  await u.ready()

  t.is(u.checkout.length, 0, 'empty drive')
  t.is(u.swapNumber, 0, 'using swap 0')

  await updateBin()

  t.is(u.checkout.length, drive.core.length, 'up to date')
  t.is(u.swapNumber, 1, 'using swap 1')

  await updateBin()

  t.is(u.checkout.length, drive.core.length, 'up to date')
  t.is(u.swapNumber, 2, 'using swap 2')

  await updateBin()

  t.is(u.checkout.length, drive.core.length, 'up to date')
  t.is(u.swapNumber, 3, 'using swpa 3')

  await updateBin()

  t.is(u.checkout.length, drive.core.length, 'up to date')
  t.is(u.swapNumber, 1, 'skipping swap 0 as its in use and using swap 1')

  async function updateBin () {
    await drive.put('/by-arch/universal-universal/bin/file', '' + (tick++))
    await eventFlush()
    await u.update()
  }
})
