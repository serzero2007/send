/*!
 * send
 * Copyright(c) 2012 TJ Holowaychuk
 * Copyright(c) 2014-2022 Douglas Christopher Wilson
 * Copyright(c) 2023 Feanorx
 * MIT Licensed
 */

'use strict'

const fs = require('node:fs')
const fsPromise = require('node:fs/promises')
const path = require('node:path')
const debug = require('node:util').debuglog('send')

const mime = require('mime')

const { parsePath } = require('./parsePath')
const { contentRange } = require('./contentRange')
const { isUtf8MimeType } = require('./isUtf8MimeType')
const { parseBytesRange } = require('./parseBytesRange')
const { parseTokenList } = require('./parseTokenList')
const { parseOptions } = require('./parseOptions')

/**
 * Path function references.
 * @private
 */

const extname = path.extname
const sep = path.sep

/**
 * Regular expression for identifying a bytes Range header.
 * @private
 */

const BYTES_RANGE_REGEXP = /^ *bytes=/

/**
 * Initialize a `SendStream` with the given `path`.
 *
 * @param {Request} req
 * @param {String} path
 * @param {object} [options]
 * @private
 */

async function send (req, _path, options) {
  const opts = parseOptions(options)

  // decode the path
  const parsed = parsePath(_path, opts)
  const { path } = parsed

  if (path === null) {
    return {
      status: parsed.status
    }
  }

  // index file support
  // if (this._index.length && this.hasTrailingSlash()) {
  //     this.sendIndex(path)
  //     return res
  // }

  return sendFile(req, path, opts)
}

async function sendFileDirectly (req, path, stat, options) {
  const offset = options.start || 0
  // adjust len to start/end options
  let len = Math.max(0, stat.size - offset)
  if (options.end !== undefined) {
    const bytes = options.end - offset + 1
    if (len > bytes) len = bytes
  }

  const headers = {}

  debug('pipe "%s"', path)

  // set header fields
  if (options.acceptRanges) {
    headers['Accept-Ranges'] = 'bytes'
  }
  if (options.cacheControl) {
    let cacheControl = 'public, max-age=' + Math.floor(options.maxage / 1000)
    if (options.immutable) cacheControl += ', immutable'
    headers['Cache-Control'] = cacheControl
  }
  if (options.lastModified) {
    const modified = stat.mtime.toUTCString()
    headers['Last-Modified'] = modified
  }
  if (options.etag) {
    const etag = 'W/"' + stat.size.toString(16) + '-' + stat.mtime.getTime().toString(16) + '"'
    headers.ETag = etag
  }

  // set content-type
  let type = mime.getType(path) || mime.default_type
  if (type && isUtf8MimeType(type)) { type += '; charset=UTF-8' }
  if (type) headers['Content-Type'] = type

  // conditional GET support
  if (isConditionalGET(req)) {
    if (isPreconditionFailure(req, headers)) {
      return { status: 412, headers }
    }

    if (isNotModifiedFailure(req, headers)) {
      return {
        status: 304,
        headers
      }
    }
  }

  // Range support
  if (options.acceptRanges) {
    const rangeHeader = req.headers.range

    if (
      rangeHeader !== undefined &&
        BYTES_RANGE_REGEXP.test(rangeHeader)
    ) {
      // If-Range support
      if (isRangeFresh(req, headers)) {
        // parse
        const ranges = parseBytesRange(len, rangeHeader)

        // unsatisfiable
        if (ranges.length === 0) {
          debug('range unsatisfiable')
          // Content-Range
          headers['Content-Range'] = contentRange('bytes', len)
          // 416 Requested Range Not Satisfiable
          return { headers, status: 416 }
          // valid (syntactically invalid/multiple ranges are treated as a regular response)
        }
        if (ranges.length === 1) {
          debug('range %j', ranges)

          headers['Content-Range'] = contentRange('bytes', len, ranges[0])
          headers['Content-Length'] = ranges[0].end - ranges[0].start + 1
          // adjust for requested range
          const start = offset + ranges[0].start
          const end = offset + ranges[0].end
          const stream = fs.createReadStream(path, { start, end })
          return { type, headers, stream, status: 206 }
        }
      } else {
        debug('range stale')
      }
    }
  }

  const stream = fs.createReadStream(path, { start: offset })
  return { type, headers, stream, status: 200 }
}

async function sendFileWithExtensions (req, basepath, opts) {
  for (const extension of opts.extensions) {
    try {
      const path = basepath + '.' + extension
      const stat = await fsPromise.stat(path)
      if (stat.isDirectory()) continue
      return sendFileDirectly(req, path, stat, opts)
    } catch (error) {
      continue
    }
  }

  return { status: 404 }
}

