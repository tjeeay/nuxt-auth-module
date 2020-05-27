import path from 'path'

const defaults = {
  identifier: 'authOptions',
  middleware: 'auth',
  routePaths: [],
  forceRedirect: true,
  loginUrl: '/login',
  returnUrl: '',
  returnUrlKey: 'returnUrl',
  sessionKey: 'SESSION_ID',
  formatter(sessionId) {
    if (sessionId[0] === '{' && sessionId[sessionId.length - 1] === '}') {
      try {
        return JSON.parse(sessionId).value
      } catch {
        /* eslint-disable-next-line */
        console.warn(`failed to parse sessionId: ${sessionId}`)
      }
    }
    return sessionId
  },
}

export default function(moduleOptions) {
  const options = {
    ...defaults,
    ...moduleOptions,
    ...this.options.auth,
  }

  this.options.router = this.options.router || {}
  let middleware = this.options.router.middleware || []
  if (typeof middleware === 'string') {
    middleware = [middleware]
  }

  if (!middleware.includes(options.middleware)) {
    middleware.push(options.middleware)
    this.options.router.middleware = middleware
  }

  // add serverMiddleware: handle session info
  this.addServerMiddleware(function(req, res, next) {
    req.$session = req.$session || {}
    const cookies = (req.headers.cookie || '').split('; ')

    const sessionPart = cookies.find(
      c => c.split('=')[0] === options.sessionKey,
    )

    if (sessionPart) {
      const sessionId = decodeURIComponent(sessionPart.split('=')[1] || '')
      req.$session.sessionId = sessionId

      if (typeof options.formatter === 'function') {
        req.$session.sessionId = options.formatter(sessionId)
      }
    }

    next()
  })

  if (typeof options.routePaths === 'string') {
    options.routePaths = [options.routePaths]
  }

  const pluginOptions = {
    identifier: options.identifier,
    middleware: options.middleware,
    routePaths: options.routePaths,
    forceRedirect: options.forceRedirect,
    loginUrl: options.loginUrl,
    returnUrl: options.returnUrl,
    returnUrlKey: options.returnUrlKey,
    fetchAuthTokenAction: options.fetchAuthTokenAction,
    setAuthTokenAction: options.setAuthTokenAction,
    refreshTokenAction: options.refreshTokenAction,
    clearAuthTokenAction: options.clearAuthTokenAction,
    checkIsLoggedInAction: options.checkIsLoggedInAction,
  }

  const fileName = 'generated.plugin.auth.js'

  // add plugin:
  //  1. preset/refresh token before axios request
  //  2. set global auth middleware, and extend router.middleware
  this.addPlugin({
    src: path.resolve(__dirname, 'plugin.template'),
    fileName,
    options: pluginOptions,
  })

  this.requireModule(['@nuxtjs/axios'])

  // extend plugins order: auth plugin must after axios plugin
  const originExtendPlugins = this.options.extendPlugins || (plugins => plugins)
  this.options.extendPlugins = function(plugins) {
    const newPlugins = originExtendPlugins(plugins)

    const axiosIndex = newPlugins.findIndex(p => (p.src || p).endsWith('axios.js'))
    const authIndex = newPlugins.findIndex(p => (p.src || p).endsWith(fileName))

    if (axiosIndex > authIndex) {
      const authPlugin = newPlugins[authIndex]

      // auth plugin must after axios plugin
      newPlugins.splice(authIndex, 1)
      newPlugins.splice(axiosIndex, 0, authPlugin)
    }

    return newPlugins
  }
}

module.exports.meta = require('../package.json')
