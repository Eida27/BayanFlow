import { createApp } from './app.js'
import { createPool } from './database.js'
import { paymentGateway } from './payment.js'

const pool = createPool()
const port = Number(process.env.PORT || process.env.API_PORT || 4000)
const host = process.env.PORT ? '0.0.0.0' : '127.0.0.1'
const server = createApp({ pool, gateway: paymentGateway(process.env) }).listen(port, host, () => {
  console.log(`BayanFlow API listening on http://${host}:${port}`)
})
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => pool.end()))
}
