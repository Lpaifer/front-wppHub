import { useState } from 'react'
import { CheckCircle2, MessageCircle, X } from 'lucide-react'
import { bindDealMessagesPlacement } from '../../../bitrix'

export default function BitrixInstall() {
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')

  async function handleInstall() {
    setStatus('loading')
    setError('')
    try {
      await bindDealMessagesPlacement()
      setStatus('success')
    } catch (err) {
      setStatus('error')
      setError(err.message)
    }
  }

  return <main className="bitrix-page bitrix-login-page">
    <section className="bitrix-login-panel bitrix-install-panel">
      <span className="bitrix-brand"><MessageCircle size={19} />WppHub</span>
      <h1>Instalar aba Mensagens</h1>
      <p>Registre a mensageria no detalhe dos negócios deste portal Bitrix24.</p>
      {status === 'success' ? <div className="bitrix-install-success"><CheckCircle2 size={22} /><strong>Instalação concluída</strong><span>Abra um negócio e procure a aba Mensagens.</span></div> : <button className="bitrix-install-button" type="button" onClick={handleInstall} disabled={status === 'loading'}>{status === 'loading' ? 'Registrando aba...' : 'Registrar aba Mensagens'}</button>}
      {status === 'error' && <div className="error" role="alert"><X size={15} />{error}</div>}
    </section>
  </main>
}