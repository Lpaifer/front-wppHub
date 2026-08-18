# WppHub — visualizador de conversas

Protótipo em React da experiência de conversas do Campuzz. A partir do telefone do aluno, o front consulta automaticamente todas as contas disponíveis no WhatsApp Hub (Evolution, não oficial) e na Central de Modelos (Meta Cloud API oficial), exibindo somente os fluxos encontrados.

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

O front descobre as contas disponíveis nos dois canais e consulta o histórico do telefone em todas elas, em paralelo:

```http
GET https://whatsapp.prosperargroup.com.br/api/v1/accounts
Accept: application/json
Authorization: Bearer wah_SUA_CHAVE_AQUI

GET https://whatsapp.prosperargroup.com.br/api/v1/conversations/5511999999999/messages?account_id=UUID&limit=500
```

O usuário pode digitar apenas DDD + telefone (por exemplo, `(15) 99719-0538`). O front remove a máscara e acrescenta automaticamente o DDI brasileiro `55` antes de consultar a API.

Não há seleção manual de API ou conta. Cada resultado é exibido como um fluxo separado, identificado pelo setor e pelo provedor. Falhas isoladas não impedem a exibição dos demais resultados, e a conversa com atividade mais recente é expandida primeiro.

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

Enquanto um fluxo permanece expandido, o front busca novas mensagens a cada 5 segundos usando o parâmetro incremental `since`. As mensagens são mescladas por ID para evitar duplicidade. O polling pausa quando a aba fica oculta e atualiza imediatamente quando o usuário retorna. Apenas o fluxo aberto é atualizado para limitar o volume de requisições.

Mensagens com `anexo.tipo: "image"`, `anexo.tipo: "audio"` ou `anexo.tipo: "document"` são carregadas pela URL autenticada informada em `anexo.url` e exibidas no balão da conversa, com visualização, reprodução ou download. Estados de processamento, URL ausente e falha no carregamento são tratados na interface.

URLs `http://`, `https://` e `www.` presentes no texto são exibidas como links clicáveis e abrem em uma nova aba com `noopener noreferrer`.

Cada fluxo possui seu próprio compositor contextual, que envia a resposta pelo canal e pela conta de origem usando `POST /messages`. A mensagem é limitada a 4096 caracteres e aparece imediatamente no histórico quando a API responde `201`.

Na API Oficial, o campo `janela_aberta` controla a caixa de resposta. Quando for `false`, o envio fica bloqueado até o contato escrever novamente, conforme a regra de 24 horas da Meta.

> Atenção: variáveis `VITE_*` fazem parte do bundle entregue ao navegador. Para produção pública, não exponha a chave `wah_...`: encaminhe essas chamadas por um backend/BFF do Campuzz, que guarda o token no servidor. A configuração direta é apropriada apenas para uso interno controlado ou desenvolvimento.

## Build

```bash
npm run build
```

Os arquivos finais são gerados em `dist/`.
