export default {
  experimental: { proxyClientMaxBodySize: '16mb' },
  async rewrites() {
    return [{ source: '/api/:path*', destination: 'http://127.0.0.1:4000/api/:path*' }]
  },
}
