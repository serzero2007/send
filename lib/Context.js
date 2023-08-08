const mime = require('mime')
const { isUtf8MimeType } = require('./isUtf8MimeType')
const { parseOptions } = require('./parseOptions')

function getContentType (path) {
  // TODO: Move default type to options?
  let type = mime.getType(path) || mime.default_type
  if (type && isUtf8MimeType(type)) {
    type += '; charset=UTF-8'
  }
  return type
}

// adjust len to start/end options
function adjustLengthToStartEndOptions (stat, options) {
  let len = Math.max(0, stat.size - options.start)
  if (options.end !== undefined) {
    const bytes = options.end - options.start + 1
    if (len > bytes) len = bytes
  }
  return len
}

class ResponseContext {
  static fromRawOptions (raw) {
    const options = parseOptions(raw)
    return new ResponseContext(options)
  }

  path = undefined
  status = undefined
  range = undefined
  stat = undefined
  stream = null
  headers = {}

  constructor (options) {
    this.options = options
  }

  get finished () {
    return this.status !== undefined
  }

  get type () {
    return getContentType(this.path)
  }

  get contentLength () {
    return adjustLengthToStartEndOptions(this.stat, this.options)
  }

  get modified () {
    return this.stat.mtime.toUTCString()
  }

  get etag () {
    return 'W/"' + this.stat.size.toString(16) + '-' + this.stat.mtime.getTime().toString(16) + '"'
  }

  setStatus (status) {
    this.status = status
    return this
  }

  setPath (path) {
    this.path = path
    return this
  }

  setStat (stat) {
    this.stat = stat
    return this
  }

  setRange (range) {
    this.range = range
    return this
  }

  setStream (stream) {
    this.stream = stream
    return this
  }

  get response () {
    return {
      status: this.status,
      headers: this.headers,
      stream: this.stream
    }
  }
}

module.exports.ResponseContext = ResponseContext
