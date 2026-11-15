export default {
  experimental: { proxyClientMaxBodySize: '16mb' },
  async rewrites() {
    const apiOrigin = (process.env.API_ORIGIN || 'http://127.0.0.1:4000').replace(/\/+$/, '')
    return [{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }]
  },
}
