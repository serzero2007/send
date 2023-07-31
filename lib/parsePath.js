const path = require('node:path')
const decode = require('fast-decode-uri-component')

const join = path.join
const normalize = path.normalize
const sep = path.sep
const resolve = path.resolve

const UP_PATH_REGEXP = /(?:^|[\\/])\.\.(?:[\\/]|$)/

function parsePath (_path, root) {
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

  return { parts, path }
}

module.exports.parsePath = parsePath