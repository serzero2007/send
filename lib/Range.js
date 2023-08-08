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

function isRangeFresh (req, context) {
  if (!('if-range' in req.headers)) {
    return true
  }

  const ifRange = req.headers['if-range']

  // if-range as etag
  if (ifRange.indexOf('"') !== -1) {
    const etag = context.etag
    /* istanbul ignore next */
    return (etag && ifRange.indexOf(etag) !== -1) || false
  }

  const ifRangeTimestamp = Date.parse(ifRange)
  // eslint-disable-next-line no-self-compare
  if (ifRangeTimestamp !== ifRangeTimestamp) { // fast path of isNaN(number)
    return false
  }

  // if-range as modified date
  const lastModified = Date.parse(context.modified)

  return (
  // eslint-disable-next-line no-self-compare
    lastModified !== lastModified || // fast path of isNaN(number)
        lastModified <= ifRangeTimestamp
  )
}

function getPartialResponseRanges (context, req) {
  if (!context.options.acceptRanges) return null

  const rangeHeader = req.headers.range
  if (rangeHeader === undefined) return null
  if (!BYTES_RANGE_REGEXP.test(rangeHeader)) return null
  if (!isRangeFresh(req, context)) return null

  const ranges = parseBytesRange(context.contentLength, rangeHeader)
  if (ranges.length > 1) return null

  if (ranges.length === 0) {
    debug('range unsatisfiable')
    // content-range
    context.headers['content-range'] = contentRange('bytes', context.contentLength)
    context.setStatus(416)
    // 416 Requested Range Not Satisfiable
    // valid (syntactically invalid/multiple ranges are treated as a regular response)
    return
  }

  context.setRange(ranges[0])
}

module.exports.isRangeFresh = isRangeFresh
module.exports.getPartialResponseRanges = getPartialResponseRanges
