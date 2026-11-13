import { createApp } from './app.js'
import { createPool } from './database.js'
import { paymentGateway } from './payment.js'

const pool = createPool()
const port = Number(process.env.API_PORT || 4000)
const server = createApp({ pool, gateway: paymentGateway(process.env) }).listen(port, '127.0.0.1', () => {
  console.log(`BayanFlow API listening on http://127.0.0.1:${port}`)
})
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => pool.end()))
}
