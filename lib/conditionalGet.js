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

  const etag = context.etag
  function checker (match) {
    if (match === etag) return true
    if ('W/' + match === etag) return true
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
  /* istanbul ignore next */
  // eslint-disable-next-line no-self-compare
  if (lastModified !== lastModified) return true

  return lastModified > unmodifiedSince
}

function isPreconditionFailure (req, context) {
  if (isIfMatchPreconditionFailure(req, context)) return true
  if (isIfUnmodifiedSincePreconditionFailure(req, context)) return true
  return false
}

function isIfNoneMatch (req, context) {
  const ifNoneMatch = req.headers['if-none-match']

  if (ifNoneMatch === '*') return true
  /* istanbul ignore next */
  if (typeof context.etag !== 'string') return false

  const etag = context.etag
  function checker (match) {
    if (match === etag) return true
    if ('W/' + match === etag) return true
    return undefined
  }

  const isMatching = parseTokenList(ifNoneMatch, checker, false)
  return isMatching
}

function isIfModifiedSince (req, context) {
  const ifModifiedSince = req.headers['if-modified-since']
  const lastModified = context.modified

  /* istanbul ignore next */
  if (!lastModified) return true

  return Date.parse(lastModified) <= Date.parse(ifModifiedSince)
}

function isNotModified (req, context) {
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
    /**
     * A recipient MUST ignore If-Modified-Since if the request contains an
     * If-None-Match header field; the condition in If-None-Match is considered
     * to be a more accurate replacement for the condition in If-Modified-Since,
     * and the two are only combined for the sake of interoperating with older
     * intermediaries that might not implement If-None-Match.
     *
     * @see RFC 9110 section 13.1.3
     */
    return isIfNoneMatch(req, context)
  }

  // if-modified-since
  if ('if-modified-since' in req.headers) {
    if (isIfModifiedSince(req, context)) { return true }
  }

  return false
}

function maybeConditionalGetResponse (context, req) {
  // conditional GET support
  if (!isConditionalGET(req)) { return context }

  if (isPreconditionFailure(req, context)) { return context.setStatus(412) }

  if (isNotModified(req, context)) {
    // TODO Remove Content-* headers
    //   res.removeHeader('Content-Encoding')
    //   res.removeHeader('Content-Language')
    //   res.removeHeader('Content-Length')
    //   res.removeHeader('Content-Range')
    //   res.removeHeader('Content-Type')
    return context.setStatus(304)
  }

  return context
}

module.exports.maybeConditionalGetResponse = maybeConditionalGetResponse
