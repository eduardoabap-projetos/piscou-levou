// @ts-check
/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

// ============================================================
// PiscouLevou — shopee-sync v4 (GraphQL Open API oficial)
// URL: https://open-api.affiliate.shopee.com.br/graphql
// Auth: SHA256 Credential={AppId}, Timestamp={ts}, Signature={sig}
// Signature: HMAC-SHA256(AppId + Timestamp + Payload + Secret)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

const GQL_URL  = 'https://open-api.affiliate.shopee.com.br/graphql';
const CAT_BATCH = 4;   // categorias em paralelo
const MAX_PER_QUERY = 5; // produtos por categoria

// ─── Categorias Shopee BR → slugs internos ────────────────────────────────────
const CATS = [
  { catId: 0,  slug: 'eletronicos-e-tecnologia', name: 'Eletrônicos',         comm: 0.05 },
  { catId: 1,  slug: 'celulares',                name: 'Celulares',           comm: 0.05 },
  { catId: 2,  slug: 'computacao',               name: 'Informática',         comm: 0.05 },
  { catId: 3,  slug: 'cuidados-pessoais',        name: 'Beleza e Cuidados',   comm: 0.08 },
  { catId: 4,  slug: 'moda',                     name: 'Moda',                comm: 0.08 },
  { catId: 5,  slug: 'esportes',                 name: 'Esportes e Fitness',  comm: 0.06 },
  { catId: 6,  slug: 'casa-e-organizacao',       name: 'Casa e Decoração',    comm: 0.06 },
  { catId: 7,  slug: 'eletrodomesticos',         name: 'Eletrodomésticos',    comm: 0.05 },
  { catId: 8,  slug: 'bebes',                    name: 'Bebês',               comm: 0.06 },
  { catId: 9,  slug: 'games',                    name: 'Games',               comm: 0.05 },
  { catId: 10, slug: 'automotivo',               name: 'Automotivo',          comm: 0.05 },
  { catId: 11, slug: 'pet-shop',                 name: 'Pet Shop',            comm: 0.06 },
  { catId: 12, slug: 'ferramentas',              name: 'Ferramentas',         comm: 0.06 },
];

// ─── Gera assinatura SHA256 (não HMAC — conforme API Shopee BR) ───────────────
async function makeSignature(appId: string, secret: string, timestamp: number, payload: string): Promise<string> {
  // Shopee Open API BR usa SHA256 puro da concatenação: AppId + Timestamp + Payload + Secret
  const base    = `${appId}${timestamp}${payload}${secret}`;
  const encoded = new TextEncoder().encode(base);
  const hashBuf = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Executa uma query GraphQL autenticada ────────────────────────────────────
async function gql(query: string, variables: object, appId: string, secret: string, log: (...a: any[]) => void): Promise<any> {
  const ts      = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify({ query, variables });
  const sig     = await makeSignature(appId, secret, ts, payload);
  const auth    = `SHA256 Credential=${appId}, Timestamp=${ts}, Signature=${sig}`;

  try {
    const res = await fetch(GQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Accept':        'application/json',
        'Authorization': auth,
      },
      body:   payload,
      signal: AbortSignal.timeout(15000),
    });

    const data = await res.json();
    if (data.errors?.length) {
      log(`⚠️ GQL erro: ${data.errors[0].message}`);
      return null;
    }
    return data.data;
  } catch (e: any) {
    log(`⚠️ GQL fetch erro: ${e.message}`);
    return null;
  }
}

// ─── Busca lista de categorias da API (para descobrir os IDs corretos) ────────
async function fetchCategories(appId: string, secret: string, log: (...a: any[]) => void) {
  const query = `query { productOfferV2(listType: 0, limit: 1, page: 1) { nodes { categoryId } } }`;
  return gql(query, {}, appId, secret, log);
}

// ─── Busca produtos em destaque (sem filtro de categoria para descobrir estrutura) ─
async function fetchProductOffers(limit: number, page: number, appId: string, secret: string, log: (...a: any[]) => void) {
  // Campos reais do schema descobertos via introspecção
  const query = `
    query GetOffers($limit: Int, $page: Int) {
      productOfferV2(
        listType: 0
        limit: $limit
        page: $page
        sortType: 2
      ) {
        nodes {
          itemId
          shopId
          productName
          priceMin
          priceMax
          priceDiscountRate
          commissionRate
          commission
          sales
          ratingStar
          imageUrl
          productLink
          offerLink
          productCatIds
        }
        pageInfo {
          page
          limit
          hasNextPage
        }
      }
    }
  `;
  return gql(query, { limit, page }, appId, secret, log);
}

