const BITRIX_SDK_URL = 'https://api.bitrix24.com/api/v1/'

let sdkPromise

function loadSdk() {
  if (window.BX24) return Promise.resolve(window.BX24)
  if (sdkPromise) return sdkPromise

  sdkPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector(`script[src="${BITRIX_SDK_URL}"]`)
    const script = existingScript || document.createElement('script')
    script.onload = () => window.BX24 ? resolve(window.BX24) : reject(new Error('O SDK do Bitrix24 não foi inicializado.'))
    script.onerror = () => reject(new Error('Não foi possível carregar o SDK do Bitrix24.'))
    if (!existingScript) {
      script.src = BITRIX_SDK_URL
      script.async = true
      document.head.appendChild(script)
    }
  })
  return sdkPromise
}

function initSdk(sdk) {
  return new Promise((resolve, reject) => {
    try {
      sdk.init(resolve)
    } catch (error) {
      reject(error)
    }
  })
}

function callMethod(sdk, method, params) {
  return new Promise((resolve, reject) => {
    sdk.callMethod(method, params, (result) => {
      if (result.error()) {
        reject(new Error(result.error_description() || `O Bitrix24 recusou a chamada ${method}.`))
        return
      }
      resolve(result.data())
    })
  })
}

function firstPhone(fields) {
  const phones = Array.isArray(fields) ? fields.filter((field) => field?.typeId === 'PHONE' || field?.TYPE_ID === 'PHONE') : []
  const priority = { MOBILE: 0, WORK: 1, OTHER: 2, HOME: 3 }
  phones.sort((first, second) => (priority[first.valueType ?? first.VALUE_TYPE] ?? 99) - (priority[second.valueType ?? second.VALUE_TYPE] ?? 99))
  return phones[0]?.value ?? phones[0]?.VALUE ?? ''
}

export async function getBitrixDealContext() {
  const sdk = await loadSdk()
  await initSdk(sdk)
  const placement = await new Promise((resolve) => sdk.placement.info(resolve))
  const dealId = placement?.options?.ID || placement?.options?.id || placement?.ID || new URLSearchParams(window.location.search).get('deal_id') || ''
  if (!dealId) throw new Error('Não foi possível identificar o negócio aberto no Bitrix24.')

  const dealResult = await callMethod(sdk, 'crm.item.get', { entityTypeId: 2, id: dealId })
  const deal = dealResult?.item ?? dealResult
  const contactId = deal?.contactIds?.[0] ?? deal?.CONTACT_ID ?? deal?.contactId ?? ''
  let contact = null
  if (contactId) {
    const contactResult = await callMethod(sdk, 'crm.item.get', { entityTypeId: 3, id: contactId })
    contact = contactResult?.item ?? contactResult
  }

  return {
    dealId: String(dealId),
    dealTitle: deal?.title || deal?.TITLE || `Negócio #${dealId}`,
    contactId: String(contactId),
    contactName: contact?.name || (contact?.NAME ? [contact.NAME, contact.LAST_NAME].filter(Boolean).join(' ') : ''),
    phone: firstPhone(contact?.fm) || firstPhone(contact?.PHONE),
  }
}