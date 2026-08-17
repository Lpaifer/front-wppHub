# WppHub — visualizador de conversas

Front simples em React para pesquisar um número, exibir o histórico e responder por dois canais: WhatsApp Hub (Evolution, não oficial) e Central de Modelos (Meta Cloud API oficial).

## Executar

```bash
npm install
Copy-Item .env.example .env
npm run dev
```

Por padrão, o `.env.example` usa o modo de demonstração. Para conectar ao backend:

```env
VITE_HUB_API_BASE_URL=https://whatsapp.prosperargroup.com.br/api/v1
VITE_HUB_API_TOKEN=wah_SUA_CHAVE_AQUI
VITE_HUB_ACCOUNT_ID=
VITE_OFFICIAL_API_BASE_URL=/official-api
OFFICIAL_API_UPSTREAM_URL=https://whatsapp-modelos.andre-51e.workers.dev
OFFICIAL_API_TOKEN=wam_SUA_CHAVE_AQUI
VITE_OFFICIAL_ACCOUNT_ID=
VITE_ATTENDANT_NAME=Ana (Campuzz)
VITE_DEMO_MODE=false
```

O front primeiro descobre uma conta disponível e depois consulta o histórico:

```http
GET https://whatsapp.prosperargroup.com.br/api/v1/accounts
Accept: application/json
Authorization: Bearer wah_SUA_CHAVE_AQUI

GET https://whatsapp.prosperargroup.com.br/api/v1/conversations/5511999999999/messages?account_id=UUID&limit=500
```

O usuário pode digitar apenas DDD + telefone (por exemplo, `(15) 99719-0538`). O front remove a máscara e acrescenta automaticamente o DDI brasileiro `55` antes de consultar a API.

## Resposta aceita

O adaptador aceita uma resposta direta ou dentro de `data`, com a conversa em `conversation` ou `chat`:

```json
{
  "contact": {
    "name": "Maria Oliveira",
    "phone": "5511999999999",
    "avatar": "https://..."
  },
  "messages": [
    {
      "id": "msg-1",
      "direcao": "recebida",
      "texto": "Olá!",
      "em": "2026-08-17T15:41:00.000Z"
    }
  ]
}
```

Os campos oficiais `direcao`, `texto`, `em` e `telefone` são tratados diretamente. O ponto único da integração é `src/api.js`.

Depois de pesquisar uma conversa, o campo inferior envia texto livre por `POST /messages`. A mensagem é limitada a 4096 caracteres e aparece imediatamente no histórico quando a API responde `201`.

Na API Oficial, o campo `janela_aberta` controla a caixa de resposta. Quando for `false`, o envio fica bloqueado até o contato escrever novamente, conforme a regra de 24 horas da Meta.

> Atenção: variáveis `VITE_*` fazem parte do bundle entregue ao navegador. Para produção pública, não exponha a chave `wah_...`: encaminhe essas chamadas por um backend/BFF do Campuzz, que guarda o token no servidor. A configuração direta é apropriada apenas para uso interno controlado ou desenvolvimento.

## Build

```bash
npm run build
```

Os arquivos finais são gerados em `dist/`.
