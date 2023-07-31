/*!
 * send
 * Copyright(c) 2012 TJ Holowaychuk
 * Copyright(c) 2014-2022 Douglas Christopher Wilson
 * Copyright(c) 2023 Feanorx
 * MIT Licensed
 */

'use strict'

const { parseTokenList } = require('./parseTokenList')

function isConditionalGET (req) {
  return req.headers['if-match'] ||
        req.headers['if-unmodified-since'] ||
        req.headers['if-none-match'] ||
        req.headers['if-modified-since']
}

function isIfMatchPreconditionFailure (req, context) {
  const ifMatch = req.headers['if-match']
  if (!ifMatch || ifMatch === '*') return false

  function checker (match) {
    if (context.etag === match) { return true }
    if (context.etag === 'W/' + match) { return true }
    return undefined
  }

  const isMatching = parseTokenList(ifMatch, checker, false)

  return !isMatching
}

function isIfUnmodifiedSincePreconditionFailure (req, context) {
  if (!('if-unmodified-since' in req.headers)) return false

  const unmodifiedSince = Date.parse(req.headers['if-unmodified-since'])
  // eslint-disable-next-line no-self-compare
  if (unmodifiedSince !== unmodifiedSince) return false

  const lastModified = Date.parse(context.modified)
  // eslint-disable-next-line no-self-compare
  if (lastModified !== lastModified) return true

  return lastModified > unmodifiedSince
}

function isPreconditionFailure (req, context) {
  if (isIfMatchPreconditionFailure(req, context)) { return true }
  if (isIfUnmodifiedSincePreconditionFailure(req, context)) { return true }
  return false
}

function isNotModifiedFailure (req, fileContext) {
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

    const etag = fileContext.etag

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
    const lastModified = fileContext.modified

    if (!lastModified || (Date.parse(lastModified) <= Date.parse(ifModifiedSince))) {
      return true
    }
  }

  return false
}

function maybeConditionalGetResponse (req, context) {
  // conditional GET support
  if (isConditionalGET(req)) {
    if (isPreconditionFailure(req, context)) {
      return { status: 412 }
    }

    if (isNotModifiedFailure(req, context)) {
      return {
        status: 304
      }
    }
  }

  return null
}

module.exports.maybeConditionalGetResponse = maybeConditionalGetResponse
