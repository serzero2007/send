/*!
 * send
 * Copyright(c) 2012 TJ Holowaychuk
 * Copyright(c) 2014-2022 Douglas Christopher Wilson
 * Copyright(c) 2023 Feanorx
 * MIT Licensed
 */

'use strict'

const fs = require('node:fs')
const debug = require('node:util').debuglog('send')

const mime = require('mime')

const { getStatAndPath } = require('./getStatAndPath')
const { maybeConditionalGetResponse } = require('./conditionalGet')
const { parsePath } = require('./parsePath')
const { contentRange } = require('./contentRange')
const { isUtf8MimeType } = require('./isUtf8MimeType')
const { parseBytesRange } = require('./parseBytesRange')
const { parseOptions } = require('./parseOptions')

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
  if (parsed.path === null) return { status: parsed.status }

  // index file support
  // if (this._index.length && this.hasTrailingSlash()) {
  //     this.sendIndex(path)
  //     return res
  // }

  const result = await getStatAndPath(parsed.path, opts)
  if (result.status) return result

  if (result.stat.isDirectory()) {
    throw new Error('Not implemented self.redirect(path)')
  }

  return sendFile(req, result.path, result.stat, opts)
}

function getPartialResponseRanges (req, len, options, fileContext) {
  if (!options.acceptRanges) return null

  const rangeHeader = req.headers.range
  if (rangeHeader === undefined) return null
  if (!BYTES_RANGE_REGEXP.test(rangeHeader)) return null
  if (!isRangeFresh(req, fileContext)) return null

  const ranges = parseBytesRange(len, rangeHeader)

  if (ranges.length > 1) return null

  return ranges
}

function getContentType (path) {
  // TODO: Move default type to options?
  let type = mime.getType(path) || mime.default_type
  if (type && isUtf8MimeType(type)) {
    type += '; charset=UTF-8'
  }
  return type
}

function buildHeaders (context, options) {
  const headers = {}

  // set header fields
  if (options.acceptRanges) {
    headers['accept-ranges'] = 'bytes'
  }
  if (options.cacheControl) {
    let cacheControl = 'public, max-age=' + Math.floor(options.maxage / 1000)
    if (options.immutable) cacheControl += ', immutable'
    headers['cache-control'] = cacheControl
  }
  if (options.lastModified) {
    headers['last-modified'] = context.modified
  }
  if (options.etag) {
    headers.ETag = context.etag
  }
  if (context.type) {
    headers['content-type'] = context.type
  }

  return headers
}

function buildContext (path, stat) {
  const context = {
    type: getContentType(path),
    modified: stat.mtime.toUTCString(),
    etag: 'W/"' + stat.size.toString(16) + '-' + stat.mtime.getTime().toString(16) + '"'
  }
  return context
}

async function sendFile (req, path, stat, options) {
  const context = buildContext(path, stat)
  const headers = buildHeaders(context, options)

  const conditionGetResponse = maybeConditionalGetResponse(req, context)
  if (conditionGetResponse !== null) {
    return {
      status: conditionGetResponse.status,
      headers
    }
  }

  // adjust len to start/end options
  let len = Math.max(0, stat.size - options.start)
  if (options.end !== undefined) {
    const bytes = options.end - options.start + 1
    if (len > bytes) len = bytes
  }

  // Range support
  const ranges = getPartialResponseRanges(req, len, options, context)

  // Should use ordinary response
  if (ranges === null) {
    const stream = fs.createReadStream(path, {
      start: options.start,
      end: options.end
    })
    return { headers, stream, status: 200 }
  }

  // unsatisfiable
  if (ranges.length === 0) {
    debug('range unsatisfiable')
    // content-range
    headers['content-range'] = contentRange('bytes', len)
    // 416 Requested Range Not Satisfiable
    return { headers, status: 416 }
    // valid (syntactically invalid/multiple ranges are treated as a regular response)
  }

  debug('range %j', ranges)

  headers['content-range'] = contentRange('bytes', len, ranges[0])
  headers['content-length'] = ranges[0].end - ranges[0].start + 1
  // adjust for requested range
  const stream = fs.createReadStream(path, {
    start: options.start + ranges[0].start,
    end: options.start + ranges[0].end
  })
  return { headers, stream, status: 206 }
}

// function isCachable (statusCode) {
//  return (statusCode >= 200 && statusCode < 300) ||
//      statusCode === 304
// }

function isRangeFresh (req, fileContext) {
  if (!('if-range' in req.headers)) {
    return true
  }

  const ifRange = req.headers['if-range']

  // if-range as etag
  if (ifRange.indexOf('"') !== -1) {
    const etag = fileContext.etag
    /* istanbul ignore next */
    return (etag && ifRange.indexOf(etag) !== -1) || false
  }

  const ifRangeTimestamp = Date.parse(ifRange)
  // eslint-disable-next-line no-self-compare
  if (ifRangeTimestamp !== ifRangeTimestamp) { // fast path of isNaN(number)
    return false
  }

  // if-range as modified date
  const lastModified = Date.parse(fileContext.modified)

  return (
  // eslint-disable-next-line no-self-compare
    lastModified !== lastModified || // fast path of isNaN(number)
      lastModified <= ifRangeTimestamp
  )
}

module.exports = send
