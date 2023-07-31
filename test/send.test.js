'use strict'

const { test } = require('tap')
const path = require('path')
const send = require('../lib/send')
const { parseOptions } = require('../lib/parseOptions')

const fixtures = path.join(__dirname, 'fixtures')

const Exists = Symbol('Exists')

function isObject (object) {
  return object != null && typeof object === 'object'
}

function deepEqual (object1, object2) {
  const areObjects = isObject(object1) && isObject(object1)
  if (!areObjects) { return object1 === object2 }

  const keys1 = Object.keys(object1)
  const keys2 = Object.keys(object2)

  if (keys1.length !== keys2.length) {
    return false
  }

  for (const key of keys1) {
    const val1 = object1[key]
    const val2 = object2[key]
    if (val2 === Exists) continue
    const areObjects = isObject(val1) && isObject(val2)
    if (
      (areObjects && !deepEqual(val1, val2)) ||
      (!areObjects && val1 !== val2)
    ) {
      return false
    }
  }

  return true
}

test('send', async function (t) {
  const headers = {
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=0, immutable',
    'Last-Modified': Exists,
    ETag: Exists,
    'Content-Type': 'text/plain; charset=UTF-8'
  }

  const testCases = [
    [[{ headers: {} }, `${fixtures}/empty.txt`], { status: 200, headers, stream: Exists }],
    [[{ headers: {} }, `${fixtures}/empty`, { extensions: ['txt'] }], { status: 200, headers, stream: Exists }],
    [[{ headers: {} }, `${fixtures}/empty`, { extensions: ['jpg'] }], { status: 404 }],
    [[{ headers: {} }, `${fixtures}/`], new Error('Not implemented self.redirect(path)')],
    [[{ headers: {} }, '\0'], { status: 400 }],
    [[{ headers: {} }, '/some%99thing.txt'], { status: 400 }]
  ]

  t.plan(testCases.length)

  for (let i = 0; i < testCases.length; ++i) {
    const template = testCases[i][1]
    try {
      const result = await send(...testCases[i][0])
      const ok = deepEqual(result, template)
      if (!t.ok(ok)) {
        console.log({ result, template })
      }
    } catch (error) {
      if (!t.strictSame(error, template)) {
        console.log(error)
      }
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
    start: 0,
    end: undefined,
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
      const result = parseOptions(testCases[i][0])
      t.strictSame(result, testCases[i][1])
    } catch (error) {
      t.strictSame(error, testCases[i][1])
    }
  }
})
