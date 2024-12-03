const test = require('brittle')
const tmp = require('test-tmp')
const nodeBundle = require('node-bare-bundle')
const Updater = require('../')
const fsp = require('fs').promises
const path = require('path')
const { createDrives, createTouch } = require('./helpers')

test('updates entrypoint on disk and writes /checkout.js', async function (t) {
  const directory = await tmp(t)
  const [drive, clone] = await createDrives(t)

  const u = new Updater(clone, {
    directory,
    host: 'universal-universal'
  })

  const touchAndUpdate = createTouch(drive, u)

  await touchAndUpdate('/by-arch/universal-universal/bin/file')
  // TODO: this is needed atm, but thats a scriptlinker bug (low prio, but we should fix)
  await touchAndUpdate('/checkout.js', 'module.exports = {}')
  await touchAndUpdate('/index.js', 'module.exports = require("./checkout.js")')

  const entrypoint = await fsp.readFile(path.join(u.swap, 'index.bundle'))
  const checkout = nodeBundle(entrypoint)

  t.is(checkout.length, drive.core.length)
  t.is(checkout.fork, drive.core.fork)
  t.is(checkout.key, drive.core.id)
})

test('file referenced in package.json main is put on disk', async function (t) {
  const directory = await tmp(t)
  const [drive, clone] = await createDrives(t)

  const u = new Updater(clone, {
    directory,
    host: 'universal-universal'
  })

  const touchAndUpdate = createTouch(drive, u)

  await touchAndUpdate('/checkout.js', '')
  await touchAndUpdate('/own-main.js', 'module.exports = require("./checkout.js")')
  await touchAndUpdate('/package.json', JSON.stringify({ main: 'own-main.js' }))

  const entrypoint = await fsp.readFile(path.join(u.swap, 'own-main.bundle'), 'utf-8')
  const checkout = nodeBundle(entrypoint)

  t.is(checkout.length, drive.core.length)
  t.is(checkout.fork, drive.core.fork)
  t.is(checkout.key, drive.core.id)
})

test('files referenced in pear.subsystems are present in the drive after update', async function (t) {
  const directory = await tmp(t)
  const [drive, clone] = await createDrives(t)

  const u = new Updater(clone, {
    directory,
    host: 'universal-universal'
  })

  const touchAndUpdate = createTouch(drive, u)

  await touchAndUpdate('/checkout.js', '')
  await touchAndUpdate('/own-main.js', '// own-main\nmodule.exports = require("./checkout.js")')
  await touchAndUpdate('/own-main2.js', '// second main\nmodule.exports = require("./checkout.js")')
  await touchAndUpdate('/something-irrelevant.js', '// not an entrypoint')

  await touchAndUpdate(
    '/package.json',
    JSON.stringify({ pear: { subsystems: ['own-main.js', 'own-main2.js'] } })
  )

  // Entrypoints are locally available
  const mainContent = (await clone.get('/own-main.js', { wait: false })).toString()
  t.is(mainContent, '// own-main\nmodule.exports = require("./checkout.js")')

  const main2Content = (await clone.get('/own-main2.js', { wait: false })).toString()
  t.is(main2Content, '// second main\nmodule.exports = require("./checkout.js")')

  // Other files are downloaded on-demand
  await t.exception(clone.get('/something-irrelevant.js', { wait: false }), /BLOCK_NOT_AVAILABLE/)
  const fromRemote = (await clone.get('/something-irrelevant.js')).toString()
  t.is(fromRemote, '// not an entrypoint', 'sanity check: available remotely')
})

test('all files are present if compat changes', async function (t) {
  const directory = await tmp(t)
  const [drive, clone] = await createDrives(t)

  const u = new Updater(clone, {
    directory,
    host: 'universal-universal'
  })

  const touchAndUpdate = createTouch(drive, u)

  await touchAndUpdate('/checkout.js', '')
  await touchAndUpdate('/own-main.js', '// own-main\nmodule.exports = require("./checkout.js")')
  await touchAndUpdate('/own-main2.js', '// second main\nmodule.exports = require("./checkout.js")')
  await touchAndUpdate('/something-irrelevant.js', '// not an entrypoint')

  await touchAndUpdate(
    '/package.json',
    JSON.stringify({ pear: { entrypoints: ['own-main.js', 'own-main2.js'], platform: { fullSync: 1 } } })
  )

  // Entrypoints are locally available
  const mainContent = (await clone.get('/own-main.js', { wait: false })).toString()
  t.is(mainContent, '// own-main\nmodule.exports = require("./checkout.js")')

  const main2Content = (await clone.get('/own-main2.js', { wait: false })).toString()
  t.is(main2Content, '// second main\nmodule.exports = require("./checkout.js")')

  const otherContent = (await clone.get('/something-irrelevant.js', { wait: false })).toString()
  t.is(otherContent, '// not an entrypoint')
})

test.solo('unskippable updates', async function (t) {
  const directory = await tmp(t)
  const [drive, clone] = await createDrives(t)
  const u = new Updater(clone, {
    directory,
    host: 'universal-universal'
  })

  await drive.put('/checkout.js', '')
  await drive.put('/own-main.js', 'module.exports = require("./checkout.js")')
  await drive.put('/package.json', JSON.stringify({ main: 'own-main.js' }))
  const unskippable = drive.core.length

  await drive.put('/package.json', JSON.stringify({ main: 'own-main.js', pear: { stage: { unskippableUpdates: [unskippable] } } }))

  await u.update()
  await u.applyUpdate()

  const entrypoint = await fsp.readFile(path.join(u.swap, 'own-main.bundle'), 'utf-8')
  const checkout = nodeBundle(entrypoint)

  t.is(checkout.length, unskippable)
  t.is(checkout.fork, drive.core.fork)
  t.is(checkout.key, drive.core.id)

  await u.update()
  await u.applyUpdate()

  const entrypoint2 = await fsp.readFile(path.join(u.swap, 'own-main.bundle'), 'utf-8')
  const checkout2 = nodeBundle(entrypoint2)

  t.is(checkout2.length, drive.core.length)
  t.is(checkout2.fork, drive.core.fork)
  t.is(checkout2.key, drive.core.id)
})
