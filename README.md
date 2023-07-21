# Pear Updater

The updater the pear platform runs on.

```
npm install @holepunchto/pear-updater
```

## Usage

``` js
const PearUpdater = require('@holepunchto/pear-updater')

const u = new PearUpdater(drive, {
  directory: '/where/is/platform/dir',
  swap: '/current/swap/to/use/0',
  checkout: { key: 'z32-key-in-use', length: 42, fork: 0 }, // current checkout in swap
  async onupdating (newCheckout) {
    // fired before updates with an async ctx
  },
  async onupdate (newCheckout) {
    // fired on updates with an async ctx
  }
})

u.on('updating', function (checkout) {
  // emitted when a new update is being downloaded
})

u.on('update', function (checkout) {
  // emitted when a new update has been downloaded
})

for await (const checkout of u.watch(opts)) {
  // watch all updates as they come in, opts forwarded to streamx readable
}

// wait for a min version, opts forwarded to streamx readable
await u.wait(minimumCheckout, opts)
```

## License

MIT
