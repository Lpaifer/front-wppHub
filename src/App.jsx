import { useEffect, useRef, useState } from 'react'
import { Check, CheckCheck, MessageCircle, Phone, Search, Send, Wifi, X } from 'lucide-react'
import { ATTENDANT_NAME, cleanPhone, getAccounts, getConversation, normalizeBrazilianPhone, sendMessage } from './api'

function formatPhone(value) {
  const digits = cleanPhone(value).slice(0, 13)
  const local = digits.startsWith('55') ? digits.slice(2) : digits
  const country = digits.startsWith('55') ? '+55 ' : ''
  if (local.length <= 2) return country + local
  const ddd = local.slice(0, 2)
  const number = local.slice(2)
  if (!number) return `${country}(${ddd}`
  const split = number.length > 8 ? 5 : 4
  return `${country}(${ddd}) ${number.slice(0, split)}${number.length > split ? `-${number.slice(split)}` : ''}`
}

function formatContactPhone(value) {
  return formatPhone(normalizeBrazilianPhone(String(value || '')))
}

function formatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date)
}

function StatusIcon({ status }) {
  return ['read', 'seen'].includes(String(status).toLowerCase())
    ? <CheckCheck size={15} aria-label="Lida" />
    : ['delivered'].includes(String(status).toLowerCase())
      ? <CheckCheck size={15} aria-label="Entregue" />
      : <Check size={15} aria-label="Enviada" />
}

function EmptyState({ searched }) {
  return <div className="empty-state">
    <div className="empty-icon"><MessageCircle size={32} /></div>
    <h2>{searched ? 'Nenhuma mensagem encontrada' : 'Consulte uma conversa'}</h2>
    <p>{searched ? 'Não há mensagens vinculadas a este número.' : 'Digite o telefone com DDD para visualizar o histórico de mensagens.'}</p>
  </div>
}

