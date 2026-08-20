import dotenv from 'dotenv'
import cors from 'cors'
import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { neon } from '@neondatabase/serverless'

const app = express()
const serverDirectory = path.dirname(fileURLToPath(import.meta.url))
const frontendDirectory = path.resolve(serverDirectory, '..', 'dist')
dotenv.config({ path: path.join(serverDirectory, '.env') })
const port = Number(process.env.PORT || 3001)
const jwtSecret = process.env.JWT_SECRET
if (!jwtSecret) throw new Error('JWT_SECRET é obrigatório.')

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL é obrigatório.')
const sql = neon(process.env.DATABASE_URL)
const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8')
const schemaStatements = schema
  .split(';')
  .map((statement) => statement.trim())
  .filter(Boolean)
for (const statement of schemaStatements) await sql.query(statement)

if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
  const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12)
  await sql`
    INSERT INTO users (email, password_hash, name)
    VALUES (${process.env.ADMIN_EMAIL.toLowerCase()}, ${passwordHash}, ${process.env.ADMIN_NAME || 'Administrador'})
    ON CONFLICT (email) DO NOTHING
  `
}

app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',').map((origin) => origin.trim()) || true }))
app.use(express.json({ limit: '32kb' }))
app.use(express.urlencoded({ extended: true, limit: '32kb' }))

app.use('/official-api', async (request, response) => {
  const upstream = (process.env.OFFICIAL_API_UPSTREAM_URL || 'https://whatsapp-modelos.andre-51e.workers.dev').replace(/\/$/, '')
  const target = new URL(`${upstream}/api/v1${request.path || '/'}`)
  Object.entries(request.query).forEach(([key, value]) => {
    if (Array.isArray(value)) value.forEach((item) => target.searchParams.append(key, item))
    else if (value != null) target.searchParams.set(key, value)
  })
  const headers = { Accept: request.get('accept') || 'application/json' }
  const token = process.env.OFFICIAL_API_TOKEN || process.env.VITE_OFFICIAL_API_TOKEN
  if (token) headers.Authorization = `Bearer ${token}`
  if (request.get('content-type')) headers['Content-Type'] = request.get('content-type')
  const upstreamResponse = await fetch(target, {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : JSON.stringify(request.body),
  })
  response.status(upstreamResponse.status)
  const contentType = upstreamResponse.headers.get('content-type')
  if (contentType) response.set('Content-Type', contentType)
  response.send(Buffer.from(await upstreamResponse.arrayBuffer()))
})

function issueToken(user) {
  return jwt.sign({ sub: String(user.id), email: user.email, name: user.name }, jwtSecret, { expiresIn: '8h' })
}

function requireAuth(request, response, next) {
  const authorization = request.get('authorization') || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!token) return response.status(401).json({ error: 'Autenticação necessária.' })
  try {
    request.user = jwt.verify(token, jwtSecret)
    return next()
  } catch {
    return response.status(401).json({ error: 'Sessão inválida ou expirada.' })
  }
}

app.post('/api/auth/login', async (request, response) => {
  const email = String(request.body?.email || '').trim().toLowerCase()
  const password = String(request.body?.password || '')
  if (!email || !password) return response.status(400).json({ error: 'E-mail e senha são obrigatórios.' })
  const result = await sql`
    SELECT id, email, name, password_hash, active
    FROM users
    WHERE email = ${email}
  `
  const user = result[0]
  if (!user || !user.active || !(await bcrypt.compare(password, user.password_hash))) {
    return response.status(401).json({ error: 'E-mail ou senha inválidos.' })
  }
  return response.json({ token: issueToken(user), user: { id: user.id, email: user.email, name: user.name } })
})

app.get('/api/bitrix/deals/:dealId/conversation', requireAuth, async (request, response) => {
  const portal = String(request.query.portal || 'unifast.bitrix24.com.br')
  const result = await sql`
    SELECT bitrix_deal_id AS "dealId", bitrix_contact_id AS "contactId", conversation_id AS "conversationId",
           phone, channel, account_id AS "accountId"
    FROM bitrix_conversations
    WHERE bitrix_portal = ${portal} AND bitrix_deal_id = ${request.params.dealId}
  `
  return response.json({ conversation: result[0] || null })
})

app.put('/api/bitrix/deals/:dealId/conversation', requireAuth, async (request, response) => {
  const portal = String(request.body?.portal || 'unifast.bitrix24.com.br')
  const contactId = String(request.body?.contactId || '')
  const phone = String(request.body?.phone || '')
  const channel = String(request.body?.channel || '')
  const accountId = String(request.body?.accountId || '')
  const conversationId = request.body?.conversationId ? String(request.body.conversationId) : null
  if (!contactId || !phone || !channel || !accountId) {
    return response.status(400).json({ error: 'contactId, phone, channel e accountId são obrigatórios.' })
  }
  const result = await sql`
    INSERT INTO bitrix_conversations
      (bitrix_portal, bitrix_deal_id, bitrix_contact_id, conversation_id, phone, channel, account_id, created_by)
    VALUES (${portal}, ${request.params.dealId}, ${contactId}, ${conversationId}, ${phone}, ${channel}, ${accountId}, ${request.user.sub})
    ON CONFLICT (bitrix_portal, bitrix_deal_id) DO UPDATE SET
      bitrix_contact_id = EXCLUDED.bitrix_contact_id,
      conversation_id = COALESCE(EXCLUDED.conversation_id, bitrix_conversations.conversation_id),
      phone = EXCLUDED.phone,
      channel = EXCLUDED.channel,
      account_id = EXCLUDED.account_id,
      updated_at = NOW()
    RETURNING bitrix_deal_id AS "dealId", bitrix_contact_id AS "contactId", conversation_id AS "conversationId",
              phone, channel, account_id AS "accountId"
  `
  return response.json({ conversation: result[0] })
})

app.get('/health', (_request, response) => response.json({ ok: true }))

app.use(express.static(frontendDirectory))
async function sendFrontendWithBitrixContext(request, response) {
  const html = await readFile(path.join(frontendDirectory, 'index.html'), 'utf8')
  const context = JSON.stringify(request.body || {}).replace(/</g, '\\u003c')
  const bootstrap = `<script>window.__BITRIX_PLACEMENT_CONTEXT__=${context}</script>`
  response.type('html').send(html.replace('</head>', `${bootstrap}</head>`))
}

app.post('/integrations/bitrix/deal', sendFrontendWithBitrixContext)
app.post('/integrations/bitrix/install', async (_request, response) => {
  response.sendFile(path.join(frontendDirectory, 'index.html'))
})
app.get(/^(?!\/api(?:\/|$)|\/health$).*/, (_request, response) => {
  response.sendFile(path.join(frontendDirectory, 'index.html'))
})

app.listen(port, () => console.log(`WppHub backend ouvindo em http://localhost:${port}`))
