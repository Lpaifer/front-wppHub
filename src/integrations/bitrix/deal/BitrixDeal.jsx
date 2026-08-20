import { useEffect, useMemo, useRef, useState } from 'react'
import { LogOut, MessageCircle, Send, X } from 'lucide-react'
import { authHeaders, getAuthSession, login, logout } from '../../../auth'
import { getBitrixDealContext } from '../../../bitrix'
import { getAccounts, getConversation, normalizeBrazilianPhone, sendMessage } from '../../../api'

const CHANNEL_LABELS = { hub: 'WhatsApp Hub', official: 'API Oficial' }

async function getConversationLink(dealId, signal) {
  const response = await fetch(`/api/bitrix/deals/${encodeURIComponent(dealId)}/conversation`, { signal, headers: { Accept: 'application/json', ...authHeaders() } })
  if (!response.ok) throw new Error('Não foi possível carregar o vínculo da conversa.')
  return (await response.json()).conversation
}

async function saveConversationLink(dealId, payload) {
  const response = await fetch(`/api/bitrix/deals/${encodeURIComponent(dealId)}/conversation`, {
    method: 'PUT',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error('A conversa foi enviada, mas o vínculo com o negócio não pôde ser salvo.')
  return (await response.json()).conversation
}

function formatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date)
}

function accountLabel(account) {
  return account?.name || account?.nome || account?.numero || account?.phone || `Dispositivo ${account?.id || ''}`
}

function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const session = await login(email, password)
      onLogin(session)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return <main className="bitrix-page bitrix-login-page">
    <section className="bitrix-login-panel">
      <span className="bitrix-brand"><MessageCircle size={19} />WppHub</span>
      <h1>Acesse suas conversas</h1>
      <p>Entre para abrir a mensageria deste negócio.</p>
      <form onSubmit={handleSubmit} className="bitrix-login-form">
        <label htmlFor="bitrix-email">E-mail</label>
        <input id="bitrix-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required />
        <label htmlFor="bitrix-password">Senha</label>
        <input id="bitrix-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
        {error && <div className="error" role="alert"><X size={15} />{error}</div>}
        <button type="submit" disabled={loading}>{loading ? 'Entrando...' : 'Entrar'}</button>
      </form>
    </section>
  </main>
}

