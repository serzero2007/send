'use strict'

const { test } = require('tap')
const path = require('path')
const send = require('../lib/send')

const fixtures = path.join(__dirname, 'fixtures')

test('send', async function (t) {
  const testCases = [
    [[{ headers: {} }, `${fixtures}/empty.txt`], {}],
    [[{ headers: {} }, `${fixtures}/empty`, { extensions: ['txt'] }], {}],
    [[{ headers: {} }, `${fixtures}/empty`, { extensions: ['jpg'] }], { status: 404 }],
    [[{ headers: {} }, `${fixtures}/`], new Error('Not implemented self.redirect(path)')],
    [[{ headers: {} }, '\0'], { status: 400 }],
    [[{ headers: {} }, '/some%99thing.txt'], { status: 400 }]
  ]

  t.plan(testCases.length)

  for (let i = 0; i < testCases.length; ++i) {
    try {
      const result = await send(...testCases[i][0])
      t.strictSame(result, testCases[i][1])
    } catch (error) {
      t.strictSame(error, testCases[i][1])
    }
  }
})

test('parseOptions', function (t) {
  const common = {
    acceptRanges: true,
    cacheControl: true,
    etag: true,
    dotfiles: 1,
    extensions: [],
    immutable: true,
    index: [
      'index.html'
    ],
    lastModified: true,
    maxage: 0,
    root: null
  }

  const exts = ['htm', 'html', 'txt']
  const testCases = [
    [{ acceptRanges: false }, { ...common, acceptRanges: false }],
    [{ cacheControl: false }, { ...common, cacheControl: false }],
    [{ lastModified: false }, { ...common, lastModified: false }],
    [{ etag: false }, { ...common, etag: false }],
    [{ root: '/' }, { ...common, root: '/' }],
    [{ dotfiles: 'ignore' }, { ...common, dotfiles: 1 }],
    [{ dotfiles: 'allow' }, { ...common, dotfiles: 0 }],
    [{ dotfiles: 'deny' }, { ...common, dotfiles: 2 }],
    [{ dotfiles: 'error' }, new TypeError('dotfiles option must be "allow", "deny", or "ignore"')],
    [{ immutable: false }, { ...common, immutable: false }],
    [{ extensions: false }, { ...common, extensions: [] }],
    [{ extensions: 'txt' }, { ...common, extensions: ['txt'] }],
    [{ extensions: exts }, { ...common, extensions: exts }],
    [{ maxage: '1h' }, { ...common, maxage: 60 * 60 * 1000 }],
    [{ index: ['a.html'] }, { ...common, index: ['a.html'] }],
    [{ index: 'dir.html' }, { ...common, index: ['dir.html'] }]
  ]

  t.plan(testCases.length)

  for (let i = 0; i < testCases.length; ++i) {
    try {
      const result = send.parseOptions(testCases[i][0])
      t.strictSame(result, testCases[i][1])
    } catch (error) {
      t.strictSame(error, testCases[i][1])
    }
  }
})