// ─── Gera links de afiliado ───────────────────────────────────────────────────
async function generateLinks(urls: string[], appId: string, secret: string, log: (...a: any[]) => void): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!urls.length) return map;

  const query = `
    mutation GenLinks($urls: [String!]!) {
      generateShortLink(input: { originUrls: $urls }) {
        shortLinks { originUrl shortLink }
      }
    }
  `;
  const data = await gql(query, { urls }, appId, secret, log);
  if (!data?.generateShortLink?.shortLinks) return map;

  for (const item of data.generateShortLink.shortLinks) {
    if (item.originUrl && item.shortLink) map.set(item.originUrl, item.shortLink);
  }
  log(`🔗 ${map.size}/${urls.length} links de afiliado gerados`);
  return map;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function makeSlug(text = '') {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 80);
}

const catCache = new Map<string, string>();
async function getCategoryId(slug: string, name: string): Promise<string | null> {
  if (catCache.has(slug)) return catCache.get(slug)!;
  const { data } = await supabase.from('categories').select('id').eq('slug', slug).maybeSingle();
  if (data?.id) { catCache.set(slug, data.id); return data.id; }
  const { data: n } = await supabase.from('categories').insert({ name, slug }).select('id').maybeSingle();
  if (n?.id) { catCache.set(slug, n.id); return n.id; }
  return null;
}

// Mapeia categoryId real da Shopee BR → slug interno
function catIdToSlug(catId: number): { slug: string; name: string; comm: number } {
  // IDs reais do schema GraphQL da Shopee BR (descobertos via API)
  const map: Record<number, { slug: string; name: string; comm: number }> = {
    100001: { slug: 'cuidados-pessoais',        name: 'Saúde e Bem-estar',      comm: 0.08 },
    100010: { slug: 'eletrodomesticos',          name: 'Eletrodomésticos',       comm: 0.05 },
    100011: { slug: 'moda',                      name: 'Moda',                  comm: 0.08 },
    100012: { slug: 'moda',                      name: 'Calçados',              comm: 0.08 },
    100013: { slug: 'eletronicos-e-tecnologia',  name: 'Eletrônicos',           comm: 0.05 },
    100015: { slug: 'moda',                      name: 'Malas e Bolsas',        comm: 0.08 },
    100017: { slug: 'moda',                      name: 'Moda Feminina',         comm: 0.08 },
    100534: { slug: 'eletronicos-e-tecnologia',  name: 'Eletrônicos',           comm: 0.05 },
    100630: { slug: 'cuidados-pessoais',         name: 'Beleza e Cuidados',     comm: 0.10 },
    100631: { slug: 'cuidados-pessoais',         name: 'Saúde',                 comm: 0.08 },
    100632: { slug: 'bebes',                     name: 'Bebês e Crianças',     comm: 0.06 },
    100636: { slug: 'casa-e-organizacao',        name: 'Casa e Decoração',    comm: 0.06 },
    100637: { slug: 'esportes',                  name: 'Esportes e Fitness',    comm: 0.06 },
  };
  return map[catId] ?? { slug: 'outros-produtos', name: 'Outros', comm: 0.05 };
}

