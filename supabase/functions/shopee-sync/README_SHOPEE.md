# Configurando Links de Afiliado Shopee — PiscouLevou

## Situação atual

Você está aprovado como afiliado Shopee, mas não tem acesso à Open API (App ID).
O sistema foi adaptado para funcionar **sem a API**, usando os cookies de sessão do
portal web — igual ao que fazemos com o Mercado Livre.

---

## Passo 1 — Capturar seus cookies de sessão

### No Chrome/Edge:
1. Abra: **https://affiliate.shopee.com.br**
2. Faça login com sua conta
3. Pressione **F12** (DevTools) → aba **Application** → **Cookies** → `affiliate.shopee.com.br`
4. Copie TODOS os cookies no formato `nome=valor; nome2=valor2`

**OU use a extensão "Cookie Editor"** (mais fácil):
- Instale: https://chrome.google.com/webstore/detail/cookie-editor/
- Abra o portal logado → clique na extensão → "Export" → "Header String"
- Copie o resultado

---

## Passo 2 — Configurar o secret no Supabase

Execute no terminal do projeto:

```powershell
npx supabase secrets set SHOPEE_SESSION_COOKIES="SPC_F=xxxx; SPC_T_IV=xxx; ... (cola aqui)"
```

> ⚠️ Os cookies expiram periodicamente (geralmente 7-30 dias).
> Quando expirar, repita o processo e atualize o secret.

---

## Passo 3 (opcional) — ID de rastreamento de fallback

Se quiser que mesmo os links sem cookie curto tenham rastreamento básico,
adicione seu Tracking ID (aparece no painel de afiliados em "Meus Links"):

```powershell
npx supabase secrets set SHOPEE_TRACKING_ID="piscoulevou"
```

---

## Como funciona

```
shopee-sync (a cada 10 min)
    │
    ├─ Busca produtos em promoção via API pública Shopee BR
    │   (sem autenticação — endpoints públicos do site)
    │
    ├─ Gera links rastreados via portal de afiliados
    │   (usando cookies de sessão — igual ao MELI)
    │
    └─ Salva no banco com platform='shopee'
         ↓
    instagram-post seleciona alternando MELI/Shopee
         ↓
    Site mostra badge 🛍️ Shopee nos cards
```

---

## Verificando se está funcionando

Teste manual da função:
```
GET https://zbupixtjhumxutsyaqtf.supabase.co/functions/v1/shopee-sync
Authorization: Bearer <service_role_key>
```

Ou no Supabase Dashboard → Edge Functions → shopee-sync → "Invoke"

---

## Solicitando acesso à Open API (para o futuro)

No painel de afiliados → **Meu API** → clique em "entre em contato com a gente"
Informe que você é publisher de conteúdo e deseja automação via API.
Com o App ID + Secret Key, o sistema opera sem necessidade de cookies.
