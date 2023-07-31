const path = require('node:path')
const decode = require('fast-decode-uri-component')
const debug = require('node:util').debuglog('send')
const { containsDotFile } = require('./containsDotFile')

const join = path.join
const normalize = path.normalize
const sep = path.sep
const resolve = path.resolve

/**
 * Regular expression to match a path with a directory up component.
 * @private
 */
const UP_PATH_REGEXP = /(?:^|[\\/])\.\.(?:[\\/]|$)/

function parsePath (_path, { root, dotfiles }) {
  let path = decode(_path)
  if (path === null) {
    return { path: null, status: 400 }
  }

  // null byte(s)
  if (~path.indexOf('\0')) {
    return { path: null, status: 400 }
  }

  if (root !== null && path) {
    path = normalize('.' + sep + path)
  }

  // malicious path
  if (UP_PATH_REGEXP.test(path)) {
    debug('malicious path "%s"', path)
    return { path: null, status: 403 }
  }

  if (root === null) {
    path = normalize(path)
  }

  const parts = path.split(sep)

  if (root !== null) {
    // join / normalize from optional root dir
    path = normalize(join(root, path))
  } else {
    // resolve the path
    path = resolve(path)
  }

  if (dotfiles !== 0 && containsDotFile(parts)) {
    switch (dotfiles) {
      case 2: {
        // 'deny'
        debug('deny dotfile "%s"', path)
        return { path: null, status: 403 }
      }
      case 1: {
        // 'ignore'
        debug('ignore dotfile "%s"', path)
        return { path: null, status: 404 }
      }
      default:
        throw Error('Unexpected behaviour')
    }
  }

  return { parts, path }
}

module.exports.parsePath = parsePath