// ─── Handler Principal ────────────────────────────────────────────────────────
Deno.serve(async () => {
  const logs: string[] = [];
  const log  = (...a: any[]) => { const m = a.join(' '); logs.push(m); console.log(m); };
  const t0   = Date.now();

  const appId  = Deno.env.get('SHOPEE_APP_ID')     ?? '';
  const secret = Deno.env.get('SHOPEE_SECRET_KEY') ?? '';

  if (!appId || !secret) {
    log('❌ SHOPEE_APP_ID e SHOPEE_SECRET_KEY não configurados');
    return new Response(JSON.stringify({ error: 'Credenciais não configuradas', logs }), { status: 500 });
  }

  log(`🛍️ shopee-sync v4 (GraphQL Open API) | AppID: ${appId}`);
  const stats = { new: 0, errors: 0, total_products: 0 };

  // Busca até 3 páginas de produtos (sem filtro de categoria — API retorna os melhores)
  const allProducts: any[] = [];
  for (let page = 1; page <= 3; page++) {
    const data = await fetchProductOffers(20, page, appId, secret, log);
    if (!data?.productOfferV2?.nodes?.length) break;
    allProducts.push(...data.productOfferV2.nodes);
    log(`📦 Página ${page}: ${data.productOfferV2.nodes.length} produtos | hasNext: ${data.productOfferV2.pageInfo?.hasNextPage}`);
    if (!data.productOfferV2.pageInfo?.hasNextPage) break;
    await new Promise(r => setTimeout(r, 150));
  }

  log(`📊 Total recebido: ${allProducts.length} produtos`);
  stats.total_products = allProducts.length;

  if (!allProducts.length) {
    log('⚠️ Nenhum produto retornado — verifique a query GraphQL');
    return new Response(JSON.stringify({ success: false, stats, logs }), { status: 200 });
  }

  // Filtra produtos com desconto e comissão razoável
  const eligible = allProducts.filter(p => {
    const price = parseFloat(p.priceMin ?? '0'); // API já em Reais
    const disc  = parseFloat(p.priceDiscountRate ?? '0'); // ex: "20.00" = 20%
    return price > 0 && disc >= 5 && p.offerLink; // 5% mínimo, tem link de afiliado
  });
  log(`✅ ${eligible.length}/${allProducts.length} elegíveis (desconto ≥5% + link)`);

  if (!eligible.length) {
    log('⚠️ Nenhum produto elegível');
    return new Response(JSON.stringify({ success: true, stats, logs }), { status: 200 });
  }

  // Salva produtos em paralelo por batches
  const BATCH = 8;
  for (let i = 0; i < eligible.length; i += BATCH) {
    const chunk = eligible.slice(i, i + BATCH);
    await Promise.allSettled(chunk.map(async (p: any) => {
      try {
        const price   = Math.round((parseFloat(p.priceMin) ?? 0) * 100) / 100; // API retorna em Reais
        const discPct = Math.round(parseFloat(p.priceDiscountRate ?? '0'));
        // Preço original estimado a partir do desconto
        const origP   = discPct > 0 && discPct < 100
          ? Math.round(price / (1 - discPct / 100) * 100) / 100 : null;
        const affLink  = p.offerLink ?? p.productLink ?? '';

        // Usa o primeiro catId disponível para mapear categoria
        const catIds  = p.productCatIds ?? [];
        const firstCat = catIds.length > 0 ? catIds[0] : 0;
        const catInfo  = catIdToSlug(firstCat);
        log(`   📌 Produto: ${p.productName?.slice(0,30)} | cat=${firstCat} → ${catInfo.slug} | R$${price} | -${discPct}%`);
        const categoryId = await getCategoryId(catInfo.slug, catInfo.name);
        if (!categoryId) { stats.errors++; return; }

        const { error } = await supabase.from('products').upsert({
          shopee_item_id: `${p.shopId ?? 0}_${p.itemId}`,
          platform:        'shopee',
          title:           (p.productName ?? 'Produto Shopee').slice(0, 255),
          slug:            makeSlug(p.productName ?? String(p.itemId)),
          price,
          original_price:  origP,
          discount_pct:    discPct,
          image_url:       p.imageUrl ?? null,
          affiliate_link:  affLink,
          category_id:     categoryId,
          status:          'active',
          is_best_seller:  (p.sales ?? 0) > 500,
          updated_at:      new Date().toISOString(),
        }, { onConflict: 'shopee_item_id', ignoreDuplicates: false });

        if (error) { log(`❌ ${p.itemId}: ${error.message}`); stats.errors++; }
        else stats.new++;
      } catch (e: any) { log(`❌ Ex ${p?.itemId}: ${e.message}`); stats.errors++; }
    }));
    await new Promise(r => setTimeout(r, 50));
  }

  // Inativa produtos Shopee antigos (>48h)
  const cutoff = new Date(Date.now() - 48 * 3600_000).toISOString();
  await supabase.from('products').update({ status: 'inactive' })
    .eq('platform', 'shopee').eq('status', 'active').lt('updated_at', cutoff);

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  log(`✅ shopee-sync v4 concluído em ${elapsed}s | salvos: ${stats.new} | erros: ${stats.errors}`);

  return new Response(
    JSON.stringify({ success: true, stats, elapsed_s: elapsed, logs }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});