function MessageList({ conversation }) {
  const messagesRef = useRef(null)

  useEffect(() => {
    const element = messagesRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [conversation.messages.length])

  return <div className="messages bitrix-messages" ref={messagesRef}>
    {!conversation.messages.length && <div className="empty-state"><div className="empty-icon"><MessageCircle size={28} /></div><h2>Nenhuma mensagem ainda</h2><p>A primeira mensagem enviada criará a conversa neste dispositivo.</p></div>}
    {conversation.messages.map((message) => <div className={`message-row ${message.direction}`} key={message.id}>
      <div className="bubble"><p>{message.text || 'Mensagem sem conteúdo textual'}</p><span className="meta">{formatTime(message.timestamp)}</span></div>
    </div>)}
  </div>
}

export default function BitrixDeal() {
  const [session, setSession] = useState(() => getAuthSession())
  const [context, setContext] = useState(null)
  const [channels, setChannels] = useState({ hub: [], official: [] })
  const [channel, setChannel] = useState('hub')
  const [accountId, setAccountId] = useState('')
  const [conversation, setConversation] = useState(null)
  const [lockedAccount, setLockedAccount] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')

  const selectedAccount = useMemo(() => channels[channel].find((account) => String(account.id) === String(accountId)) || null, [accountId, channel, channels])
  const activeAccount = lockedAccount || selectedAccount

  useEffect(() => {
    if (!session) return undefined
    const controller = new AbortController()
    async function load() {
      try {
        const dealContext = await getBitrixDealContext()
        const channelResults = await Promise.allSettled(['hub', 'official'].map(async (item) => [item, await getAccounts(item, controller.signal)]))
        const available = { hub: [], official: [] }
        channelResults.forEach((result) => {
          if (result.status === 'fulfilled') available[result.value[0]] = result.value[1]
        })
        if (controller.signal.aborted) return
        setContext(dealContext)
        setChannels(available)
        const phone = normalizeBrazilianPhone(dealContext.phone)
        if (!/^55\d{10,11}$/.test(phone)) throw new Error('O contato do negócio não possui um telefone brasileiro válido.')
        const linked = await getConversationLink(dealContext.dealId, controller.signal)
        const lookups = []
        if (linked) {
          const linkedAccount = available[linked.channel]?.find((account) => String(account.id) === String(linked.accountId))
          if (!linkedAccount) throw new Error('O dispositivo vinculado a este negócio não está disponível.')
          lookups.push({ channel: linked.channel, account: linkedAccount })
        } else {
          for (const item of ['hub', 'official']) {
            for (const account of available[item]) lookups.push({ channel: item, account })
          }
        }
        const histories = await Promise.allSettled(lookups.map(async (lookup) => ({ ...lookup, conversation: await getConversation(lookup.channel, phone, lookup.account.id, controller.signal) })))
        const found = histories
          .filter((result) => result.status === 'fulfilled' && result.value.conversation.messages.length)
          .map((result) => result.value)
          .sort((first, second) => new Date(second.conversation.messages.at(-1)?.timestamp).getTime() - new Date(first.conversation.messages.at(-1)?.timestamp).getTime())
        if (found.length || linked) {
          const selected = found[0] || {
            channel: linked.channel,
            account: available[linked.channel].find((account) => String(account.id) === String(linked.accountId)),
            conversation: { contact: { name: dealContext.contactName || 'Contato', phone }, messages: [] },
          }
          setConversation(selected.conversation)
          setLockedAccount(selected.account)
          setChannel(selected.channel)
          setAccountId(String(selected.account.id))
          if (!linked) {
            await saveConversationLink(dealContext.dealId, {
              contactId: dealContext.contactId,
              phone,
              channel: selected.channel,
              accountId: selected.account.id,
            })
          }
        } else {
          const firstChannel = available.hub.length ? 'hub' : 'official'
          setChannel(firstChannel)
          setAccountId(String(available[firstChannel][0]?.id || ''))
          setConversation({ contact: { name: dealContext.contactName || 'Contato', phone }, messages: [] })
        }
      } catch (err) {
        if (err.name !== 'AbortError') setError(err.message)
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    load()
    return () => controller.abort()
  }, [session])

  async function handleSend(event) {
    event.preventDefault()
    if (!activeAccount || !conversation || !draft.trim() || sending) return
    const text = draft.trim()
    setSending(true)
    setError('')
    try {
      const result = await sendMessage({ channel, phone: conversation.contact.phone, accountId: activeAccount.id, text }, undefined)
      await saveConversationLink(context.dealId, {
        contactId: context.contactId,
        phone: conversation.contact.phone,
        channel,
        accountId: activeAccount.id,
        conversationId: result.conversation_id || result.conversationId || null,
      })
      const message = { id: result.message_id || `local-${Date.now()}`, direction: 'outbound', text, timestamp: new Date().toISOString(), status: 'sent' }
      setConversation((current) => ({ ...current, messages: [...current.messages, message] }))
      setLockedAccount(activeAccount)
      setDraft('')
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  function handleDraftKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSend(event)
    }
  }

  if (!session) return <LoginScreen onLogin={setSession} />
  if (loading) return <main className="bitrix-page"><div className="loader"><span /><p>Carregando negócio e conversa...</p></div></main>
  if (error && !context) return <main className="bitrix-page"><div className="empty-state"><div className="empty-icon"><X size={28} /></div><h2>Não foi possível carregar este Deal</h2><p>{error}</p></div></main>

  return <main className="bitrix-page">
    <header className="bitrix-header">
      <div><span className="eyebrow">Negócio Bitrix24</span><h1>{context?.dealTitle || 'Conversas do negócio'}</h1><p>{context?.contactName || 'Contato'} · {conversation?.contact.phone}</p></div>
      <button className="bitrix-logout" type="button" onClick={() => { logout(); setSession(null) }}><LogOut size={15} />Sair</button>
    </header>
    <section className="bitrix-conversation">
      <div className="bitrix-conversation-bar">
        <div><strong>{lockedAccount ? 'Dispositivo da conversa' : 'Escolha onde iniciar'}</strong><span>{activeAccount ? accountLabel(activeAccount) : 'Nenhum dispositivo disponível'}</span></div>
        {lockedAccount && <small>{CHANNEL_LABELS[channel]} · dispositivo fixado</small>}
        {!lockedAccount && <div className="bitrix-selects"><select value={channel} onChange={(event) => { setChannel(event.target.value); setAccountId(String(channels[event.target.value][0]?.id || '')) }}><option value="hub">WhatsApp Hub</option><option value="official">API Oficial</option></select><select value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">Selecione o dispositivo</option>{channels[channel].map((account) => <option key={account.id} value={account.id}>{accountLabel(account)}</option>)}</select></div>}
      </div>
      <MessageList conversation={conversation || { messages: [] }} />
      {error && <div className="error bitrix-error" role="alert"><X size={15} />{error}</div>}
      <form className="composer bitrix-composer" onSubmit={handleSend}>
        <div className="composer-row"><textarea value={draft} onChange={(event) => setDraft(event.target.value.slice(0, 4096))} onKeyDown={handleDraftKeyDown} placeholder={activeAccount ? 'Digite sua mensagem...' : 'Selecione um dispositivo para iniciar'} rows="2" disabled={!activeAccount || sending} /><span className="char-count">{draft.length}/4096</span><button type="submit" disabled={!activeAccount || !draft.trim() || sending} aria-label="Enviar mensagem"><Send size={19} /></button></div>
        <span className="send-hint">A primeira mensagem cria a conversa no dispositivo selecionado.</span>
      </form>
    </section>
  </main>
}
