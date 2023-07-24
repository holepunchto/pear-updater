const test = require('brittle')
const tmp = require('test-tmp')
const Updater = require('../')
const { createDrives, eventFlush } = require('./helpers')

test('basic full swap updates', async function (t) {
  const directory = await tmp(t)
  const [drive, clone] = await createDrives(t)

  let tick = 0

  const u = new Updater(clone, {
    directory,
    platform: 'universal',
    arch: 'universal'
  })

  await u.ready()

  t.is(u.checkout.length, 0, 'empty drive')
  t.is(u.swapNumber, 0, 'using swap 0')

  await updateBin(drive, u, tick++)

  t.is(u.checkout.length, drive.core.length, 'up to date')
  t.is(u.swapNumber, 1, 'using swap 1')

  await updateBin(drive, u, tick++)

  t.is(u.checkout.length, drive.core.length, 'up to date')
  t.is(u.swapNumber, 2, 'using swap 2')

  await updateBin(drive, u, tick++)

  t.is(u.checkout.length, drive.core.length, 'up to date')
  t.is(u.swapNumber, 3, 'using swap 3')

  await updateBin(drive, u, tick++)

  t.is(u.checkout.length, drive.core.length, 'up to date')
  t.is(u.swapNumber, 1, 'skipping swap 0 as its in use and using swap 1')
})

test('basic non-swap updates', async function (t) {
  const directory = await tmp(t)
  const [drive, clone] = await createDrives(t)

  let tick = 0

  const u = new Updater(clone, {
    directory,
    platform: 'universal',
    arch: 'universal'
  })

  await u.ready()

  t.is(u.checkout.length, 0, 'empty drive')
  t.is(u.swapNumber, 0, 'using swap 0')

  await updateNonBin(drive, u, tick++)

  t.is(u.checkout.length, drive.core.length, 'up to date')
  t.is(u.swapNumber, 0, 'still using swap 0')

  await updateNonBin(drive, u, tick++)

  t.is(u.checkout.length, drive.core.length, 'up to date')
  t.is(u.swapNumber, 0, 'still using swap 0')
})

test('some non-swap, then swap, then non-swap updates', async function (t) {
  const directory = await tmp(t)
  const [drive, clone] = await createDrives(t)

  let tick = 0

  const u = new Updater(clone, {
    directory,
    platform: 'universal',
    arch: 'universal'
  })

  await u.ready()

  t.is(u.checkout.length, 0, 'empty drive')
  t.is(u.swapNumber, 0, 'using swap 0')

  await updateNonBin(drive, u, tick++)

  t.is(u.checkout.length, drive.core.length, 'up to date')
  t.is(u.swapNumber, 0, 'still using swap 0')

  await updateBin(drive, u, tick++)

  t.is(u.checkout.length, drive.core.length, 'up to date')
  t.is(u.swapNumber, 1, 'using swap 1')

  await updateNonBin(drive, u, tick++)

  t.is(u.checkout.length, drive.core.length, 'up to date')
  t.is(u.swapNumber, 1, 'still using swap 1')
})

test('updating and update events are triggered', async function (t) {
  const directory = await tmp(t)
  const [drive, clone] = await createDrives(t)

  const u = new Updater(clone, {
    directory,
    platform: 'universal',
    arch: 'universal'
  })

  let updatingCalled = false
  u.on('updating', () => {
    if (!u.updating) t.fail('Should be updating when updating-event emitted')
    updatingCalled = true
  })

  let updateCalled = false
  u.on('update', () => {
    if (!updatingCalled) t.fail('Should call update after updating')
    updateCalled = true
  })

  await updateBin(drive, u, 0)

  t.ok(updateCalled, 'update called')
})

test('updating and update callbacks are called', async function (t) {
  t.plan(1)

  const directory = await tmp(t)
  const [drive, clone] = await createDrives(t)

  let updatingCalled = false
  const u = new Updater(clone, {
    directory,
    platform: 'universal',
    arch: 'universal',
    onupdating: () => {
      // TODO: decide whether updating should be true while
      // running this callback (currently false, as this is
      // the first async call)
      updatingCalled = true
    },
    onupdate: async () => {
      // Can be called multiple times, we just test
      // that it is called at least once
      if (!u.closing) t.ok(updatingCalled, 'onupdate called, after onupdating')
      await u.close()
    }
  })

  await u.ready()

  await updateBin(drive, u, 0)
})

test('updating flag', async function (t) {
  const directory = await tmp(t)
  const [drive, clone] = await createDrives(t)

  let tick = 0

  const u = new Updater(clone, {
    directory,
    platform: 'universal',
    arch: 'universal'
  })

  await u.ready()
  t.absent(u.updated, 'Not yet updated at start')
  await updateBin(drive, u, tick++)
  t.ok(u.updated, 'Updated now')

  await updateBin(drive, u, tick++)
  t.ok(u.updated, 'Stays updated')
})

async function updateBin (drive, u, tick) {
  await drive.put('/by-arch/universal-universal/bin/file', '' + (tick))
  await eventFlush()
  await u.update()
}

async function updateNonBin (drive, u, tick) {
  await drive.put('/some-file', '' + (tick))
  await eventFlush()
  await u.update()
}
