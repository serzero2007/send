/*!
 * send
 * Copyright(c) 2012 TJ Holowaychuk
 * Copyright(c) 2014-2022 Douglas Christopher Wilson
 * Copyright(c) 2023 Feanorx
 * MIT Licensed
 */

'use strict'

const fs = require('node:fs')
// const debug = require('node:util').debuglog('send')

const { processStatAndPath } = require('./processStatAndPath')
const { maybeConditionalGetResponse } = require('./conditionalGet')
const { parsePath } = require('./parsePath')
const { contentRange } = require('./contentRange')
const { ResponseContext } = require('./Context')
const { processPartialResponseRanges } = require('./Range')

function preparePath (context, path) {
  const parsed = parsePath(path, context.options)
  context.status = parsed.status
  context.path = parsed.path
}

async function send (req, path, options) {
  const context = ResponseContext.fromRawOptions(options)

  preparePath(context, path)
  if (context.finished) return context.response

  await processStatAndPath(context)
  if (context.finished) return context.response

  if (context.stat.isDirectory()) {
    throw new Error('Not implemented self.redirect(path)')
  }

  buildHeaders(context)
  maybeConditionalGetResponse(context, req)
  if (context.finished) return context.response

  processPartialResponseRanges(context, req)
  if (context.finished) return context.response

  if (context.range === undefined) {
    return respondFullContent(context)
  } else {
    return respondPartialContent(context)
  }
}

function buildHeaders (context) {
  const options = context.options
  const headers = context.headers

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
    headers.etag = context.etag
  }
  if (context.type) {
    headers['content-type'] = context.type
  }
}

function respondFullContent (context) {
  context.stream = fs.createReadStream(context.path, {
    start: context.options.start,
    end: context.options.end
  })
  context.status = 200
  return context.response
}

function respondPartialContent (context) {
  context.headers['content-range'] = contentRange('bytes', context.contentLength, context.range)
  context.headers['content-length'] = context.range.end - context.range.start + 1
  // adjust for requested range
  const stream = fs.createReadStream(context.path, {
    start: context.options.start + context.range.start,
    end: context.options.start + context.range.end
  })
  context.status = 206
  context.stream = stream
  return context.response
}

// function isCachable (statusCode) {
//  return (statusCode >= 200 && statusCode < 300) ||
//      statusCode === 304
// }

module.exports = send
