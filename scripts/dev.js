import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const children = [
  spawn(process.execPath, ['--env-file-if-exists=.env', 'backend/server.js'], { stdio: 'inherit' }),
  spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', 'frontend', '--hostname', '127.0.0.1'], { stdio: 'inherit' })
]
function stop(code) {
  for (const child of children) child.kill()
  process.exitCode = code
}
for (const child of children) {
  child.once('exit', code => stop(code ?? 0))
  child.once('error', error => { console.error(error.message); stop(1) })
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => stop(0))
