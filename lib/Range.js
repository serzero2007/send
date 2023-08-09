/*!
 * send
 * Copyright(c) 2012 TJ Holowaychuk
 * Copyright(c) 2014-2022 Douglas Christopher Wilson
 * Copyright(c) 2023 Feanorx
 * MIT Licensed
 */

const { parseBytesRange } = require('./parseBytesRange')
const { contentRange } = require('./contentRange')

const debug = require('node:util').debuglog('send')

const BYTES_RANGE_REGEXP = /^ *bytes=/

function isRangeFreshEtag (context, ifRange) {
  const etag = context.etag
  /* istanbul ignore next */
  return (etag && ifRange.indexOf(etag) !== -1) || false
}

function isRangeFreshTimestamp (context, ifRange) {
  const ifRangeTimestamp = Date.parse(ifRange)
  const lastModified = Date.parse(context.modified)

  // fast path of isNaN(number)
  // eslint-disable-next-line no-self-compare
  if (ifRangeTimestamp !== ifRangeTimestamp) return false
  /* istanbul ignore next */
  // eslint-disable-next-line no-self-compare
  if (lastModified !== lastModified) return true

  return lastModified <= ifRangeTimestamp
}

function isRangeFresh (req, context) {
  if (!('if-range' in req.headers)) return true
  const ifRange = req.headers['if-range']

  // if-range as etag
  if (ifRange.indexOf('"') !== -1) {
    return isRangeFreshEtag(context, ifRange)
  } else {
    return isRangeFreshTimestamp(context, ifRange)
  }
}

function isValidRange (req) {
  const rangeHeader = req.headers.range
  if (rangeHeader === undefined) return false
  if (!BYTES_RANGE_REGEXP.test(rangeHeader)) return false
  return true
}

function processPartialResponseRanges (context, req) {
  if (!context.options.acceptRanges) return null
  if (!isValidRange(req)) return null
  if (!isRangeFresh(req, context)) return null

  const ranges = parseBytesRange(context.contentLength, req.headers.range)
  if (ranges.length > 1) return null

  if (ranges.length === 0) {
    debug('range unsatisfiable')
    // content-range
    context.headers['content-range'] = contentRange('bytes', context.contentLength)
    context.status = 416
    // 416 Requested Range Not Satisfiable
    // valid (syntactically invalid/multiple ranges are treated as a regular response)
    return
  }

  context.range = ranges[0]
}

module.exports.processPartialResponseRanges = processPartialResponseRanges
