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

async function getStatAndPath (_path, { extensions }) {
  try {
    const stat = await fsPromise.stat(_path)
    const path = _path
    return { stat, path }
  } catch (error) {
    if (error.code === 'ENOENT' && !extname(_path) && _path[_path.length - 1] !== sep) {
      for (const extension of extensions) {
        try {
          const path = _path + '.' + extension
          const stat = await fsPromise.stat(path)
          if (stat.isDirectory()) continue
          return { path, stat }
        } catch (error) {
          continue
        }
      }
      return { status: 404 }
    }

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
}

module.exports.getStatAndPath = getStatAndPath
