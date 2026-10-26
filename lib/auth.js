import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'edumaster-default-secret'

export async function hashPassword(p) {
  return bcrypt.hash(p, 10)
}
export async function verifyPassword(p, hash) {
  return bcrypt.compare(p, hash)
}
export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' })
}
export function verifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET) } catch { return null }
}
export function getUser(request) {
  const auth = request.headers.get('authorization') || ''
  if (!auth.startsWith('Bearer ')) return null
  return verifyToken(auth.slice(7))
}
