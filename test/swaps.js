const test = require('brittle')
const Updater = require('../')
const { createDrives, createTouch } = require('./helpers')
const tmp = require('test-tmp')
const path = require('path')
const { realpath } = require('fs').promises

test('by-arch changes causes swap and updates symlink', async function (t) {
  const directory = await tmp(t)
  const [drive, clone] = await createDrives(t)

  const u = new Updater(clone, {
    directory,
    host: 'universal-universal'
  })

  const touchAndUpdate = createTouch(drive, u)

  await touchAndUpdate('/by-arch/universal-universal/bin/file')

  t.is(await realpath(u.swap), await realpath(u.current))

  const prevSwap = u.swap

  await touchAndUpdate('/by-arch/universal-universal/bin/file')

  t.is(await realpath(u.swap), await realpath(u.current))
  t.not(prevSwap, u.swap)
})

test('by-arch changes are ignored if not relevant', async function (t) {
  const directory = await tmp(t)
  const [drive, clone] = await createDrives(t)

  const u = new Updater(clone, {
    directory,
    host: 'universal-universal'
  })

  const touchAndUpdate = createTouch(drive, u)

  await touchAndUpdate('/by-arch/universal-universal/bin/file')

  const prevSwap = u.swap

  await touchAndUpdate('/by-arch/another-another/bin/file')

  t.is(u.swap, prevSwap, 'no swap update as its a diff prefix')
})

test('by-arch lib updates are allowed without swap if new file', async function (t) {
  const directory = await tmp(t)
  const [drive, clone] = await createDrives(t)

  const u = new Updater(clone, {
    directory,
    host: 'universal-universal'
  })

  const touchAndUpdate = createTouch(drive, u)

  await touchAndUpdate('/by-arch/universal-universal/bin/file')

  let prevSwap = u.swap

  await touchAndUpdate('/by-arch/universal-universal/lib/file')

  t.is(u.swap, prevSwap, 'no update as its lib with new file')
  prevSwap = u.swap

  await touchAndUpdate('/by-arch/universal-universal/lib/file')

  t.not(u.swap, prevSwap, 'swap update as the lib file changed')
})

test('never nukes anything thats not a swap', async function (t) {
  const directory = await tmp(t)
  const [drive, clone] = await createDrives(t)

  const u = new Updater(clone, {
    directory,
    host: 'universal-universal'
  })

  {
    const touchAndUpdate = createTouch(drive, u)
    await touchAndUpdate('/by-arch/universal-universal/bin/file')
  }

  await u.close()

  const u2 = new Updater(clone, {
    directory,
    swap: path.join(directory, 'current'),
    platform: 'universal',
    arch: 'universal'
  })

  await u2.ready()

  await realpath(u2.current)

  t.pass('symlink -> current still exists')

  const u3 = new Updater(clone, {
    directory,
    swap: path.join(directory, 'by-dkey'),
    platform: 'universal',
    arch: 'universal'
  })

  await u3.ready()

  await realpath(u3.current)

  t.pass('wrong folder -> current still exists')
})
