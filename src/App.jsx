import { Fragment, useEffect, useRef, useState } from 'react'
import { Check, CheckCheck, ChevronDown, Download, FileText, Image as ImageIcon, Layers3, MessageCircle, Mic, Phone, Search, Send, Wifi, X } from 'lucide-react'
import { ATTENDANT_NAME, cleanPhone, getAccounts, getAttachment, getConversation, normalizeBrazilianPhone, sendMessage } from './api'

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

function formatFileSize(bytes) {
  if (!Number.isFinite(Number(bytes))) return ''
  const size = Number(bytes)
  if (size < 1024) return `${size} B`
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 ** 2).toFixed(1)} MB`
}

function MessageAttachment({ attachment, channel }) {
  const [source, setSource] = useState('')
  const [failed, setFailed] = useState(false)
  const supported = ['image', 'audio', 'document'].includes(attachment?.type)
  const AttachmentIcon = attachment?.type === 'audio' ? Mic : attachment?.type === 'document' ? FileText : ImageIcon
  const label = attachment?.type === 'audio' ? 'áudio' : attachment?.type === 'document' ? 'documento' : 'imagem'
  const capitalizedLabel = `${label.charAt(0).toUpperCase()}${label.slice(1)}`

  useEffect(() => {
    if (!supported || !attachment.url || attachment.ready === false) return undefined
    const controller = new AbortController()
    let objectUrl = ''
    setSource('')
    setFailed(false)
    getAttachment(channel, attachment.url, controller.signal)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob)
        setSource(objectUrl)
      })
      .catch((err) => { if (err.name !== 'AbortError') setFailed(true) })
    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [attachment?.ready, attachment?.url, channel, supported])

  if (!supported) return null
  if (attachment.ready === false) return <div className="attachment-state"><AttachmentIcon size={18} />{capitalizedLabel} sendo processad{label === 'imagem' ? 'a' : 'o'}...</div>
  if (!attachment.url) return <div className="attachment-state error-state"><AttachmentIcon size={18} />{capitalizedLabel} sem URL disponível.</div>
  if (failed) return <div className="attachment-state error-state"><AttachmentIcon size={18} />Não foi possível carregar o {label}.</div>
  if (!source) return <div className="attachment-state"><AttachmentIcon size={18} />Carregando {label}...</div>
  if (attachment.type === 'audio') return <figure className="message-attachment message-audio">
    <div className="audio-label"><Mic size={17} /><span>{attachment.name || 'Mensagem de áudio'}</span></div>
    <audio src={source} controls preload="metadata">Seu navegador não suporta reprodução de áudio.</audio>
    <a href={source} download={attachment.name || 'audio.ogg'} aria-label="Baixar áudio"><Download size={15} />Baixar</a>
  </figure>
  if (attachment.type === 'document') return <figure className="message-attachment message-document">
    <FileText size={30} />
    <figcaption>
      <strong>{attachment.name || 'Documento'}</strong>
      <span>{[formatFileSize(attachment.bytes), attachment.mime].filter(Boolean).join(' · ')}</span>
    </figcaption>
    <a href={source} download={attachment.name || 'documento'} aria-label="Baixar documento"><Download size={16} />Baixar</a>
  </figure>
  return <figure className="message-attachment">
    <img src={source} alt={attachment.name || 'Imagem enviada na conversa'} loading="lazy" />
    <a href={source} download={attachment.name || 'imagem'} aria-label="Baixar imagem"><Download size={15} />Baixar</a>
  </figure>
}

function mergeConversation(current, incoming) {
  if (!current) return incoming
  const unmatchedIncoming = [...incoming.messages]
  const currentMessages = current.messages.filter((message) => {
    if (!message.optimistic) return true
    const matchingIndex = unmatchedIncoming.findIndex((candidate) => (
      candidate.direction === 'outbound' && candidate.text === message.text
    ))
    if (matchingIndex === -1) return true
    unmatchedIncoming.splice(matchingIndex, 1)
    return false
  })
  const messagesById = new Map(currentMessages.map((message) => [message.id, message]))
  incoming.messages.forEach((message) => messagesById.set(message.id, message))
  const messages = [...messagesById.values()].sort((a, b) => {
    const first = new Date(a.timestamp).getTime()
    const second = new Date(b.timestamp).getTime()
    if (Number.isNaN(first) && Number.isNaN(second)) return 0
    if (Number.isNaN(first)) return 1
    if (Number.isNaN(second)) return -1
    return first - second
  })
  const incomingName = incoming.contact?.name
  return {
    ...current,
    ...incoming,
    contact: {
      ...current.contact,
      ...incoming.contact,
      name: !incomingName || incomingName === 'Contato' ? current.contact.name : incomingName,
    },
    messages,
    windowOpen: incoming.windowOpen ?? current.windowOpen,
  }
}

function threadActivity(thread) {
  return thread.conversation.messages.reduce((latest, message) => {
    const timestamp = new Date(message.timestamp).getTime()
    return Number.isNaN(timestamp) ? latest : Math.max(latest, timestamp)
  }, 0)
}

function formatDateLabel(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Sem data'
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const key = date.toDateString()
  if (key === today.toDateString()) return 'Hoje'
  if (key === yesterday.toDateString()) return 'Ontem'
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

function messagePreview(message) {
  if (message?.attachment?.type === 'image') return '🖼️ Imagem'
  if (message?.attachment?.type === 'audio') return '🎤 Áudio'
  if (message?.attachment?.type === 'document') return `📄 ${message.attachment.name || 'Documento'}`
  return message?.text || 'Mensagem sem conteúdo textual'
}

function LinkifiedText({ text }) {
  if (!text) return null
  const parts = text.split(/((?:https?:\/\/|www\.)[^\s]+)/gi)
  return parts.map((part, index) => {
    if (!/^(?:https?:\/\/|www\.)/i.test(part)) return <Fragment key={`${index}-${part}`}>{part}</Fragment>
    const trailingPunctuation = part.match(/[),.;!?]+$/)?.[0] || ''
    const visibleUrl = trailingPunctuation ? part.slice(0, -trailingPunctuation.length) : part
    const href = /^www\./i.test(visibleUrl) ? `https://${visibleUrl}` : visibleUrl
    return <Fragment key={`${index}-${part}`}>
      <a className="message-link" href={href} target="_blank" rel="noopener noreferrer">{visibleUrl}</a>
      {trailingPunctuation}
    </Fragment>
  })
}

