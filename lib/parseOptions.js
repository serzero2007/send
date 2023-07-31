/*!
 * send
 * Copyright(c) 2012 TJ Holowaychuk
 * Copyright(c) 2014-2022 Douglas Christopher Wilson
 * Copyright(c) 2023 Feanorx
 * MIT Licensed
 */
'use strict'
const { normalizeList } = require('./normalizeList')
const ms = require('@lukeed/ms')

const path = require('node:path')
const resolve = path.resolve

const validDotFilesOptions = [
  'allow',
  'ignore',
  'deny'
]

/**
 * Maximum value allowed for the max age.
 * @private
 */

const MAX_MAXAGE = 60 * 60 * 24 * 365 * 1000 // 1 year

function parseMaxAge (value) {
  let maxage
  if (typeof value === 'string') {
    maxage = ms.parse(value)
  } else {
    maxage = Number(value)
  }

  // fast path of isNaN(number)
  // eslint-disable-next-line no-self-compare
  if (maxage !== maxage) {
    return 0
  }

  return Math.min(Math.max(0, maxage), MAX_MAXAGE)
}

function parseOptions (options = {}) {
  const acceptRanges = options.acceptRanges !== undefined
    ? Boolean(options.acceptRanges)
    : true

  const cacheControl = options.cacheControl !== undefined
    ? Boolean(options.cacheControl)
    : true

  const etag = options.etag !== undefined
    ? Boolean(options.etag)
    : true

  const dotfiles = options.dotfiles !== undefined
    ? validDotFilesOptions.indexOf(options.dotfiles)
    : 1

  if (dotfiles === -1) {
    throw new TypeError('dotfiles option must be "allow", "deny", or "ignore"')
  }

  const extensions = options.extensions !== undefined
    ? normalizeList(options.extensions, 'extensions option')
    : []

  const immutable = options.immutable !== undefined
    ? Boolean(options.immutable)
    : true

  const index = options.index !== undefined
    ? normalizeList(options.index, 'index option')
    : ['index.html']

  const lastModified = options.lastModified !== undefined
    ? Boolean(options.lastModified)
    : true

  const maxage = parseMaxAge(options.maxAge || options.maxage)

  const root = options.root
    ? resolve(options.root)
    : null

  const start = options.start || 0
  const end = options.end

  return {
    acceptRanges,
    cacheControl,
    etag,
    dotfiles,
    extensions,
    immutable,
    index,
    lastModified,
    maxage,
    root,
    start,
    end
  }
}

module.exports.parseOptions = parseOptions