async function sendFile (req, path, opts) {
  let stat
  try {
    stat = await fsPromise.stat(path)
  } catch (error) {
    if (error.code === 'ENOENT' && !extname(path) && path[path.length - 1] !== sep) {
      return sendFileWithExtensions(req, path, opts)
    }
    return onStatError(error)
  }

  if (stat.isDirectory()) {
    throw new Error('Not implemented self.redirect(path)')
  }

  return sendFileDirectly(req, path, stat, opts)
}

function isNotModifiedFailure (req, headers) {
  // Always return stale when Cache-Control: no-cache
  // to support end-to-end reload requests
  // https://tools.ietf.org/html/rfc2616#section-14.9.4
  if (
    'cache-control' in req.headers &&
      req.headers['cache-control'].indexOf('no-cache') !== -1
  ) {
    return false
  }

  // if-none-match
  if ('if-none-match' in req.headers) {
    const ifNoneMatch = req.headers['if-none-match']

    if (ifNoneMatch === '*') {
      return true
    }

    const etag = headers.etag

    if (typeof etag !== 'string') {
      return false
    }

    const etagL = etag.length
    const isMatching = parseTokenList(ifNoneMatch, function (match) {
      const mL = match.length

      if (
        (etagL === mL && match === etag) ||
          (etagL > mL && 'W/' + match === etag)
      ) {
        return true
      }
    })

    if (isMatching) {
      return true
    }

    /**
       * A recipient MUST ignore If-Modified-Since if the request contains an
       * If-None-Match header field; the condition in If-None-Match is considered
       * to be a more accurate replacement for the condition in If-Modified-Since,
       * and the two are only combined for the sake of interoperating with older
       * intermediaries that might not implement If-None-Match.
       *
       * @see RFC 9110 section 13.1.3
       */
    return false
  }

  // if-modified-since
  if ('if-modified-since' in req.headers) {
    const ifModifiedSince = req.headers['if-modified-since']
    const lastModified = headers['last-modified']

    if (!lastModified || (Date.parse(lastModified) <= Date.parse(ifModifiedSince))) {
      return true
    }
  }

  return false
}

function isPreconditionFailure (req, headers) {
  // if-match
  const ifMatch = req.headers['if-match']
  if (ifMatch) {
    const etag = headers.ETag

    if (ifMatch !== '*') {
      const isMatching = parseTokenList(ifMatch, function (match) {
        if (
          match === etag ||
            'W/' + match === etag
        ) {
          return true
        }
      }) || false

      if (isMatching !== true) {
        return true
      }
    }
  }

  // if-unmodified-since
  if ('if-unmodified-since' in req.headers) {
    const ifUnmodifiedSince = req.headers['if-unmodified-since']
    const unmodifiedSince = Date.parse(ifUnmodifiedSince)
    // eslint-disable-next-line no-self-compare
    if (unmodifiedSince === unmodifiedSince) { // fast path of isNaN(number)
      const lastModified = Date.parse(headers['Last-Modified'])
      if (
      // eslint-disable-next-line no-self-compare
        lastModified !== lastModified ||// fast path of isNaN(number)
          lastModified > unmodifiedSince
      ) {
        return true
      }
    }
  }

  return false
}

function onStatError (error) {
  // POSIX throws ENAMETOOLONG and ENOTDIR, Windows only ENOENT
  /* istanbul ignore next */
  switch (error.code) {
    case 'ENAMETOOLONG':
    case 'ENOTDIR':
    case 'ENOENT':
      return { status: 404, error }
    default:
      return { status: 500, error }
  }
}

// function isCachable (statusCode) {
//  return (statusCode >= 200 && statusCode < 300) ||
//      statusCode === 304
// }

function isRangeFresh (req, headers) {
  if (!('if-range' in req.headers)) {
    return true
  }

  const ifRange = req.headers['if-range']

  // if-range as etag
  if (ifRange.indexOf('"') !== -1) {
    const etag = headers.ETag
    return (etag && ifRange.indexOf(etag) !== -1) || false
  }

  const ifRangeTimestamp = Date.parse(ifRange)
  // eslint-disable-next-line no-self-compare
  if (ifRangeTimestamp !== ifRangeTimestamp) { // fast path of isNaN(number)
    return false
  }

  // if-range as modified date
  const lastModified = Date.parse(headers['Last-Modified'])

  return (
  // eslint-disable-next-line no-self-compare
    lastModified !== lastModified || // fast path of isNaN(number)
      lastModified <= ifRangeTimestamp
  )
}

function isConditionalGET (req) {
  return req.headers['if-match'] ||
      req.headers['if-unmodified-since'] ||
      req.headers['if-none-match'] ||
      req.headers['if-modified-since']
}

module.exports = send