export default function App() {
  const [channel, setChannel] = useState('hub')
  const [phone, setPhone] = useState('')
  const [conversation, setConversation] = useState(null)
  const [account, setAccount] = useState(null)
  const [accounts, setAccounts] = useState([])
  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const controllerRef = useRef(null)
  const bottomRef = useRef(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [conversation])
  useEffect(() => () => controllerRef.current?.abort(), [])
  useEffect(() => {
    const controller = new AbortController()
    setLoadingAccounts(true)
    getAccounts(channel, controller.signal)
      .then((items) => {
        setAccounts(items)
        setAccount(items.find((item) => item.conectado || item.whatsapp_ativo) || items[0] || null)
      })
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message) })
      .finally(() => { if (!controller.signal.aborted) setLoadingAccounts(false) })
    return () => controller.abort()
  }, [channel])

  async function resolveAccount(signal) {
    if (account) return account
    const accounts = await getAccounts(channel, signal)
    const selected = accounts.find((item) => item.conectado || item.whatsapp_ativo) || accounts[0]
    if (!selected) throw new Error('A chave não possui contas do WhatsApp disponíveis.')
    setAccount(selected)
    return selected
  }

  async function handleSearch(event) {
    event.preventDefault()
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setLoading(true)
    setError('')
    setSendError('')
    try {
      const selectedAccount = await resolveAccount(controller.signal)
      setConversation(await getConversation(channel, phone, selectedAccount.id, controller.signal))
    } catch (err) {
      if (err.name !== 'AbortError') { setConversation(null); setError(err.message) }
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }

  async function handleSend(event) {
    event.preventDefault()
    if (!conversation || sending || !draft.trim()) return
    const text = draft.trim()
    setSending(true)
    setSendError('')
    try {
      const selectedAccount = await resolveAccount()
      const result = await sendMessage({ channel, phone: conversation.contact.phone, accountId: selectedAccount.id, text, attendant: ATTENDANT_NAME })
      setConversation((current) => ({
        ...current,
        messages: [...current.messages, {
          id: result.message_id || result.wa_message_id || `local-${Date.now()}`,
          direction: 'outbound',
          text,
          timestamp: new Date().toISOString(),
          status: 'sent',
        }],
      }))
      setDraft('')
    } catch (err) {
      setSendError(err.message)
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

  function changeChannel(nextChannel) {
    controllerRef.current?.abort()
    setChannel(nextChannel)
    setAccount(null)
    setAccounts([])
    setConversation(null)
    setError('')
    setSendError('')
    setDraft('')
  }

  const messages = conversation?.messages || []
  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark"><MessageCircle size={24} /></span><span>Wpp<span>Hub</span></span></div>
      <div className={`connection ${account && account.conectado === false ? 'offline' : ''}`}><Wifi size={15} /><span>{account?.name || 'WhatsApp Hub'}</span></div>
    </header>

    <main>
      <section className="intro">
        <span className="eyebrow">Central de atendimento</span>
        <h1>Histórico de conversas</h1>
        <p>Encontre rapidamente todas as mensagens vinculadas a um contato.</p>
        <div className="channel-picker" role="group" aria-label="Canal do WhatsApp">
          <button type="button" className={channel === 'hub' ? 'active' : ''} onClick={() => changeChannel('hub')}><span>Hub</span><small>Evolution · não oficial</small></button>
          <button type="button" className={channel === 'official' ? 'active official' : ''} onClick={() => changeChannel('official')}><span>Oficial</span><small>Meta Cloud API</small></button>
        </div>
        <div className="account-picker">
          <label htmlFor="account">Conta / setor</label>
          <select id="account" value={account?.id ?? ''} onChange={(event) => {
            const selected = accounts.find((item) => String(item.id) === event.target.value) || null
            setAccount(selected)
            setConversation(null)
            setSendError('')
          }} disabled={loadingAccounts || !accounts.length}>
            {loadingAccounts && <option value="">Carregando contas...</option>}
            {!loadingAccounts && !accounts.length && <option value="">Nenhuma conta disponível</option>}
            {accounts.map((item) => <option value={item.id} key={item.id}>{item.name}{item.conectado === false || item.whatsapp_ativo === false ? ' · inativa' : ''}</option>)}
          </select>
        </div>
        <form className="search-form" onSubmit={handleSearch}>
          <label htmlFor="phone">Número do WhatsApp</label>
          <div className="search-row">
            <div className="input-wrap"><Phone size={19} /><input id="phone" value={phone} onChange={(event) => setPhone(formatPhone(event.target.value))} placeholder="(11) 99999-9999" inputMode="tel" autoComplete="tel" /><span className="country">BR</span></div>
            <button type="submit" disabled={loading}><Search size={18} />{loading ? 'Buscando...' : 'Buscar conversa'}</button>
          </div>
          {error && <div className="error" role="alert"><X size={16} />{error}</div>}
        </form>
      </section>

      <section className={`conversation-card ${loading ? 'is-loading' : ''}`} aria-busy={loading}>
        {conversation && <div className="contact-bar">
          <div className="avatar">{conversation.contact.avatar ? <img src={conversation.contact.avatar} alt="" /> : conversation.contact.name.charAt(0).toUpperCase()}</div>
          <div><strong>{conversation.contact.name}</strong><span>{formatContactPhone(conversation.contact.phone)}</span></div>
          <span className={`channel-badge ${channel}`}>{channel === 'official' ? 'Meta · Oficial' : 'Hub · Evolution'}</span>
          <span className="message-count">{messages.length} {messages.length === 1 ? 'mensagem' : 'mensagens'}</span>
        </div>}
        <div className="messages">
          {loading ? <div className="loader"><span /><p>Procurando mensagens...</p></div> : messages.length ? <>
            <div className="date-chip">Hoje</div>
            {messages.map((message) => <div className={`message-row ${message.direction}`} key={message.id}>
              <div className="bubble"><p>{message.text || 'Mensagem sem conteúdo textual'}</p><span className="meta">{formatTime(message.timestamp)}{message.direction === 'outbound' && <StatusIcon status={message.status} />}</span></div>
            </div>)}
            <div ref={bottomRef} />
          </> : <EmptyState searched={Boolean(conversation)} />}
        </div>
        {conversation && <form className="composer" onSubmit={handleSend}>
          {channel === 'official' && conversation.windowOpen === false && <div className="window-warning">Janela de 24 horas encerrada. Aguarde o contato enviar uma nova mensagem para responder.</div>}
          {sendError && <div className="send-error" role="alert"><X size={14} />{sendError}</div>}
          <div className="composer-row">
            <textarea value={draft} onChange={(event) => setDraft(event.target.value.slice(0, 4096))} onKeyDown={handleDraftKeyDown} placeholder={channel === 'official' && conversation.windowOpen === false ? 'Envio indisponível fora da janela de 24h' : 'Digite uma mensagem'} aria-label="Mensagem" rows="1" disabled={sending || (channel === 'official' && conversation.windowOpen === false)} />
            <span className={`char-count ${draft.length > 3900 ? 'near-limit' : ''}`}>{draft.length}/4096</span>
            <button type="submit" disabled={sending || !draft.trim() || (channel === 'official' && conversation.windowOpen === false)} aria-label="Enviar mensagem"><Send size={19} /></button>
          </div>
          <span className="send-hint">Enter para enviar · Shift + Enter para quebrar linha</span>
        </form>}
      </section>
    </main>
    <footer>WppHub <span>•</span> Consulta segura de conversas</footer>
  </div>
}
