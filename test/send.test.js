'use strict'

const { test } = require('tap')
const path = require('path')
const send = require('../lib/send')
const { parseOptions } = require('../lib/parseOptions')
// const streamEqual = require('stream-equal')
const fixtures = path.join(__dirname, 'fixtures')

function streamToString2 (stream) {
  const chunks = []
  return new Promise((resolve, reject) => {
    stream.on('data', chunk => chunks.push(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
  })
}

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
    'accept-ranges': 'bytes',
    'cache-control': 'public, max-age=0, immutable',
    'last-modified': Exists,
    etag: Exists,
    'content-type': 'text/plain; charset=UTF-8'
  }

  const testCases = [
    [[{ headers: {} }, `${fixtures}/empty.txt`], { status: 200, headers, stream: Exists }],
    [[{ headers: {} }, `${fixtures}/empty`, { extensions: ['txt'] }], { status: 200, headers, stream: Exists }],
    [[{ headers: {} }, `${fixtures}/empty`, { extensions: ['jpg'] }], { status: 404, headers: {}, stream: null }],
    [[{ headers: {} }, `${fixtures}/`], new Error('Not implemented self.redirect(path)')],
    [[{ headers: {} }, '\0'], { status: 400, headers: {}, stream: null }],
    [[{ headers: {} }, '/some%99thing.txt'], { status: 400, headers: {}, stream: null }]
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

test('if-unmodified-since', async function (t) {
  const result1 = await send({ headers: {} }, '/name.txt', { root: fixtures })

  const lmod = new Date(result1.headers['last-modified'])
  const date = new Date(lmod - 60000).toUTCString()

  const result2 = await send({ headers: { 'if-unmodified-since': date } }, '/name.txt', { root: fixtures })
  t.strictSame(result2.status, 412)

  // TODO: Is it correct?
  const result3 = await send({ headers: { 'if-unmodified-since': 'corrupted' } }, '/name.txt', { root: fixtures })
  t.strictSame(result3.status, 200)

  const content1 = await streamToString2(result1.stream)
  const content3 = await streamToString2(result3.stream)

  t.strictSame(content1, 'tobi')
  t.strictSame(content3, 'tobi')
})

test('if-modified-since', async function (t) {
  const result1 = await send({ headers: {} }, '/name.txt', { root: fixtures })

  const lmod = new Date(result1.headers['last-modified'])
  const date2 = new Date(lmod - 60000).toUTCString()
  const result2 = await send({ headers: { 'if-modified-since': date2 } }, '/name.txt', { root: fixtures })
  t.strictSame(result2.status, 200)

  const date3 = new Date(lmod + 60000).toUTCString()
  const result3 = await send({ headers: { 'if-modified-since': date3 } }, '/name.txt', { root: fixtures })

  t.strictSame(result3.status, 304)
})

test('if-match', async function (t) {
  const result1 = await send({ headers: {} }, '/name.txt', { root: fixtures })
  t.strictSame(result1.status, 200)

  const result2a = await send({ headers: { 'if-match': result1.headers.etag } }, '/name.txt', { root: fixtures })
  t.strictSame(result2a.status, 200)

  const result2b = await send({ headers: { 'if-match': result1.headers.etag.slice(2) } }, '/name.txt', { root: fixtures })
  t.strictSame(result2b.status, 200)

  const result3 = await send({ headers: { 'if-match': result1.headers.etag + 'corrupt' } }, '/name.txt', { root: fixtures })
  t.strictSame(result3.status, 412)
})

test('if-none-match', async function (t) {
  const result1 = await send({ headers: {} }, '/name.txt', { root: fixtures })
  t.strictSame(result1.status, 200)

  const result2a = await send({ headers: { 'if-none-match': result1.headers.etag } }, '/name.txt', { root: fixtures })
  t.strictSame(result2a.status, 304)

  const result2b = await send({ headers: { 'if-none-match': result1.headers.etag.slice(2) } }, '/name.txt', { root: fixtures })
  t.strictSame(result2b.status, 304)

  const result2c = await send({ headers: { 'cache-control': 'no-cache', 'if-none-match': result1.headers.etag } }, '/name.txt', { root: fixtures })
  t.strictSame(result2c.status, 200)

  const result3 = await send({ headers: { 'if-none-match': result1.headers.etag + 'corrupt' } }, '/name.txt', { root: fixtures })
  t.strictSame(result3.status, 200)

  const content1 = await streamToString2(result1.stream)
  const content3 = await streamToString2(result3.stream)

  t.strictSame(content1, content3)
})

test('if-none-match: *', async function (t) {
  const result1 = await send({ headers: {} }, '/name.txt', { root: fixtures })
  t.strictSame(result1.status, 200)

  const result2a = await send({ headers: { 'if-none-match': '*' } }, '/name.txt', { root: fixtures })
  t.strictSame(result2a.status, 304)
})

test('extentions', async function (t) {
  const result1 = await send({ headers: {} }, '/name', { root: fixtures, extensions: 'txt' })
  t.strictSame(result1.status, 200)

  const result2 = await send({ headers: {} }, '/name', { root: fixtures, extensions: ['dir', 'txt', 'html'] })
  t.strictSame(result2.status, 200)

  const result3 = await send({ headers: {} }, '/name', { root: fixtures, extensions: ['html'] })
  t.strictSame(result3.status, 200)

  const content1 = await streamToString2(result1.stream)
  const content2 = await streamToString2(result2.stream)
  const content3 = await streamToString2(result3.stream)

  t.strictSame(content1, 'tobi')
  t.strictSame(content2, 'tobi')
  t.strictSame(content3, '<p>tobi</p>')

  const result4 = await send({ headers: {} }, '/name/', { root: fixtures, extensions: ['dir', 'txt', 'html'] })
  t.strictSame(result4.status, 404)

  const result5 = await send({ headers: {} }, '/name.html/', { root: fixtures, extensions: ['dir', 'txt', 'html'] })
  t.strictSame(result5.status, 404)
})

test('malicious path', async function (t) {
  const result1 = await send({ headers: {} }, '/../../index.js', { root: fixtures })
  t.strictSame(result1.status, 403)

  const result2 = await send({ headers: {} }, '/\0.html', { root: fixtures })
  t.strictSame(result2.status, 400)
})

test('dotfiles', async function (t) {
  const result1 = await send({ headers: {} }, '/.hidden.txt', { root: fixtures, dotfiles: 'deny' })
  t.strictSame(result1.status, 403)

  const result2 = await send({ headers: {} }, '/.hidden.txt', { root: fixtures, dotfiles: 'allow' })
  t.strictSame(result2.status, 200)

  const result3 = await send({ headers: {} }, '/.hidden.txt', { root: fixtures, dotfiles: 'ignore' })
  t.strictSame(result3.status, 404)
})

test('range', async function (t) {
  const result1 = await send({ headers: { range: 'bytes=' } }, '/name.txt', { root: fixtures })
  t.strictSame(result1.status, 416)

  const result2 = await send({ headers: { range: 'bytes=0-1' } }, '/name.txt', { root: fixtures })
  const content2 = await streamToString2(result2.stream)
  t.strictSame(result2.status, 206)
  t.strictSame(content2, 'to')

  const result3 = await send({ headers: { range: 'bytes=1-3' } }, '/name.txt', { root: fixtures })
  const content3 = await streamToString2(result3.stream)
  t.strictSame(result3.status, 206)
  t.strictSame(content3, 'obi')

  const result4 = await send({ headers: { range: 'bytes=0-0, 2-2' } }, '/name.txt', { root: fixtures })
  const content4 = await streamToString2(result4.stream)
  t.strictSame(result4.status, 200)
  t.strictSame(content4, 'tobi')

  // Range merging ?
  const result5 = await send({ headers: { range: 'bytes=0-1, 2-2' } }, '/name.txt', { root: fixtures })
  const content5 = await streamToString2(result5.stream)
  t.strictSame(result5.status, 206)
  t.strictSame(content5, 'tob')

  const result6 = await send({ headers: {} }, '/name.txt', { root: fixtures, start: 1, end: 1 })
  const content6 = await streamToString2(result6.stream)
  t.strictSame(result6.status, 200)
  t.strictSame(content6, 'o')
})

test('range2', async function (t) {
  const result1 = await send({ headers: { range: 'bytes=0-2' } }, '/name.txt', { root: fixtures, start: 1, end: 6 })
  t.strictSame(result1.status, 206)
  t.strictSame(await streamToString2(result1.stream), 'obi')

  const result6 = await send({ headers: { range: 'bytes=0-2' } }, '/name.txt', { root: fixtures, start: 1, end: 1 })
  const content6 = await streamToString2(result6.stream)
  t.strictSame(result6.status, 206)
  t.strictSame(content6, 'o')
})

test('if range', async function (t) {
  const result1 = await send({ headers: {} }, '/name.txt', { root: fixtures })
  t.strictSame(result1.status, 200)

  const result2 = await send({ headers: { range: 'bytes=0-1', 'if-range': result1.headers.etag } }, '/name.txt', { root: fixtures })
  const content2 = await streamToString2(result2.stream)
  t.strictSame(result2.status, 206)
  t.strictSame(content2, 'to')

  const lmod = new Date(result1.headers['last-modified'])

  const date3 = new Date(lmod - 60000).toUTCString()
  const result3 = await send({ headers: { range: 'bytes=0-1', 'if-range': date3 } }, '/name.txt', { root: fixtures })
  const content3 = await streamToString2(result3.stream)
  t.strictSame(result3.status, 200)
  t.strictSame(content3, 'tobi')

  const date4 = new Date(lmod + 60000).toUTCString()
  const result4 = await send({ headers: { range: 'bytes=0-1', 'if-range': date4 } }, '/name.txt', { root: fixtures })
  const content4 = await streamToString2(result4.stream)
  t.strictSame(result4.status, 206)
  t.strictSame(content4, 'to')

  const result5 = await send({ headers: { range: 'bytes=0-1', 'if-range': 'corrupted' } }, '/name.txt', { root: fixtures })
  const content5 = await streamToString2(result5.stream)
  t.strictSame(result5.status, 200)
  t.strictSame(content5, 'tobi')

  const result6 = await send({ headers: { range: 'bytes=0-1' } }, '/name.txt', { root: fixtures, acceptRanges: false })
  const content6 = await streamToString2(result6.stream)
  t.strictSame(result6.status, 200)
  t.strictSame(content6, 'tobi')

  const result7 = await send({ headers: { range: 'corrupted' } }, '/name.txt', { root: fixtures })
  const content7 = await streamToString2(result7.stream)
  t.strictSame(result7.status, 200)
  t.strictSame(content7, 'tobi')
})

test('type', async function (t) {
  // TODO Check type header
  const result1 = await send({ headers: {} }, '/images/node-js.png', { root: fixtures })
  t.strictSame(result1.status, 200)

  const result2 = await send({ headers: {} }, '/no_ext', { root: fixtures })
  t.strictSame(result2.status, 200)
})

test('disabling headers', async function (t) {
  // TODO Check header
  const result1 = await send({ headers: {} }, '/images/node-js.png', {
    root: fixtures,
    cacheControl: false,
    lastModified: false,
    etag: false
  })
  t.strictSame(result1.status, 200)
})

test('immutable', async function (t) {
  // TODO Check header
  const result1 = await send({ headers: {} }, '/images/node-js.png', {
    root: fixtures,
    cacheControl: true,
    immutable: true
  })
  t.strictSame(result1.status, 200)

  // TODO Check header
  const result2 = await send({ headers: {} }, '/images/node-js.png', {
    root: fixtures,
    cacheControl: true,
    immutable: false
  })
  t.strictSame(result2.status, 200)
})

test('start/end', async function (t) {
  // TODO Check header
  const result1 = await send({ headers: {} }, '/name.txt', {
    root: fixtures,
    start: 0,
    end: 1
  })
  t.strictSame(result1.status, 200)

  // TODO Check header
  const result2 = await send({ headers: {} }, '/name.txt', {
    root: fixtures,
    start: 0,
    end: 100
  })
  t.strictSame(result2.status, 200)
})

test('index', async function (t) {
  // TODO Check header
  const result1 = await send({ headers: {} }, '/pets/', { root: fixtures })
  t.strictSame(result1.status, 200)

  const result2 = await send({ headers: {} }, '/', { root: fixtures })
  t.strictSame(result2.status, 404)

  const result3 = await send({ headers: {} }, '/', { root: fixtures, index: ['images', 'pets/index.html'] })
  t.strictSame(result3.status, 200)
})
