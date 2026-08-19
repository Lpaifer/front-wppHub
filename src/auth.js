const AUTH_TOKEN_KEY = 'wpphub.auth.token'
const AUTH_USER_KEY = 'wpphub.auth.user'
const AUTH_BASE_URL = (import.meta.env.VITE_AUTH_API_BASE_URL || '/api/auth').replace(/\/$/, '')

export function getAuthSession() {
  const token = window.localStorage.getItem(AUTH_TOKEN_KEY)
  if (!token) return null
  const rawUser = window.localStorage.getItem(AUTH_USER_KEY)
  return { token, user: rawUser ? JSON.parse(rawUser) : null }
}

export function authHeaders() {
  const session = getAuthSession()
  return session ? { Authorization: `Bearer ${session.token}` } : {}
}

export async function login(email, password) {
  const response = await fetch(`${AUTH_BASE_URL}/login`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.message || payload?.error || 'Não foi possível entrar.')
  const token = payload?.token || payload?.access_token
  if (!token) throw new Error('O login não retornou um token de acesso.')
  const user = payload?.user || null
  window.localStorage.setItem(AUTH_TOKEN_KEY, token)
  if (user) window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user))
  return { token, user }
}

export function logout() {
  window.localStorage.removeItem(AUTH_TOKEN_KEY)
  window.localStorage.removeItem(AUTH_USER_KEY)
}
