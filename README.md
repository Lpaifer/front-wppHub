# WppHub — visualizador de conversas

Protótipo em React da experiência de conversas do Campuzz. A partir do telefone do aluno, o front consulta automaticamente todas as contas disponíveis no WhatsApp Hub (Evolution, não oficial) e na Central de Modelos (Meta Cloud API oficial), exibindo somente os fluxos encontrados.

## Executar

```bash
npm install
Copy-Item .env.example .env
npm run dev
```

### Backend de autenticação e vínculo

O backend local fica em `server/` e usa Node.js, Express e Neon Postgres via `@neondatabase/serverless`. Ele persiste usuários e o vínculo entre negócio Bitrix, contato, telefone, canal e `account_id`.

```powershell
npm install --prefix server
Copy-Item server/.env.example server/.env
npm start --prefix server
```

Configure `server/.env` com `DATABASE_URL` do projeto Neon, `JWT_SECRET`, `ADMIN_EMAIL` e `ADMIN_PASSWORD`. No primeiro início, as tabelas são criadas e o administrador é inserido automaticamente. O login fica disponível em `POST /api/auth/login` e retorna um token Bearer com validade de 8 horas. `NEON_AUTH_URL` é mantida como configuração opcional para uma futura adoção do Neon Auth; o login atual continua sendo o login próprio da aplicação.

Os endpoints protegidos do vínculo são:

```http
GET /api/bitrix/deals/{deal_id}/conversation
PUT /api/bitrix/deals/{deal_id}/conversation
Authorization: Bearer TOKEN
```

O frontend usa `GET /accounts` para listar as contas/dispositivos e continua usando o contrato existente de `POST /messages`. A aplicação Bitrix usa uma única telefone do contato neste primeiro MVP.

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

## Embed no card de negócio do Bitrix24

O frontend pode ser registrado como uma aba no detalhe de um negócio usando o placement `CRM_DEAL_DETAIL_TAB`. O Bitrix24 carrega a rota `/integrations/bitrix/deal` em um `iframe`; [src/bitrix.js](src/bitrix.js) usa o SDK `BX24` para identificar o negócio atual, buscar o negócio com `crm.deal.get`, buscar o contato relacionado com `crm.contact.get` e consultar o histórico pelo primeiro telefone encontrado.

Na configuração da aplicação do Bitrix24, use:

```text
Placement: CRM_DEAL_DETAIL_TAB
URL: https://SEU-DOMINIO/wpphub/integrations/bitrix/deal
```

A aplicação precisa de permissão REST para `crm` e deve usar HTTPS. O negócio precisa ter um contato relacionado com telefone cadastrado. A tela Bitrix possui login próprio; ela chama `POST ${VITE_AUTH_API_BASE_URL}/login` com `{ email, password }`, persiste o token retornado no navegador e envia as credenciais da sessão conforme o backend definir.

Se não houver conversa, o usuário seleciona o canal e o dispositivo retornados por `GET /accounts`; a primeira mensagem usa `POST /messages` e cria a conversa. Depois que houver histórico, canal e dispositivo ficam fixados e a interface apenas continua aquela conversa. O dispositivo atualmente é representado pelo `account_id` do contrato de mensagens.

O contexto Bitrix identifica o negócio e o contato, mas leitura e envio das mensagens continuam passando por [src/api.js](src/api.js). Em produção, não exponha as chaves `VITE_*` no navegador: use um backend/BFF para as chamadas do WhatsApp.

O usuário pode digitar apenas DDD + telefone (por exemplo, `(15) 99719-0538`). O front remove a máscara e acrescenta automaticamente o DDI brasileiro `55` antes de consultar a API.

Na aplicação normal não há seleção manual de API ou conta. Cada resultado é exibido como um fluxo separado, identificado pelo setor e pelo provedor. Falhas isoladas não impedem a exibição dos demais resultados, e a conversa com atividade mais recente é expandida primeiro.

## Caixa de conversas do Hub

A aba **Caixa de conversas** consulta `GET /conversations?account_id=...` em todas as contas do WhatsApp Hub. O resultado forma uma caixa de entrada única, ordenada pela mensagem mais recente, sem perder a identificação da conta de origem.

Cada item mostra contato, telefone, última mensagem, número de não lidas, situação (`queued`, `in_service` ou `closed`), atendente atual e a conta que recebeu a conversa. Ao selecionar um item, o histórico é carregado com a conta correspondente e permanece em atualização incremental a cada 5 segundos.

```http
GET https://whatsapp.prosperargroup.com.br/api/v1/conversations?account_id=UUID
Accept: application/json
Authorization: Bearer wah_SUA_CHAVE_AQUI
```

Esta primeira versão usa a listagem de conversas apenas do Hub, pois é nesse contrato que existem os campos de fila, atendimento e encerramento. Ações futuras de assumir, transferir ou encerrar atendimento devem respeitar os endpoints específicos disponibilizados pelo backend.

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

## Deploy único no Railway

Crie um serviço a partir deste repositório. Use:

```text
Build Command: npm run build
Start Command: npm start
```

O Express serve o frontend compilado e as rotas `/api` no mesmo domínio. Configure no Railway `DATABASE_URL`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` e `CORS_ORIGIN` com a URL pública do próprio serviço. O handler do Bitrix será:

```text
https://SEU-SERVICO.up.railway.app/integrations/bitrix/deal
```
