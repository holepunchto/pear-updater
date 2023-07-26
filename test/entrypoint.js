const test = require('brittle')
const tmp = require('test-tmp')
const Updater = require('../')
const fsp = require('fs').promises
const path = require('path')
const { createDrives, createTouch } = require('./helpers')

test('updates entrypoint on disk and writes /checkout.js', async function (t) {
  const directory = await tmp(t)
  const [drive, clone] = await createDrives(t)

  const u = new Updater(clone, {
    directory,
    platform: 'universal',
    arch: 'universal'
  })

  const touchAndUpdate = createTouch(drive, u)

  await touchAndUpdate('/by-arch/universal-universal/bin/file')
  // TODO: this is needed atm, but thats a scriptlinker bug (low prio, but we should fix)
  await touchAndUpdate('/checkout.js', 'module.exports = {}')
  await touchAndUpdate('/index.js', 'module.exports = require("./checkout.js")')

  const entrypoint = await fsp.readFile(path.join(u.swap, 'index.js'), 'utf-8')
  const checkout = new Function('require', 'return ' + entrypoint)(require) // eslint-disable-line

  t.is(checkout.length, drive.core.length)
  t.is(checkout.fork, drive.core.fork)
  t.is(checkout.key, drive.core.id)
})

test('file referenced in package.json main is put on disk', async function (t) {
  const directory = await tmp(t)
  const [drive, clone] = await createDrives(t)

  const u = new Updater(clone, {
    directory,
    platform: 'universal',
    arch: 'universal'
  })

  const touchAndUpdate = createTouch(drive, u)

  await touchAndUpdate('/checkout.js', 'module.exports = {}')
  await touchAndUpdate('/own-main.js', 'module.exports = require("./checkout.js")')
  await touchAndUpdate('/package.json', JSON.stringify({ main: 'own-main.js' }))

  const entrypoint = await fsp.readFile(path.join(u.swap, 'own-main.js'), 'utf-8')
  const checkout = new Function('require', 'return ' + entrypoint)(require) // eslint-disable-line

  t.is(checkout.length, drive.core.length)
  t.is(checkout.fork, drive.core.fork)
  t.is(checkout.key, drive.core.id)
})
