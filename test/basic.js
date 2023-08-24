const test = require('brittle')
const tmp = require('test-tmp')
const Updater = require('../')
const { createDrives, createTouch } = require('./helpers')

const BIN_PATH = '/by-arch/universal-universal/bin/file'
const NON_BIN_PATH = '/some-file'

test('basic full swap updates', async function (t) {
  const directory = await tmp(t)
  const [drive, clone] = await createDrives(t)

  const u = new Updater(clone, {
    directory,
    platform: 'universal',
    arch: 'universal'
  })

  const touchAndUpdate = createTouch(drive, u)
  await u.ready()

  t.is(u.checkout.length, 0, 'empty drive')
  t.is(u.swapNumber, 0, 'using swap 0')

  await touchAndUpdate(BIN_PATH)

  t.is(u.checkout.length, drive.core.length, 'up to date')
  t.is(u.swapNumber, 1, 'using swap 1')

  await touchAndUpdate(BIN_PATH)

  t.is(u.checkout.length, drive.core.length, 'up to date')
  t.is(u.swapNumber, 2, 'using swap 2')

  await touchAndUpdate(BIN_PATH)

  t.is(u.checkout.length, drive.core.length, 'up to date')
  t.is(u.swapNumber, 3, 'using swap 3')

  await touchAndUpdate(BIN_PATH)

  t.is(u.checkout.length, drive.core.length, 'up to date')
  t.is(u.swapNumber, 1, 'skipping swap 0 as its in use and using swap 1')
})

test('basic non-swap updates', async function (t) {
  const directory = await tmp(t)
  const [drive, clone] = await createDrives(t)

  const u = new Updater(clone, {
    directory,
    platform: 'universal',
    arch: 'universal'
  })

  await u.ready()
  const touchAndUpdate = createTouch(drive, u)

  t.is(u.checkout.length, 0, 'empty drive')
  t.is(u.swapNumber, 0, 'using swap 0')

  await touchAndUpdate(NON_BIN_PATH)

  t.is(u.checkout.length, drive.core.length, 'up to date')
  t.is(u.swapNumber, 0, 'still using swap 0')

  await touchAndUpdate(NON_BIN_PATH)

  t.is(u.checkout.length, drive.core.length, 'up to date')
  t.is(u.swapNumber, 0, 'still using swap 0')
})

test('some non-swap, then swap, then non-swap updates', async function (t) {
  const directory = await tmp(t)
  const [drive, clone] = await createDrives(t)

  const u = new Updater(clone, {
    directory,
    platform: 'universal',
    arch: 'universal'
  })

  await u.ready()
  const touchAndUpdate = createTouch(drive, u)

  t.is(u.checkout.length, 0, 'empty drive')
  t.is(u.swapNumber, 0, 'using swap 0')

  await touchAndUpdate(NON_BIN_PATH)

  t.is(u.checkout.length, drive.core.length, 'up to date')
  t.is(u.swapNumber, 0, 'still using swap 0')

  await touchAndUpdate(BIN_PATH)

  t.is(u.checkout.length, drive.core.length, 'up to date')
  t.is(u.swapNumber, 1, 'using swap 1')

  await touchAndUpdate(NON_BIN_PATH)

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
  const touchAndUpdate = createTouch(drive, u)

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

  await touchAndUpdate(BIN_PATH)

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
      if (!u.updating) t.fail('Should be updating when onupdating triggers')
      updatingCalled = true
    },
    onupdate: async () => {
      // Can be called multiple times, we just test
      // that it is called at least once
      if (!u.closing) t.ok(updatingCalled, 'onupdate called, after onupdating')
      await u.close()
    }
  })
  const touchAndUpdate = createTouch(drive, u)

  await touchAndUpdate(BIN_PATH)
})

test('updating flag', async function (t) {
  const directory = await tmp(t)
  const [drive, clone] = await createDrives(t)

  const u = new Updater(clone, {
    directory,
    platform: 'universal',
    arch: 'universal'
  })
  const touchAndUpdate = createTouch(drive, u)

  await u.ready()
  t.absent(u.updated, 'Not yet updated at start')

  await touchAndUpdate(BIN_PATH)
  t.ok(u.updated, 'Updated now')

  await touchAndUpdate(BIN_PATH)
  t.ok(u.updated, 'Stays updated')
})

test('update.wait()', async function (t) {
  const directory = await tmp(t)
  const [drive, clone] = await createDrives(t)
  t.plan(2)
  const u = new Updater(clone, {
    directory,
    platform: 'universal',
    arch: 'universal'
  })
  const touchAndUpdate = createTouch(drive, u)
  const waiting = u.wait({ length: 2, fork: 0 })
  touchAndUpdate(BIN_PATH)
  await t.execution(waiting)
  await t.exception(Promise.race([
    u.wait({ length: 3, fork: 0 }),
    new Promise((resolve, reject) => setTimeout(reject, 500, new Error('correctly waits')))
  ]), 'correctly waits')
})
