/*!
 * send
 * Copyright(c) 2012 TJ Holowaychuk
 * Copyright(c) 2014-2022 Douglas Christopher Wilson
 * Copyright(c) 2023 Feanorx
 * MIT Licensed
 */

'use strict'

const fsPromise = require('node:fs/promises')
const path = require('node:path')
const extname = path.extname
const sep = path.sep
const join = path.join

function hasTrailingSlash (path) {
  return path[path.length - 1] === '/'
}

async function getStatAndPathIndex (context) {
  for (const filename of context.options.index) {
    try {
      const path = join(context.path, filename)
      const stat = await fsPromise.stat(path)
      if (stat.isDirectory()) continue
      context.setPath(path)
      context.setStat(stat)
      return
    } catch (error) {
      continue
    }
  }
  context.setStatus(404)
}

async function processStatAndPath (context) {
  try {
    const stat = await fsPromise.stat(context.path)

    if (hasTrailingSlash(context.path) && stat.isDirectory()) {
      return getStatAndPathIndex(context)
    }

    context.setStat(stat)
  } catch (error) {
    if (error.code === 'ENOENT' && !extname(context.path) && context.path[context.path.length - 1] !== sep) {
      for (const extension of context.options.extensions) {
        try {
          const _path = context.path + '.' + extension
          const stat = await fsPromise.stat(_path)
          if (stat.isDirectory()) continue
          context.setStat(stat)
          context.setPath(_path)
          return
        } catch (error) {
          continue
        }
      }
      context.setStatus(404)
      return
    }

    // POSIX throws ENAMETOOLONG and ENOTDIR, Windows only ENOENT
    /* istanbul ignore next */
    switch (error.code) {
      case 'ENAMETOOLONG':
      case 'ENOTDIR':
      case 'ENOENT':
        context.setStatus(404)
        return
      default:
        context.setStatus(500)
        return
    }
  }
}

module.exports.processStatAndPath = processStatAndPath
