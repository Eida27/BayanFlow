import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

export const digest = token => createHash('sha256').update(token).digest('hex')

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`
}

export function passwordMatches(password, stored) {
  const [salt, expected] = stored.split(':')
  return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(expected, 'hex'))
}
