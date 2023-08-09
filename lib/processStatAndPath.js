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

const STAT_ERROR_CODE = Symbol('StatErrorCode')

async function tryStat (context, path, allowDirectory = false) {
  context[STAT_ERROR_CODE] = undefined
  try {
    const stat = await fsPromise.stat(path)
    if (!allowDirectory && stat.isDirectory()) {
      return false
    }
    context.path = path
    context.stat = stat
    return true
  } catch (error) {
    context[STAT_ERROR_CODE] = error.code
    return false
  }
}

async function getStatAndPathIndex (context) {
  const originalPath = context.path
  for (const filename of context.options.index) {
    const path = join(originalPath, filename)
    if (await tryStat(context, path)) return
  }
  context.status = 404
}

async function processStatAndPath (context) {
  await tryStat(context, context.path, true)

  if (context.stat && hasTrailingSlash(context.path) && context.stat.isDirectory()) {
    await getStatAndPathIndex(context)
    return
  }

  const code = context[STAT_ERROR_CODE]
  if (!code) return

  if (code === 'ENOENT' && !extname(context.path) && context.path[context.path.length - 1] !== sep) {
    for (const extension of context.options.extensions) {
      const _path = context.path + '.' + extension
      if (await tryStat(context, _path)) return
    }
  }

  // POSIX throws ENAMETOOLONG and ENOTDIR, Windows only ENOENT
  /* istanbul ignore next */
  switch (code) {
    case 'ENAMETOOLONG':
    case 'ENOTDIR':
    case 'ENOENT':
      context.status = 404
      break
    default:
      context.status = 500
  }
}

module.exports.processStatAndPath = processStatAndPath
