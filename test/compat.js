const test = require('brittle')
const tmp = require('test-tmp')
const { createDrives } = require('./helpers')
const Updater = require('../index')
const { promises: fsp } = require('fs')
const path = require('path')
const nodeBundle = require('node-bare-bundle')

test('should follow uncompat updates', async function (t) {
  t.plan(12)

  const directory = await tmp(t)
  const [drive, clone] = await createDrives(t)
  let u = new Updater(clone, { abi: 0, directory, host: 'universal-universal' })

  const compat = []

  await drive.put('/checkout.js', '')
  await drive.put('/own-main.js', 'module.exports = require("./checkout.js")')
  await drive.put('/package.json', JSON.stringify({ main: 'own-main.js' }))
  compat.push({ abi: 0, length: drive.core.length })
  await drive.put('/checkout.js', 'console.log("hello")')
  compat.push({ abi: 1, length: drive.core.length })
  await drive.put('/checkout.js', 'console.log("hello")\nconsole.log("world")')
  await drive.put(
    '/checkout.js',
    'console.log("hello")\nconsole.log("world")\nconsole.log("universe")'
  )
  compat.push({ abi: 2, length: drive.core.length })
  await drive.put(
    '/package.json',
    JSON.stringify({
      main: 'own-main.js',
      pear: { updater: [{ key: drive.core.id, abi: 3, compat }] }
    })
  )
  t.comment(`Final drive length is ${drive.core.length}`)

  t.comment(`Updating to ${compat[0].length}`)
  await flush()
  await u.update()
  await u.applyUpdate()
  const entrypoint1 = await fsp.readFile(path.join(u.swap, 'own-main.bundle'), 'utf-8')
  await u.close()
  const checkout1 = nodeBundle(entrypoint1)
  t.is(checkout1.length, compat[0].length, 'Checkout matches unskippable')
  t.is(checkout1.fork, drive.core.fork, 'Fork matches')
  t.is(checkout1.key, drive.core.id, 'Key matches')

  t.comment(`Updating to ${compat[1].length}`)
  u = new Updater(clone, { abi: 1, directory, host: 'universal-universal', checkout: checkout1 })
  await flush()
  await u.update()
  await u.applyUpdate()
  const entrypoint2 = await fsp.readFile(path.join(u.swap, 'own-main.bundle'), 'utf-8')
  await u.close()
  const checkout2 = nodeBundle(entrypoint2)
  t.is(checkout2.length, compat[1].length, 'Checkout matches unskippable')
  t.is(checkout2.fork, drive.core.fork, 'Fork matches')
  t.is(checkout2.key, drive.core.id, 'Key matches')

  t.comment(`Updating to ${compat[2].length}`)
  u = new Updater(clone, { abi: 2, directory, host: 'universal-universal', checkout: checkout2 })
  await flush()
  await u.update()
  await u.applyUpdate()
  const entrypoint3 = await fsp.readFile(path.join(u.swap, 'own-main.bundle'), 'utf-8')
  await u.close()
  const checkout3 = nodeBundle(entrypoint3)
  t.is(checkout3.length, compat[2].length, 'Checkout matches unskippable')
  t.is(checkout3.fork, drive.core.fork, 'Fork matches')
  t.is(checkout3.key, drive.core.id, 'Key matches')

  t.comment('Updating to latest')
  u = new Updater(clone, { abi: 3, directory, host: 'universal-universal', checkout: checkout3 })
  await flush()
  await u.update()
  await u.applyUpdate()
  const entrypoint = await fsp.readFile(path.join(u.swap, 'own-main.bundle'), 'utf-8')
  await u.close()
  const checkout = nodeBundle(entrypoint)
  t.is(checkout.length, drive.core.length, 'Final checkout matches drive length')
  t.is(checkout.fork, drive.core.fork, 'Fork matches')
  t.is(checkout.key, drive.core.id, 'Key matches')

  async function flush() {
    while (u.drive.core.length !== drive.core.length) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
})