function ConversationMessages({ thread, messagesRef }) {
  const messages = thread.conversation.messages
  return <div className="messages thread-messages" ref={messagesRef}>
    {messages.map((message, index) => {
      const currentDay = formatDateLabel(message.timestamp)
      const previousDay = index ? formatDateLabel(messages[index - 1].timestamp) : ''
      return <Fragment key={message.id}>
        {currentDay !== previousDay && <div className="date-chip">{currentDay}</div>}
        <div className={`message-row ${message.direction}`}>
          <div className="bubble">
            {message.attachment && <MessageAttachment attachment={message.attachment} channel={thread.channel} />}
            <p><LinkifiedText text={message.text || (message.attachment ? '' : 'Mensagem sem conteúdo textual')} /></p>
            <span className="meta">{formatTime(message.timestamp)}{message.direction === 'outbound' && <StatusIcon status={message.status} />}</span>
          </div>
        </div>
      </Fragment>
    })}
  </div>
}

export default function App() {
  const [phone, setPhone] = useState('')
  const [threads, setThreads] = useState([])
  const [expandedThreadId, setExpandedThreadId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [partialErrors, setPartialErrors] = useState([])
  const [searched, setSearched] = useState(false)
  const [searchStats, setSearchStats] = useState(null)
  const [drafts, setDrafts] = useState({})
  const [sendingThreadId, setSendingThreadId] = useState('')
  const [sendErrors, setSendErrors] = useState({})
  const controllerRef = useRef(null)
  const messagesRef = useRef(null)
  const threadsRef = useRef([])
  const composerRef = useRef(null)
  const expandedThread = threads.find((thread) => thread.id === expandedThreadId) || null

  useEffect(() => {
    const messagesElement = messagesRef.current
    if (messagesElement) messagesElement.scrollTo({ top: messagesElement.scrollHeight, behavior: 'smooth' })
  }, [expandedThreadId, expandedThread?.conversation.messages.length])
  useEffect(() => { threadsRef.current = threads }, [threads])
  useEffect(() => () => controllerRef.current?.abort(), [])

  useEffect(() => {
    if (!expandedThread) return undefined
    const { channel, account, conversation } = expandedThread

    let refreshing = false
    let refreshController = null
    const refreshConversation = async () => {
      if (refreshing || document.hidden) return
      refreshing = true
      refreshController = new AbortController()
      try {
        const currentThread = threadsRef.current.find((thread) => thread.id === expandedThreadId)
        if (!currentThread) return
        const messagesWithTimestamp = currentThread.conversation.messages.filter((message) => message.timestamp)
        const since = messagesWithTimestamp.at(-1)?.timestamp || ''
        const incoming = await getConversation(channel, conversation.contact.phone, account.id, refreshController.signal, since)
        setThreads((current) => current.map((thread) => thread.id === expandedThreadId
          ? { ...thread, conversation: mergeConversation(thread.conversation, incoming) }
          : thread))
      } catch (err) {
        if (err.name !== 'AbortError') console.warn('Não foi possível atualizar a conversa automaticamente.', err)
      } finally {
        refreshing = false
      }
    }

    const intervalId = window.setInterval(refreshConversation, 5000)
    const refreshWhenVisible = () => { if (!document.hidden) refreshConversation() }
    document.addEventListener('visibilitychange', refreshWhenVisible)
    window.addEventListener('focus', refreshConversation)

    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      window.removeEventListener('focus', refreshConversation)
      refreshController?.abort()
    }
  }, [expandedThreadId, expandedThread?.account.id, expandedThread?.channel, expandedThread?.conversation.contact.phone])

  async function handleSearch(event) {
    event.preventDefault()
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setLoading(true)
    setError('')
    setPartialErrors([])
    setSearched(true)
    setSearchStats(null)
    setThreads([])
    setExpandedThreadId('')
    setDrafts({})
    setSendErrors({})
    try {
      const normalizedPhone = normalizeBrazilianPhone(phone)
      if (!/^55\d{10,11}$/.test(normalizedPhone)) throw new Error('Digite um telefone brasileiro válido, com DDD.')

      const channelResults = await Promise.allSettled(['hub', 'official'].map(async (channel) => ({
        channel,
        accounts: await getAccounts(channel, controller.signal),
      })))
      if (controller.signal.aborted) return

      const discoveryErrors = []
      const accountLookups = []
      channelResults.forEach((result, index) => {
        const channel = ['hub', 'official'][index]
        if (result.status === 'rejected') {
          if (result.reason?.name !== 'AbortError') discoveryErrors.push(`${channel === 'official' ? 'API Oficial' : 'WhatsApp Hub'}: ${result.reason?.message || 'falha ao carregar contas'}`)
          return
        }
        result.value.accounts.forEach((account) => accountLookups.push({ channel, account }))
      })

      const historyResults = await Promise.allSettled(accountLookups.map(async ({ channel, account }) => ({
        id: `${channel}:${account.id}`,
        channel,
        account,
        conversation: await getConversation(channel, normalizedPhone, account.id, controller.signal),
      })))
      if (controller.signal.aborted) return

      const historyErrors = []
      const foundThreads = []
      historyResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          if (result.value.conversation.messages.length) foundThreads.push(result.value)
          return
        }
        if (result.reason?.name !== 'AbortError') {
          const lookup = accountLookups[index]
          historyErrors.push(`${lookup?.account.name || 'Conta'}: ${result.reason?.message || 'falha ao consultar histórico'}`)
        }
      })
      foundThreads.sort((a, b) => threadActivity(b) - threadActivity(a))
      setThreads(foundThreads)
      setExpandedThreadId(foundThreads[0]?.id || '')
      setPartialErrors([...discoveryErrors, ...historyErrors])
      setSearchStats({
        accountsConsulted: accountLookups.length,
        channelsAvailable: channelResults.filter((result) => result.status === 'fulfilled').length,
      })
      if (!foundThreads.length && !accountLookups.length && discoveryErrors.length) {
        setError('Não foi possível consultar os canais de WhatsApp neste momento.')
      }
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message)
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }

  async function handleSend(event, thread) {
    event.preventDefault()
    const draft = drafts[thread.id] || ''
    if (sendingThreadId || !draft.trim()) return
    const text = draft.trim()
    setSendingThreadId(thread.id)
    setSendErrors((current) => ({ ...current, [thread.id]: '' }))
    try {
      const result = await sendMessage({
        channel: thread.channel,
        phone: thread.conversation.contact.phone,
        accountId: thread.account.id,
        text,
        attendant: ATTENDANT_NAME,
      })
      setThreads((current) => current.map((item) => {
        if (item.id !== thread.id) return item
        const latestTimestamp = item.conversation.messages.reduce((maximum, message) => {
          const timestamp = new Date(message.timestamp).getTime()
          return Number.isNaN(timestamp) ? maximum : Math.max(maximum, timestamp)
        }, 0)
        const optimisticTimestamp = new Date(latestTimestamp ? latestTimestamp + 1 : Date.now()).toISOString()
        return {
          ...item,
          conversation: {
            ...item.conversation,
            messages: [...item.conversation.messages, {
              id: result.message_id || result.wa_message_id || `local-${Date.now()}`,
              direction: 'outbound',
              text,
              timestamp: optimisticTimestamp,
              status: 'sent',
              optimistic: true,
            }],
          },
        }
      }))
      setDrafts((current) => ({ ...current, [thread.id]: '' }))
    } catch (err) {
      const windowClosed = thread.channel === 'official'
        && (String(err.code).toUpperCase() === 'JANELA_FECHADA' || (err.status === 409 && !err.code))
      if (windowClosed) {
        setThreads((current) => current.map((item) => item.id === thread.id
          ? { ...item, conversation: { ...item.conversation, windowOpen: false } }
          : item))
      }
      setSendErrors((current) => ({ ...current, [thread.id]: err.message }))
    } finally {
      setSendingThreadId('')
      window.requestAnimationFrame(() => {
        if (composerRef.current && !composerRef.current.disabled) {
          composerRef.current.focus({ preventScroll: true })
        }
      })
    }
  }

  function handleDraftKeyDown(event, thread) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSend(event, thread)
    }
  }

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark"><MessageCircle size={24} /></span><span>Campuzz <span>Conversas</span></span></div>
      <div className="connection"><Wifi size={15} /><span>Hub + API Oficial</span></div>
    </header>

    <main>
      <section className="intro">
        <span className="eyebrow">Ficha do aluno</span>
        <h1>Conversas no WhatsApp</h1>
        <p>Consulte de uma vez todos os atendimentos vinculados ao telefone do aluno.</p>
        <form className="search-form" onSubmit={handleSearch}>
          <label htmlFor="phone">Telefone do aluno</label>
          <div className="search-row">
            <div className="input-wrap"><Phone size={19} /><input id="phone" value={phone} onChange={(event) => setPhone(formatPhone(event.target.value))} placeholder="(11) 99999-9999" inputMode="tel" autoComplete="tel" /><span className="country">BR</span></div>
            <button type="submit" disabled={loading}><Search size={18} />{loading ? 'Consultando canais...' : 'Ver histórico'}</button>
          </div>
          {error && <div className="error" role="alert"><X size={16} />{error}</div>}
        </form>
      </section>

      <section className="conversation-results" aria-busy={loading}>
        {loading && <div className="results-loader"><div className="loader"><span /><p>Consultando contas e históricos...</p></div></div>}

        {!loading && searched && <div className="results-summary">
          <div><Layers3 size={18} /><strong>{threads.length} {threads.length === 1 ? 'conversa encontrada' : 'conversas encontradas'}</strong></div>
          {searchStats && <span>{searchStats.accountsConsulted} contas consultadas em {searchStats.channelsAvailable} canais</span>}
        </div>}

        {!loading && partialErrors.length > 0 && <details className="partial-errors">
          <summary>{partialErrors.length} {partialErrors.length === 1 ? 'consulta não pôde ser concluída' : 'consultas não puderam ser concluídas'}</summary>
          <ul>{partialErrors.map((message, index) => <li key={`${index}-${message}`}>{message}</li>)}</ul>
        </details>}

        {!loading && searched && !threads.length && !error && <div className="empty-results"><EmptyState searched /></div>}

        {!loading && threads.map((thread) => {
          const expanded = thread.id === expandedThreadId
          const messages = thread.conversation.messages
          const latestMessage = messages.at(-1)
          const draft = drafts[thread.id] || ''
          const sending = sendingThreadId === thread.id
          const officialWindowClosed = thread.channel === 'official' && thread.conversation.windowOpen === false
          return <article className={`thread-card ${expanded ? 'expanded' : ''}`} key={thread.id}>
            <button className="thread-header" type="button" onClick={() => setExpandedThreadId(expanded ? '' : thread.id)} aria-expanded={expanded}>
              <span className={`thread-avatar ${thread.channel}`}>{thread.account.name?.charAt(0).toUpperCase() || 'W'}</span>
              <span className="thread-main">
                <span className="thread-title"><strong>{thread.account.name}</strong><span className={`channel-badge ${thread.channel}`}>{thread.channel === 'official' ? 'Meta · Oficial' : 'Hub · Evolution'}</span></span>
                <span className="thread-preview">{messagePreview(latestMessage)}</span>
              </span>
              <span className="thread-meta"><time>{formatTime(latestMessage?.timestamp)}</time><small>{messages.length} {messages.length === 1 ? 'mensagem' : 'mensagens'}</small></span>
              <ChevronDown className="thread-chevron" size={19} />
            </button>

            {expanded && <div className="thread-content">
              <div className="thread-contact"><span>{thread.conversation.contact.name}</span><small>{formatContactPhone(thread.conversation.contact.phone)}</small></div>
              <ConversationMessages thread={thread} messagesRef={messagesRef} />
              <form className="composer" onSubmit={(event) => handleSend(event, thread)}>
                {officialWindowClosed && <div className="window-warning">Janela de 24 horas encerrada. Aguarde o contato enviar uma nova mensagem para responder.</div>}
                {sendErrors[thread.id] && <div className="send-error" role="alert"><X size={14} />{sendErrors[thread.id]}</div>}
                <div className="composer-row">
                  <textarea ref={composerRef} value={draft} onChange={(event) => setDrafts((current) => ({ ...current, [thread.id]: event.target.value.slice(0, 4096) }))} onKeyDown={(event) => handleDraftKeyDown(event, thread)} placeholder={officialWindowClosed ? 'Envio indisponível fora da janela de 24h' : `Responder por ${thread.account.name}`} aria-label="Mensagem" rows="1" disabled={sending || officialWindowClosed} />
                  <span className={`char-count ${draft.length > 3900 ? 'near-limit' : ''}`}>{draft.length}/4096</span>
                  <button type="submit" disabled={sending || !draft.trim() || officialWindowClosed} aria-label="Enviar mensagem"><Send size={19} /></button>
                </div>
                <span className="send-hint">Resposta enviada por {thread.channel === 'official' ? 'API Oficial' : 'WhatsApp Hub'} · Enter para enviar</span>
              </form>
            </div>}
          </article>
        })}
      </section>
    </main>
    <footer>Campuzz <span>•</span> Histórico integrado de conversas</footer>
  </div>
}
