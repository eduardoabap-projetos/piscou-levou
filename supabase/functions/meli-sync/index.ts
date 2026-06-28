// @ts-check
/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

// ============================================================
// PiscouLevou — Supabase Edge Function: meli-sync v4
// Highlights API + /products/{id}/items com batch paralelo
// Processa N produtos em paralelo para caber no timeout
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

// ─── Constantes ───────────────────────────────────────────────────────────────
const MELI_API_BASE        = 'https://api.mercadolibre.com';
const MELI_SITE_ID         = 'MLB';
const MAX_HIGHLIGHTS       = 60;   // Máximo de highlights por categoria a processar (reduzido para suportar 15 categorias)
const PARALLEL_BATCH       = 8;    // Produtos processados em paralelo simultaneamente
const MIN_COMMISSION_BRL   = 7.0;  // Comissão mínima estimada em R$ para aceitar produto

// Taxas de comissão por meli_category_id (baseado na tabela oficial ML Afiliados)
const CATEGORY_COMMISSION_RATE: Record<string, number> = {
  // Categorias originais — IDs verificados
  'MLB5726':   0.04,  // Eletrodomésticos ~4%
  'MLB263532': 0.08,  // Ferramentas ~8%
  'MLB1574':   0.08,  // Casa, Móveis e Decoração ~8%
  'MLB1000':   0.04,  // Eletrônicos, Áudio e Vídeo ~4%
  'MLB1246':   0.16,  // Beleza e Cuidado Pessoal ~16%
  // Novas categorias — IDs verificados via API
  'MLB1055':   0.04,  // Celulares e Smartphones ~4%
  'MLB1648':   0.04,  // Informática (Computação) ~4%
  'MLB1276':   0.08,  // Esportes e Fitness ~8%
  'MLB1384':   0.10,  // Bebês ~10%
  'MLB1144':   0.06,  // Games ~6%
  'MLB1071':   0.08,  // Pet Shop ~8%
  'MLB1747':   0.08,  // Acessórios para Carros ~8%
  'MLB1430':   0.06,  // Calçados, Roupas e Bolsas (Moda) ~6%
};

// Preço mínimo por categoria para atingir R$7 de comissão
// Calculado automaticamente a partir das taxas acima
const MIN_PRICE_FOR_CATEGORY = (meliCatId: string): number => {
  const rate = CATEGORY_COMMISSION_RATE[meliCatId] ?? 0.04;
  return MIN_COMMISSION_BRL / rate;
};

const OFFICIAL_CATEGORIES_MAP = new Map<string, { name: string; slug: string }>();
// Categorias originais — IDs verificados via API ML
OFFICIAL_CATEGORIES_MAP.set('MLB5726',   { name: 'Eletrodomésticos',        slug: 'eletrodomesticos' });
OFFICIAL_CATEGORIES_MAP.set('MLB263532', { name: 'Ferramentas',             slug: 'ferramentas' });
OFFICIAL_CATEGORIES_MAP.set('MLB1574',   { name: 'Casa e Decoração',        slug: 'casa-e-organizacao' });
OFFICIAL_CATEGORIES_MAP.set('MLB1000',   { name: 'Eletrônicos',             slug: 'eletronicos-e-tecnologia' });
OFFICIAL_CATEGORIES_MAP.set('MLB1246',   { name: 'Beleza e Cuidados',       slug: 'cuidados-pessoais' });
// Novas categorias — IDs verificados via API ML
OFFICIAL_CATEGORIES_MAP.set('MLB1055',   { name: 'Celulares e Smartphones', slug: 'celulares' });
OFFICIAL_CATEGORIES_MAP.set('MLB1648',   { name: 'Informática',             slug: 'computacao' });
OFFICIAL_CATEGORIES_MAP.set('MLB1276',   { name: 'Esportes e Fitness',      slug: 'esportes' });
OFFICIAL_CATEGORIES_MAP.set('MLB1384',   { name: 'Bebês',                   slug: 'bebes' });
OFFICIAL_CATEGORIES_MAP.set('MLB1144',   { name: 'Games',                   slug: 'games' });
OFFICIAL_CATEGORIES_MAP.set('MLB1071',   { name: 'Pet Shop',                slug: 'pet-shop' });
OFFICIAL_CATEGORIES_MAP.set('MLB1747',   { name: 'Automotivo',              slug: 'automotivo' });
OFFICIAL_CATEGORIES_MAP.set('MLB1430',   { name: 'Moda',                    slug: 'moda' });

const TARGET_MELI_CATEGORIES = Array.from(OFFICIAL_CATEGORIES_MAP.keys());

// ─── OAuth2 ───────────────────────────────────────────────────────────────────
async function getMeliAccessToken(log: Function): Promise<string> {
  const clientId     = Deno.env.get('MELI_CLIENT_ID')     ?? '';
  const clientSecret = Deno.env.get('MELI_CLIENT_SECRET') ?? '';

  // ── 1. Tenta usar o token OAuth de usuário salvo no banco ──────────────────
  const { data: tokenRow } = await supabase
    .from('categories')
    .select('meli_category_id')
    .eq('slug', '__meli_tokens__')
    .single();

  if (tokenRow?.meli_category_id) {
    let stored: any = {};
    try { stored = JSON.parse(tokenRow.meli_category_id); } catch {}

    // Ainda válido? (folga de 5 minutos)
    if (stored.access_token && stored.expires_at && Date.now() < stored.expires_at - 300_000) {
      log('✅ Token OAuth de usuário válido (DB cache)');
      return stored.access_token;
    }

    // Expirou — tenta renovar com refresh_token
    if (stored.refresh_token) {
      log('🔄 Renovando access_token via refresh_token...');
      const refreshBody = new URLSearchParams({
        grant_type:    'refresh_token',
        client_id:     clientId,
        client_secret: clientSecret,
        refresh_token: stored.refresh_token,
      });
      const refreshRes = await fetch(`${MELI_API_BASE}/oauth/token`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    refreshBody.toString(),
      });
      if (refreshRes.ok) {
        const d = await refreshRes.json();
        if (d.access_token) {
          // Salva o token renovado
          await supabase.from('categories').upsert({
            name:             '__meli_tokens__',
            slug:             '__meli_tokens__',
            meli_category_id: JSON.stringify({
              access_token:  d.access_token,
              refresh_token: d.refresh_token ?? stored.refresh_token,
              expires_at:    Date.now() + (d.expires_in ?? 21600) * 1000,
              user_id:       d.user_id ?? stored.user_id,
            }),
          }, { onConflict: 'slug' });
          log(`✅ Token renovado via refresh (expira em ${d.expires_in}s)`);
          return d.access_token;
        }
      }
      log('⚠️ Refresh falhou, tentando MELI_ACCESS_TOKEN...');
    }
  }

  // ── 2. Fallback: MELI_ACCESS_TOKEN da variável de ambiente ────────────────
  const existing = Deno.env.get('MELI_ACCESS_TOKEN');
  if (existing) {
    const test = await fetch(`${MELI_API_BASE}/users/me`, {
      headers: { Authorization: `Bearer ${existing}` },
    });
    if (test.ok) {
      log('✅ Token MELI_ACCESS_TOKEN (env var) válido');
      return existing;
    }
    log('⚠️ MELI_ACCESS_TOKEN expirado, usando client_credentials...');
  }

  // ── 3. Último recurso: client_credentials ─────────────────────────────────
  if (!clientId || !clientSecret) throw new Error('MELI_CLIENT_ID/SECRET não configurados.');
  const res = await fetch(`${MELI_API_BASE}/oauth/token`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
  });
  if (!res.ok) throw new Error(`Falha OAuth2: ${res.status}`);
  const data = await res.json();
  log(`✅ Token client_credentials (expira em ${data.expires_in}s) — sem acesso a sale_price`);
  return data.access_token;
}


// ─── Helpers ─────────────────────────────────────────────────────────────────
function generateSlug(text = ''): string {
  return text
    .toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim().replace(/\s+/g, '-').slice(0, 80);
}

// URL de fallback para quando a API de afiliados não estiver disponível
function buildAffiliateLinkFallback(catalogProductId: string, itemPermalink?: string): string {
  const MATT_TOOL = '90738350';
  const MATT_WORD = 'piscoulevou';
  const base = (itemPermalink && itemPermalink.startsWith('http'))
    ? itemPermalink
    : `https://www.mercadolivre.com.br/p/${catalogProductId}`;
  try {
    const url = new URL(base);
    url.searchParams.set('matt_tool', MATT_TOOL);
    url.searchParams.set('matt_word', MATT_WORD);
    return url.toString();
  } catch {
    return `https://www.mercadolivre.com.br/p/${catalogProductId}?matt_tool=${MATT_TOOL}&matt_word=${MATT_WORD}`;
  }
}

// ── API oficial de afiliados ML: gera links com ref= criptografado ────────────
// Usa cookies de sessão do browser (secret ML_SESSION_COOKIES)
// Retorna mapa: { originUrl → short_url } para cada produto
async function generateMeliAffiliateLinks(
  productUrls: string[],
  log: (...args: any[]) => void
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const sessionCookies = Deno.env.get('ML_SESSION_COOKIES') ?? '';

  if (!sessionCookies) {
    log('⚠️ ML_SESSION_COOKIES não configurado — usando links de fallback');
    return result;
  }

  // Passo 1: GET no portal para obter CSRF token da página
  let csrfToken = '';
  let allCookies = sessionCookies;
  try {
    const portalRes = await fetch('https://www.mercadolivre.com.br/afiliados/linkbuilder', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        'Cookie': sessionCookies,
      },
    });

    // Falhou autenticação — cookies expirados
    if (!portalRes.ok || portalRes.url.includes('lgz/login')) {
      log('⚠️ Cookies de sessão ML expirados — renovar ML_SESSION_COOKIES');
      return result;
    }

    // Captura cookies novos do portal
    const newC = portalRes.headers.get('set-cookie') ?? '';
    if (newC) {
      const parsed = newC.split(/,(?=[^ ])/).map((c: string) => c.split(';')[0].trim()).join('; ');
      allCookies = `${sessionCookies}; ${parsed}`;
    }

    // Extrai CSRF token
    const html = await portalRes.text();
    const m = html.match(/<meta[^>]+name=["']csrf-token["'][^>]+content=["']([^"']+)["']/i)
           || html.match(/csrfToken["']?\s*[=:]\s*["']([^"']{10,})["']/i);
    csrfToken = m?.[1] ?? (sessionCookies.match(/_csrf=([^;]+)/)?.[1] ?? '');

    if (!csrfToken) {
      log('⚠️ CSRF token não encontrado no portal');
      return result;
    }
    log(`✅ Portal de afiliados acessado. CSRF obtido.`);
  } catch (e) {
    log('⚠️ Erro ao acessar portal de afiliados:', e);
    return result;
  }

  // Passo 2: Gera links em batches de 20 URLs por chamada
  const BATCH_SIZE = 20;
  const AFFILIATE_API = 'https://www.mercadolivre.com.br/affiliate-program/api/v2/affiliates/createLink';
  const batchList = chunks(productUrls, BATCH_SIZE);

  for (const batch of batchList) {
    try {
      const res = await fetch(AFFILIATE_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/plain, */*',
          'Origin': 'https://www.mercadolivre.com.br',
          'Referer': 'https://www.mercadolivre.com.br/afiliados/linkbuilder',
          'x-csrf-token': csrfToken,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0',
          'Accept-Language': 'pt-BR,pt;q=0.9',
          'Cookie': allCookies,
        },
        body: JSON.stringify({ urls: batch, tag: 'piscoulevou' }),
      });

      if (!res.ok) {
        log(`⚠️ Batch de ${batch.length} URLs falhou: HTTP ${res.status}`);
        continue;
      }

      const data = await res.json() as any;
      for (const item of (data.urls ?? [])) {
        if (item.created && item.short_url && item.origin_url) {
          result.set(item.origin_url, item.short_url);
        }
      }
      log(`✅ Batch: ${data.total_success}/${batch.length} links gerados`);

      // Respeita rate limit — 300ms entre batches
      await new Promise(r => setTimeout(r, 300));
    } catch (e) {
      log('⚠️ Erro no batch de links de afiliado:', e);
    }
  }

  log(`🔗 Total de links de afiliado gerados: ${result.size}/${productUrls.length}`);
  return result;
}


function upgradeImageUrl(url: string): string {
  if (!url) return '';
  return url
    .replace(/^http:/, 'https:')
    .replace(/-[IV]\.(jpg|jpeg|webp|png)$/i, '-O.$1');
}

// Divide um array em chunks de tamanho N
function chunks<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}

// ─── Constantes de elegibilidade para afiliados ─────────────────────────────
const NON_AFFILIATE_TYPES = new Set(['free', 'bronze']);
const ML_OWN_STORE_IDS   = new Set([880, 3562, 1532, 2479]);

// ─── ProductResult ────────────────────────────────────────────────────────────
interface ProductResult {
  itemId:        string;
  title:         string;
  price:         number;
  originalPrice: number | null;
  imageUrl:      string;
  permalink:     string;  // permalink do anúncio do vendedor (quando disponível via /items/{id})
}

// ─── Subcategoria info ────────────────────────────────────────────────────────
interface SubcatInfo { id: string; name: string; }

// ─── Busca IDs de destaque (Highlights API) ────────────────────────────────────
// Varre 2 níveis de subcategorias e retorna:
// - ids: lista de catalog product IDs (até MAX_HIGHLIGHTS)
// - subcatMap: mapa catalogProductId → {id, name} da subcategoria de nível 1
async function fetchHighlightIds(
  meliCatId: string,
  token: string,
  log: Function
): Promise<{ ids: string[]; subcatMap: Map<string, SubcatInfo> }> {
  const ids: string[] = [];
  const seen = new Set<string>();
  const subcatMap = new Map<string, SubcatInfo>(); // catalogProductId → subcat

  // Nível 1: subcategorias diretas + nomes
  const level1: { id: string; name: string }[] = [];
  try {
    const r = await fetch(`${MELI_API_BASE}/categories/${meliCatId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.ok) {
      const d = await r.json();
      for (const c of (d.children_categories ?? [])) {
        level1.push({ id: c.id, name: c.name });
      }
    }
  } catch {}

  // Nível 2: filhos das subcategorias de nível 1 (expande cobertura)
  const level2: { id: string; name: string; parentName: string }[] = [];
  for (const l1 of level1.slice(0, 6)) {
    try {
      const r = await fetch(`${MELI_API_BASE}/categories/${l1.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.ok) {
        const d = await r.json();
        // Se a subcategoria de nível 1 não tem filhos, ela mesma é a folha
        if ((d.children_categories ?? []).length === 0) continue;
        for (const c of (d.children_categories ?? []).slice(0, 4)) {
          level2.push({ id: c.id, name: c.name, parentName: l1.name });
        }
      }
    } catch {}
    await new Promise(r => setTimeout(r, 30));
  }

  // Monta lista: raiz (null name) + level1 + level2
  // subcatInfo: qual subcategoria de nível 1 atribuir a cada produto
  const allCats: { id: string; subcatInfo: SubcatInfo | null }[] = [
    { id: meliCatId, subcatInfo: null }, // raiz — sem subcategoria específica
    ...level1.map(l => ({ id: l.id, subcatInfo: { id: l.id, name: l.name } })),
    // para lvl2, atribuímos o nome do pai (lvl1) como subcategoria visível
    ...level2.map(l => ({ id: l.id, subcatInfo: { id: l.id, name: l.parentName } })),
  ];

  log(`   [Highlights] Varrendo ${allCats.length} cats (raiz + ${level1.length} lvl1 + ${level2.length} lvl2)`);

  for (const { id: catId, subcatInfo } of allCats) {
    try {
      const r = await fetch(
        `${MELI_API_BASE}/highlights/${MELI_SITE_ID}/category/${catId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (r.ok) {
        const d = await r.json();
        for (const item of (d.content ?? [])) {
          if (item.id && !seen.has(item.id)) {
            seen.add(item.id);
            ids.push(item.id);
            // Registra subcategoria apenas se vier de uma subcat (não da raiz)
            if (subcatInfo) subcatMap.set(item.id, subcatInfo);
          }
        }
      }
    } catch {}
    await new Promise(r => setTimeout(r, 40));
  }

  log(`   [Highlights] ${ids.length} IDs únicos (${subcatMap.size} com subcategoria registrada)`);
  return { ids, subcatMap };
}

// ─── Processa UM produto do catálogo ML ───────────────────────────────────────
// Retorna null se não encontrar dados válidos.
// MELHORIA KEY: quando /items/{id} retorna 200, usa o permalink do anúncio
// específico do vendedor (preço exibido = preço na página de destino).
// Para itens gerenciados pelo catálogo (403 em /items), usa a página de catálogo.
async function processOneCatalogProduct(
  productId: string,
  token: string,
): Promise<ProductResult | null> {
  // ── Busca listings do catálogo ────────────────────────────────────────────
  const [productRes, listingRes] = await Promise.allSettled([
    fetch(`${MELI_API_BASE}/products/${productId}?attributes=id,name,pictures`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    fetch(`${MELI_API_BASE}/products/${productId}/items`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  ]);

  if (listingRes.status === 'rejected' || !listingRes.value.ok) return null;

  const listingData = await listingRes.value.json();
  const results = (listingData.results ?? []) as any[];

  // Buy box winner: ML marca o vendedor vencedor com is_winner=true
  // Esse é o preço que o site ML exibe — priorizar sobre o primeiro da lista
  const isEligible = (r: any) =>
    r.price > 0 &&
    (r.available_quantity === undefined || r.available_quantity > 0) &&
    !NON_AFFILIATE_TYPES.has(r.listing_type_id) &&
    r.condition !== 'used' &&
    !ML_OWN_STORE_IDS.has(r.official_store_id);

  const winner = results.find((r: any) => r.is_winner === true && isEligible(r));
  const best   = winner ?? results.find(isEligible);

  if (!best) return null;

  // ── Resolve nome e imagem ─────────────────────────────────────────────────
  let name     = '';
  let imageUrl = '';

  if (productRes.status === 'fulfilled' && productRes.value.ok) {
    const productData = await productRes.value.json();
    name     = productData.name ?? '';
    imageUrl = upgradeImageUrl(productData.pictures?.[0]?.url ?? '');
  }

  // Fallback via /items/{id} — para itens não gerenciados retorna 200
  // Quando retorna 200: temos o permalink exato do anúncio do vendedor ✅
  if (!name) {
    try {
      const itemRes = await fetch(
        `${MELI_API_BASE}/items/${best.item_id}?attributes=id,title,thumbnail,pictures,permalink,price,original_price,sale_price`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (itemRes.ok) {
        const d  = await itemRes.json();
        name     = d.title ?? '';
        imageUrl = upgradeImageUrl(d.thumbnail ?? d.pictures?.[0]?.url ?? '');
        if (name) {
          // Preço com Pix (quando disponível e desconto razoável)
          const sp = d.sale_price?.price;
          const ctx = d.sale_price?.conditions?.context_restrictions ?? [];
          const isPix = Boolean(sp && ctx.includes('pix'));
          const disc = isPix ? (d.price - sp) / d.price : 0;
          const finalPrice = (isPix && disc <= 0.30) ? sp : (d.price ?? best.price);
          return {
            itemId:        best.item_id,
            title:         name,
            price:         Math.round(finalPrice * 100) / 100,
            originalPrice: d.original_price ?? best.original_price ?? null,
            imageUrl,
            permalink:     d.permalink ?? '',  // ← permalink exato do vendedor ✅
          };
        }
      }
    } catch {}
  }

  if (!name) return null;

  // ── Preço final via /items/{id} (com sale_price/Pix) ──────────────────────
  try {
    const itemRes = await fetch(
      `${MELI_API_BASE}/items/${best.item_id}?attributes=id,status,price,original_price,sale_price,permalink`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (itemRes.ok) {
      const d         = await itemRes.json();
      const salePrice = d.sale_price?.price;
      const saleCtx   = d.sale_price?.conditions?.context_restrictions ?? [];
      const isPixSale = Boolean(salePrice && saleCtx.includes('pix'));
      const listingPrice  = d.price ?? best.price;
      const pixDiscount   = isPixSale ? (listingPrice - salePrice) / listingPrice : 0;
      const validPixSale  = isPixSale && pixDiscount <= 0.30;
      return {
        itemId:        best.item_id,
        title:         name,
        price:         validPixSale ? Math.round(salePrice * 100) / 100 : Math.round(listingPrice * 100) / 100,
        originalPrice: d.original_price ?? best.original_price ?? null,
        imageUrl,
        permalink:     d.permalink ?? '',  // ← permalink exato quando disponível ✅
      };
    }
  } catch {}

  return {
    itemId:        best.item_id,
    title:         name,
    price:         Math.round(best.price * 100) / 100,
    originalPrice: best.original_price ?? null,
    imageUrl,
    permalink:     best.permalink ?? '',
  };
}


// ─── Verificação em lote de status e preços (Step 3) ─────────────────────────


interface ItemDetail { status: string; price?: number; originalPrice?: number | null; }

async function checkItemsInBatch(
  itemIds: string[],
  token: string,
  log: Function,
): Promise<Map<string, ItemDetail>> {
  const map = new Map<string, ItemDetail>();
  for (const batch of chunks(itemIds, 20)) {
    try {
      const res = await fetch(
        `${MELI_API_BASE}/items?ids=${batch.join(',')}&attributes=id,status,price,original_price,sale_price`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const data = await res.json();
        for (const item of data) {
          const id = item.body?.id || item.id || '';
          if (!id) continue;
          if (item.code === 200 && item.body) {
            const b      = item.body;
            const sp     = b.sale_price?.price;
            const ctx    = b.sale_price?.conditions?.context_restrictions ?? [];
            const isPix  = Boolean(sp && ctx.includes('pix'));
            map.set(id, {
              status:        b.status,
              price:         isPix ? Math.round(sp * 100) / 100 : (b.price ? Math.round(b.price * 100) / 100 : undefined),
              originalPrice: b.original_price ?? null,
            });
          } else {
            map.set(id, { status: 'not_found' });
          }
        }
      }
    } catch (e) { log(`❌ Batch check erro:`, e); }
    await new Promise(r => setTimeout(r, 80));
  }
  return map;
}

// ─── Cache de categorias ──────────────────────────────────────────────────────
const categoryCache = new Map<string, string>();

async function resolveCategory(meliCatId: string, log: Function): Promise<string | null> {
  const info = OFFICIAL_CATEGORIES_MAP.get(meliCatId);
  if (!info) return null;
  if (categoryCache.has(meliCatId)) return categoryCache.get(meliCatId)!;

  const { data: dbCat } = await supabase.from('categories').select('id').eq('meli_category_id', meliCatId).maybeSingle();
  if (dbCat) { categoryCache.set(meliCatId, dbCat.id); return dbCat.id; }

  log(`📂 Criando categoria: ${info.name}`);
  const { data: newCat, error } = await supabase
    .from('categories')
    .insert({ name: info.name, slug: info.slug, meli_category_id: meliCatId })
    .select('id').maybeSingle();
  if (error || !newCat) return null;
  categoryCache.set(meliCatId, newCat.id);
  return newCat.id;
}

// ─── Handler Principal ────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const urlObj    = new URL(req.url);
  const startTime = Date.now();
  const logs: string[] = [];
  const log = (...args: any[]) => {
    const line = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    console.log(line);
    logs.push(line);
  };

  // ── Corrige todos os links de afiliado antigos: ?fix_all_affiliate_links=1 ──
  // Busca todos os produtos ativos com links de fallback (matt_tool) ou forceInApp
  // e gera links meli.la com ref= para todos via API do portal ML
  if (urlObj.searchParams.has('fix_all_affiliate_links')) {
    const results: any = { started_at: new Date().toISOString() };

    // Busca todos os produtos com links de fallback OU forceInApp
    const { data: stale, error: fetchErr } = await supabase
      .from('products')
      .select('id, meli_item_id, affiliate_link')
      .eq('status', 'active')
      .or('affiliate_link.like.%matt_tool%,affiliate_link.like.%forceInApp%');

    if (fetchErr || !stale) {
      results.error = fetchErr?.message ?? 'Nenhum produto encontrado';
      return new Response(JSON.stringify(results, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    results.found = stale.length;
    log(`🔍 ${stale.length} produtos com links antigos encontrados.`);

    // Normaliza URLs: remove matt_tool, matt_word, forceInApp para ter a URL base
    const productBaseUrls = stale.map((p: any) => {
      try {
        const url = new URL(p.affiliate_link);
        url.searchParams.delete('matt_tool');
        url.searchParams.delete('matt_word');
        url.searchParams.delete('forceInApp');
        return url.toString();
      } catch { return p.affiliate_link; }
    });

    // Gera os links via API do portal ML (com cookies de sessão)
    const affiliateMap = await generateMeliAffiliateLinks(productBaseUrls, log);
    results.generated = affiliateMap.size;

    // Atualiza o banco com os short URLs
    let updated = 0;
    const updateOps: Promise<any>[] = [];
    for (let i = 0; i < stale.length; i++) {
      const shortUrl = affiliateMap.get(productBaseUrls[i]);
      if (shortUrl) {
        updateOps.push(
          supabase.from('products')
            .update({ affiliate_link: shortUrl, updated_at: new Date().toISOString() })
            .eq('meli_item_id', stale[i].meli_item_id)
        );
        updated++;
      } else {
        // Ao menos remove o forceInApp do link de fallback
        const cleanUrl = productBaseUrls[i] + `?matt_tool=90738350&matt_word=piscoulevou`;
        updateOps.push(
          supabase.from('products')
            .update({ affiliate_link: cleanUrl, updated_at: new Date().toISOString() })
            .eq('meli_item_id', stale[i].meli_item_id)
        );
      }
    }
    for (const batch of chunks(updateOps, 20)) {
      await Promise.allSettled(batch);
    }

    results.updated_with_meli_la = updated;
    results.updated_fallback_cleaned = stale.length - updated;
    results.conclusion = `✅ ${updated} links atualizados para meli.la | ${stale.length - updated} fallbacks limpos (sem forceInApp)`;
    results.logs = logs;

    return new Response(JSON.stringify(results, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  // ── Gera link de afiliado via sessão ML: ?test_affiliate_link={productUrl} ──
  // Fluxo: cookies de sessão do browser (secret ML_SESSION_COOKIES) → portal CSRF → createLink
  const testAffUrl = urlObj.searchParams.get('test_affiliate_link');

  if (testAffUrl) {
    const productUrl = decodeURIComponent(testAffUrl);
    const results: any = { product_url: productUrl };

    // Carrega cookies de sessão do secret Supabase
    const sessionCookies = Deno.env.get('ML_SESSION_COOKIES') ?? '';
    results.has_session_cookies = !!sessionCookies;
    results.cookie_count = sessionCookies ? sessionCookies.split(';').length : 0;

    if (!sessionCookies) {
      results.error = 'Secret ML_SESSION_COOKIES não configurado. Execute: npx supabase secrets set ML_SESSION_COOKIES="..."';
      return new Response(JSON.stringify(results, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // ── Passo 1: GET no portal de afiliados com os cookies reais de sessão ───
    // Com cookies válidos, deve acessar o portal diretamente (sem redirecionar p/ login)
    const portalRes = await fetch('https://www.mercadolivre.com.br/afiliados/linkbuilder', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        'Cookie': sessionCookies,
      },
    });
    const portalHtml = await portalRes.text();
    results.portal_fetch = {
      http_status: portalRes.status,
      redirected: portalRes.redirected,
      final_url: portalRes.url,
      reached_portal: !portalRes.url.includes('lgz/login') && !portalRes.url.includes('jms/mlb'),
      html_size: portalHtml.length,
    };

    // Atualiza cookies com qualquer novo cookie retornado pelo portal
    const newCookies = portalRes.headers.get('set-cookie') ?? '';
    let allCookies = sessionCookies;
    if (newCookies) {
      const newC = newCookies.split(/,(?=[^ ])/).map((c: string) => c.split(';')[0].trim()).join('; ');
      allCookies = `${sessionCookies}; ${newC}`;
    }

    // Extrai CSRF token da página do portal (meta tag ou variável JS)
    const csrfMatch = portalHtml.match(/<meta[^>]+name=["']csrf-token["'][^>]+content=["']([^"']+)["']/i)
                   || portalHtml.match(/["']?csrfToken["']?\s*[=:]\s*["']([^"']{10,})["']/i)
                   || portalHtml.match(/"csrf"\s*:\s*"([^"]{10,})"/i)
                   || portalHtml.match(/name="csrf-token" content="([^"]+)"/i);

    // Fallback: usa o _csrf do cookie (double-submit pattern)
    const csrfFromCookie = sessionCookies.match(/_csrf=([^;]+)/)?.[1] ?? null;
    const csrfToken = csrfMatch?.[1] ?? csrfFromCookie;

    results.csrf_from_page = !!csrfMatch;
    results.csrf_from_cookie = !csrfMatch && !!csrfFromCookie;
    results.csrf_prefix = csrfToken ? csrfToken.slice(0, 20) + '...' : null;

    if (!csrfToken) {
      results.conclusion = 'CSRF token não encontrado — cookies podem estar expirados ou inválidos';
      return new Response(JSON.stringify(results, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (!results.portal_fetch.reached_portal) {
      results.conclusion = '❌ Portal redirecionou para login — cookies de sessão inválidos ou expirados';
      return new Response(JSON.stringify(results, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // ── Passo 2: POST createLink com cookies e CSRF ──────────────────────────
    const linkRes = await fetch('https://www.mercadolivre.com.br/affiliate-program/api/v2/affiliates/createLink', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*',
        'Origin': 'https://www.mercadolivre.com.br',
        'Referer': 'https://www.mercadolivre.com.br/afiliados/linkbuilder',
        'x-csrf-token': csrfToken,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        'Cookie': allCookies,
      },
      body: JSON.stringify({ urls: [productUrl], tag: 'piscoulevou' }),
    });
    const linkText = await linkRes.text();
    results.create_link = {
      http_status: linkRes.status,
      response: linkRes.ok
        ? (() => { try { return JSON.parse(linkText); } catch { return linkText; } })()
        : linkText.slice(0, 500),
    };

    results.conclusion = linkRes.ok
      ? '✅ SUCESSO! Link de afiliado gerado com ref= válido!'
      : `❌ Falhou com ${linkRes.status}`;

    return new Response(JSON.stringify(results, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }


  // ── Testa Search API com token do DB: ?test_search={catId} ─────────────────

  const testSearchCat = urlObj.searchParams.get('test_search');
  if (testSearchCat) {
    const dbToken = await getMeliAccessToken(log).catch(() => null);
    const results: any = { token_type: dbToken?.startsWith('APP_USR') ? 'user_oauth' : 'client_credentials' };

    // Testa com token do DB
    const r1 = await fetch(`${MELI_API_BASE}/sites/${MELI_SITE_ID}/search?category=${testSearchCat}&limit=3`, {
      headers: dbToken ? { Authorization: `Bearer ${dbToken}` } : {},
    });
    results.with_db_token = {
      http_status: r1.status,
      total: r1.ok ? (await r1.json()).paging?.total : null,
      error: r1.ok ? null : await r1.text(),
    };

    // Testa sem nenhum token
    const r2 = await fetch(`${MELI_API_BASE}/sites/${MELI_SITE_ID}/search?category=${testSearchCat}&limit=3`);
    results.without_token = { http_status: r2.status };

    // Testa /items/{id} com token do DB (para comparar)
    const r3 = await fetch(`${MELI_API_BASE}/items/MLB4662975422?attributes=id,price,permalink`, {
      headers: dbToken ? { Authorization: `Bearer ${dbToken}` } : {},
    });
    results.items_endpoint = {
      http_status: r3.status,
      price: r3.ok ? (await r3.json()).price : null,
    };

    return new Response(JSON.stringify(results, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  // ── OAuth PKCE: ?start_oauth → gera URL de autorização com PKCE ─────────────
  if (urlObj.searchParams.has('start_oauth')) {
    const clientId   = Deno.env.get('MELI_CLIENT_ID') ?? '';
    const redirectUri = 'https://piscoulevou.com.br';


    // Gera code_verifier (43 chars, URL-safe)
    const verifierBytes = crypto.getRandomValues(new Uint8Array(32));
    const codeVerifier  = btoa(String.fromCharCode(...verifierBytes))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

    // Computa code_challenge = BASE64URL(SHA256(verifier))
    const enc       = new TextEncoder();
    const hashBuf   = await crypto.subtle.digest('SHA-256', enc.encode(codeVerifier));
    const hashArr   = new Uint8Array(hashBuf);
    const codeChallenge = btoa(String.fromCharCode(...hashArr))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

    // Salva o verifier no Supabase (na tabela categories, linha especial)
    await supabase.from('categories').upsert({
      name:             '__oauth_pkce__',
      slug:             '__oauth_pkce__',
      meli_category_id: codeVerifier,   // usa meli_category_id para armazenar o verifier
    }, { onConflict: 'slug' });

    const authUrl = `https://auth.mercadolivre.com.br/authorization?response_type=code`
      + `&client_id=${clientId}`
      + `&redirect_uri=${encodeURIComponent(redirectUri)}`
      + `&code_challenge=${codeChallenge}`
      + `&code_challenge_method=S256`;

    return new Response(JSON.stringify({
      auth_url:       authUrl,
      redirect_uri:   redirectUri,
      code_challenge: codeChallenge,
      instruction:    'Abra auth_url no browser. Após autorizar, copie o code=TG-... da URL e chame ?exchange_code={code}',
    }, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  // ── Troca de código OAuth PKCE: ?exchange_code={code} ───────────────────────
  const oauthCode = urlObj.searchParams.get('exchange_code');
  if (oauthCode) {
    const clientId     = Deno.env.get('MELI_CLIENT_ID') ?? '';
    const clientSecret = Deno.env.get('MELI_CLIENT_SECRET') ?? '';
    const redirectUri  = 'https://piscoulevou.com.br';

    // Recupera o code_verifier salvo
    const { data: pkceRow } = await supabase
      .from('categories')
      .select('meli_category_id')
      .eq('slug', '__oauth_pkce__')
      .single();

    const codeVerifier = pkceRow?.meli_category_id ?? null;
    if (!codeVerifier) {
      return new Response(JSON.stringify({ error: 'code_verifier não encontrado. Chame ?start_oauth primeiro.' }), { status: 400 });
    }

    const body = new URLSearchParams({
      grant_type:    'authorization_code',
      client_id:     clientId,
      client_secret: clientSecret,
      code:          oauthCode,
      redirect_uri:  redirectUri,
      code_verifier: codeVerifier,
    });

    const res  = await fetch('https://api.mercadolibre.com/oauth/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body:    body.toString(),
    });
    const data = await res.json();

    // Se sucesso, salva o refresh_token como secret no Supabase
    if (data.access_token) {
      // Salva na tabela para uso pelo sync
      await supabase.from('categories').upsert({
        name:             '__meli_tokens__',
        slug:             '__meli_tokens__',
        meli_category_id: JSON.stringify({
          access_token:  data.access_token,
          refresh_token: data.refresh_token,
          expires_at:    Date.now() + (data.expires_in ?? 21600) * 1000,
          user_id:       data.user_id,
        }),
      }, { onConflict: 'slug' });
    }

    return new Response(JSON.stringify({
      http_status:    res.status,
      success:        !!data.access_token,
      access_token:   data.access_token  ? data.access_token.slice(0, 20) + '...' : null,
      refresh_token:  data.refresh_token ? data.refresh_token.slice(0, 20) + '...' : null,
      token_type:     data.token_type    ?? null,
      expires_in:     data.expires_in    ?? null,
      scope:          data.scope         ?? null,
      user_id:        data.user_id       ?? null,
      error:          data.error         ?? null,
      error_description: data.error_description ?? null,
    }, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  // ── Modo diagnóstico: ?diagnose={catalogProductId} ─────────────────────────
  // Retorna os dados brutos da API do ML para um produto específico.
  // Permite ver exatamente quais campos estão disponíveis em cada listing.
  const diagnoseId = urlObj.searchParams.get('diagnose');
  if (diagnoseId) {
    const token = await getMeliAccessToken(log).catch(() => null);
    if (!token) return new Response(JSON.stringify({ error: 'Auth failed', logs }), { status: 500 });

    const [prodRes, itemsRes] = await Promise.all([
      fetch(`${MELI_API_BASE}/products/${diagnoseId}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch(`${MELI_API_BASE}/products/${diagnoseId}/items?limit=10`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);

    const prodData  = prodRes.ok  ? await prodRes.json()  : { error: prodRes.status };
    const itemsData = itemsRes.ok ? await itemsRes.json() : { error: itemsRes.status };

    return new Response(JSON.stringify({
      product: {
        status: prodRes.status,
        fields: Object.keys(prodData),
        buy_box_winner: prodData.buy_box_winner ?? null,
        name: prodData.name,
      },
      items: {
        status: itemsRes.status,
        total: itemsData.paging?.total,
        fields_per_item: itemsData.results?.[0] ? Object.keys(itemsData.results[0]) : [],
        listings: (itemsData.results ?? []).slice(0, 8).map((r: any) => ({
          item_id:          r.item_id,
          price:            r.price,
          original_price:   r.original_price,
          status:           r.status,
          available_qty:    r.available_quantity,
          use_thumbnail:    r.use_thumbnail,
          is_winner:        r.is_winner,
          catalog_listing:  r.catalog_listing,
          winner:           r.winner,
          extra_fields:     Object.keys(r).filter(k =>
            !['item_id','price','original_price','status','available_quantity'].includes(k)
          ),
        })),
      },
    }, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  // ── Diagnóstico de item específico: ?diagnose_item={itemId} ─────────────────
  const diagnoseItemId = urlObj.searchParams.get('diagnose_item');
  if (diagnoseItemId) {
    const token = await getMeliAccessToken(log).catch(() => null);
    if (!token) return new Response(JSON.stringify({ error: 'Auth failed' }), { status: 500 });

    // Tenta COM filtro de atributos (como faz o sync)
    const itemResFiltered = await fetch(
      `https://api.mercadolibre.com/items/${diagnoseItemId}?attributes=id,status,price,original_price,sale_price,permalink`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const filteredStatus = itemResFiltered.status;
    const filteredData = itemResFiltered.ok ? await itemResFiltered.json() : await itemResFiltered.text();

    // Tenta SEM filtro (para ver todos os campos)
    const itemResRaw = await fetch(
      `https://api.mercadolibre.com/items/${diagnoseItemId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const rawStatus = itemResRaw.status;
    const rawData = itemResRaw.ok ? await itemResRaw.json() : await itemResRaw.text();

    // Testa o BATCH endpoint (como usa o Step 3)
    const batchRes = await fetch(
      `https://api.mercadolibre.com/items?ids=${diagnoseItemId}&attributes=id,price,sale_price`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const batchData = batchRes.ok ? await batchRes.json() : null;
    const batchItem = batchData?.[0]?.body ?? null;

    return new Response(JSON.stringify({
      token_prefix:  token ? token.slice(0, 20) + '...' : null,
      token_type:    token?.startsWith('APP_USR') ? 'user_oauth' : 'client_credentials',
      filtered_call: {
        http_status:   filteredStatus,
        price:         filteredData?.price,
        original_price: filteredData?.original_price,
        sale_price:    filteredData?.sale_price ?? null,
        sale_price_keys: filteredData?.sale_price ? Object.keys(filteredData.sale_price) : [],
        error:         typeof filteredData === 'string' ? filteredData : null,
      },
      raw_call: {
        http_status:   rawStatus,
        price:         rawData?.price,
        original_price: rawData?.original_price,
        sale_price:    rawData?.sale_price ?? null,
        sale_price_keys: rawData?.sale_price ? Object.keys(rawData.sale_price) : [],
        top_fields:    rawData && typeof rawData === 'object' ? Object.keys(rawData).join(', ') : String(rawData).slice(0, 200),
      },
      batch_call: {
        http_status:     batchRes.status,
        code:            batchData?.[0]?.code ?? null,
        price:           batchItem?.price ?? null,
        sale_price:      batchItem?.sale_price ?? null,
        sale_price_keys: batchItem?.sale_price ? Object.keys(batchItem.sale_price) : [],
      },
    }, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  // ── Diagnóstico do token: ?diagnose_token ───────────────────────────────────
  const diagnoseToken = urlObj.searchParams.get('diagnose_token');
  if (diagnoseToken !== null) {
    const existingToken = Deno.env.get('MELI_ACCESS_TOKEN') ?? '';
    const clientId      = Deno.env.get('MELI_CLIENT_ID') ?? '';

    // Testa o token MELI_ACCESS_TOKEN existente
    const meRes  = existingToken
      ? await fetch('https://api.mercadolibre.com/users/me', { headers: { Authorization: `Bearer ${existingToken}` } })
      : null;
    const meData = (meRes as any)?.ok ? await (meRes as any).json() : null;

    // Obtém um token de client_credentials para comparar
    const ccRes  = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'client_credentials', client_id: Deno.env.get('MELI_CLIENT_ID'), client_secret: Deno.env.get('MELI_CLIENT_SECRET') }),
    });
    const ccData = ccRes.ok ? await ccRes.json() : null;
    const ccToken = ccData?.access_token ?? '';

    // Testa /items/{id} com o token atual (access_token ou cc)
    const activeToken = ((meRes as any)?.ok ? existingToken : ccToken);
    const itemRes1 = await fetch('https://api.mercadolibre.com/items/MLB4662975422?attributes=id,price,sale_price', {
      headers: { Authorization: `Bearer ${activeToken}` },
    });
    const itemRes1Data = itemRes1.ok ? await itemRes1.json() : null;

    // Testa sale_terms no products/items para a Makita (MLB19802405)
    const prodItemsRes = await fetch('https://api.mercadolibre.com/products/MLB19802405/items?limit=1', {
      headers: { Authorization: `Bearer ${activeToken}` },
    });
    const prodItemsData = prodItemsRes.ok ? await prodItemsRes.json() : null;
    const firstItem = prodItemsData?.results?.[0] ?? null;

    return new Response(JSON.stringify({
      meli_access_token: {
        configured:   !!existingToken,
        prefix:       existingToken ? existingToken.slice(0, 15) + '...' : null,
        valid:        (meRes as any)?.ok ?? false,
        user_id:      meData?.id ?? null,
      },
      configured_client_id: clientId,
      cc_token_obtained:    !!ccToken,
      item_endpoint_test: {
        token_used:       (meRes as any)?.ok ? 'MELI_ACCESS_TOKEN' : 'client_credentials',
        http_status:      itemRes1.status,
        price:            itemRes1Data?.price ?? null,
        sale_price:       itemRes1Data?.sale_price ?? null,
        sale_price_keys:  itemRes1Data?.sale_price ? Object.keys(itemRes1Data.sale_price) : [],
      },
      products_items_first: {
        item_id:          firstItem?.item_id,
        price:            firstItem?.price,
        sale_terms_count: Array.isArray(firstItem?.sale_terms) ? firstItem.sale_terms.length : null,
        sale_terms_sample: Array.isArray(firstItem?.sale_terms) ? firstItem.sale_terms.slice(0, 3) : firstItem?.sale_terms,
      },
    }, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  // ── Fix item URLs: ?fix_item_urls → converte produto.mercadolivre.com.br para /p/{catalogId} ──
  // Necessário porque produto.mercadolivre.com.br/{id}-_JM pode não trackear comissões corretamente.
  if (urlObj.searchParams.has('fix_item_urls')) {
    const token = await getMeliAccessToken(log).catch(() => null);
    if (!token) return new Response(JSON.stringify({ error: 'Auth failed', logs }), { status: 500 });

    const { data: itemProducts } = await supabase
      .from('products')
      .select('id, meli_item_id, affiliate_link, title')
      .eq('status', 'active')
      .like('affiliate_link', '%produto.mercadolivre.com.br%');

    log(`🔧 [fix_item_urls] ${itemProducts?.length ?? 0} produtos com item-URL para converter.`);
    let fixed = 0; let failed = 0; const BATCH = 10;

    for (let i = 0; i < (itemProducts?.length ?? 0); i += BATCH) {
      const batch = (itemProducts ?? []).slice(i, i + BATCH);
      await Promise.all(batch.map(async (p) => {
        try {
          const r = await fetch(
            `${MELI_API_BASE}/items/${p.meli_item_id}?attributes=catalog_product_id,permalink`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (!r.ok) { failed++; return; }
          const d = await r.json();
          const catalogId = d.catalog_product_id ?? null;
          const permalink = d.permalink ?? null;

          let newLink: string;
          if (catalogId) {
            const u = new URL(`https://www.mercadolivre.com.br/p/${catalogId}`);
            u.searchParams.set('matt_tool', '90738350');
            u.searchParams.set('matt_word', 'piscoulevou');
            newLink = u.toString();
          } else if (permalink && permalink.startsWith('http')) {
            const u = new URL(permalink);
            u.searchParams.set('matt_tool', '90738350');
            u.searchParams.set('matt_word', 'piscoulevou');
            newLink = u.toString();
          } else { failed++; return; }

          const { error } = await supabase.from('products')
            .update({ affiliate_link: newLink, updated_at: new Date().toISOString() })
            .eq('id', p.id);
          if (error) { failed++; log(`⚠️ ${p.meli_item_id}: ${error.message}`); }
          else { fixed++; }
        } catch { failed++; }
      }));
    }
    log(`✅ [fix_item_urls] ${fixed} URLs corrigidas, ${failed} falhas.`);
    return new Response(JSON.stringify({ fixed, failed, logs }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }

  log('🚀 meli-sync v4 iniciado em', new Date().toISOString());




  // ── Reset opcional ──────────────────────────────────────────────────────────
  const shouldReset = urlObj.searchParams.get('reset') === 'true';
  if (shouldReset) {
    await supabase.from('products').delete().neq('meli_item_id', '');
    await supabase.from('categories').delete().neq('slug', '');
    categoryCache.clear();
    const seeds = Array.from(OFFICIAL_CATEGORIES_MAP.entries()).map(([id, info]) => ({
      name: info.name, slug: info.slug, meli_category_id: id,
    }));
    const { data: seeded } = await supabase.from('categories').insert(seeds).select();
    for (const cat of seeded || []) categoryCache.set(cat.meli_category_id, cat.id);
    log('✅ Reset completo.');
  }

  // ── Autenticação ────────────────────────────────────────────────────────────
  let token: string;
  try {
    token = await getMeliAccessToken(log);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg, logs }), { status: 500 });
  }

  // App token (client_credentials) — mantido para uso futuro quando permissão "Pesquisa" for habilitada
  // const appToken = await getAppToken();

  // ── Cache de categorias ─────────────────────────────────────────────────────
  if (!shouldReset) {
    const { data: dbCats } = await supabase.from('categories').select('id, meli_category_id');
    for (const cat of dbCats || []) if (cat.meli_category_id) categoryCache.set(cat.meli_category_id, cat.id);
    log(`📂 ${dbCats?.length ?? 0} categorias em cache.`);
  }

  const records: any[]         = [];
  const processedIds           = new Set<string>();
  let totalProducts            = 0;
  let totalHighlights          = 0;

  log('🔍 Iniciando sync (Highlights API + processamento em lotes)...');

  for (const meliCatId of TARGET_MELI_CATEGORIES) {
    const catName = OFFICIAL_CATEGORIES_MAP.get(meliCatId)?.name ?? meliCatId;
    log(`\n👉 ${catName} (${meliCatId})`);

    const dbCategoryId = await resolveCategory(meliCatId, log);
    if (!dbCategoryId) { log(`   ⚠️ Categoria não autorizada.`); continue; }

    const { ids: allHighlightIds, subcatMap } = await fetchHighlightIds(meliCatId, token, log);
    const highlightIds = allHighlightIds.slice(0, MAX_HIGHLIGHTS);
    log(`   Processando ${highlightIds.length} destaques em lotes de ${PARALLEL_BATCH}...`);

    // Preço mínimo para que a comissão estimada seja >= R$10
    const minPrice    = MIN_PRICE_FOR_CATEGORY(meliCatId);
    const commRate    = CATEGORY_COMMISSION_RATE[meliCatId] ?? 0.04;
    let catHighlights = 0;
    let catSkipped    = 0;
    let rank = 0;

    for (const batch of chunks(highlightIds, PARALLEL_BATCH)) {
      const batchResults = await Promise.allSettled(
        batch.map(pid => processOneCatalogProduct(pid, token))
      );

      for (let i = 0; i < batchResults.length; i++) {
        const result = batchResults[i];
        const productId = batch[i];

        if (result.status === 'rejected' || !result.value) continue;

        const p = result.value;
        if (processedIds.has(p.itemId)) continue;

        // ── Filtro de comissão mínima ─────────────────────────────────────────
        // Ignora produtos cuja comissão estimada (preço × taxa) seja < R$10
        const estimatedCommission = p.price * commRate;
        if (estimatedCommission < MIN_COMMISSION_BRL) {
          catSkipped++;
          continue; // não adiciona ao banco — produto não vale o esforço
        }

        processedIds.add(p.itemId);
        rank++;
        catHighlights++;
        totalProducts++;

        // Subcategoria de nível 1 do produto (null se veio direto da raiz)
        const subcat = subcatMap.get(productId) ?? null;

        records.push({
          meli_item_id:        p.itemId,
          _cid:                productId, // catalog product ID — usado no dedup, removido antes do upsert
          title:               p.title,
          slug:                `${generateSlug(p.title)}-${p.itemId.toLowerCase()}`,
          price:               p.price,
          original_price:      p.originalPrice,
          discount_pct:        p.originalPrice && p.originalPrice > p.price
                                 ? Math.round(((p.originalPrice - p.price) / p.originalPrice) * 100)
                                 : null,
          platform:            'mercadolivre',
          image_url:           p.imageUrl,
          affiliate_link:      buildAffiliateLinkFallback(productId, p.permalink),
          category_id:         dbCategoryId,
          subcategory_meli_id: subcat?.id   ?? null,
          subcategory_name:    subcat?.name ?? null,
          is_highlight:        true,
          is_best_seller:      rank <= 10,
          status:              'active',
          updated_at:          new Date().toISOString(),
        });
      }
    }
    if (catSkipped > 0) {
      log(`   ⚠️ ${catSkipped} produtos ignorados (comissão estimada < R$${MIN_COMMISSION_BRL} @ ${(commRate*100).toFixed(0)}% → preço mínimo R$${minPrice.toFixed(2)})`);
    }

    log(`   ✅ ${catHighlights} highlights processados. Tempo parcial: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

  }

  log(`\n📦 Total bruto: ${records.length} produtos.`);


  // ═══════════════════════════════════════════════════════════════════════════
  // DEDUP: Mesmo catalog product (MLB...) → mantém apenas o mais barato.
  //
  // Causa das duplicatas: a cada ciclo o "melhor anúncio" de um produto de
  // catálogo pode mudar de listing (MLB123 → MLB456). O upsert usa meli_item_id
  // como chave, então o listing antigo fica ativo E o novo é inserido como
  // registro novo → mesmo produto duplicado com preços diferentes.
  //
  // Fix: agrupar por catalog_product_id (extraído do affiliate_link /p/MLBXXX)
  // e manter apenas o registro de menor preço por grupo.
  // ═══════════════════════════════════════════════════════════════════════════
  const extractCatalogId = (link: string): string | null => {
    const m = (link ?? '').match(/mercadolivre\.com\.br\/p\/(MLB[^?&/\s]+)/);
    return m ? m[1] : null;
  };

  // Agrupa por catalog product ID (_cid) e mantém o mais barato por grupo
  // _cid é sempre o ML catalog ID (ex: MLB19802405), confiável mesmo quando o
  // affiliate_link usa permalink de item em vez de /p/MLB...
  const dedupMap = new Map<string, any>();
  for (const rec of records) {
    const key = rec._cid ?? extractCatalogId(rec.affiliate_link) ?? rec.meli_item_id;
    const existing = dedupMap.get(key);
    if (!existing || rec.price < existing.price) {
      dedupMap.set(key, rec);
    }
  }
  // Remove _cid antes do upsert (campo temporário, não existe na tabela)
  const finalRecords = Array.from(dedupMap.values()).map(({ _cid, ...rest }: any) => rest);
  // Reconstrói mapa cid→meli_item_id para inativação de duplicatas no banco
  const cidToItemId = new Map<string, string>();
  for (const rec of records) {
    const key = rec._cid ?? extractCatalogId(rec.affiliate_link) ?? rec.meli_item_id;
    if (!cidToItemId.has(key)) cidToItemId.set(key, rec.meli_item_id);
    else if (rec.price < (records.find((r:any) => r.meli_item_id === cidToItemId.get(key))?.price ?? Infinity)) {
      cidToItemId.set(key, rec.meli_item_id);
    }
  }
  const dedupRemoved = records.length - finalRecords.length;
  if (dedupRemoved > 0) {
    log(`🔄 Dedup: ${dedupRemoved} duplicatas removidas → ${finalRecords.length} produtos únicos.`);
  }

  // Inativa no banco versões antigas do mesmo catalog product com meli_item_id diferente
  // Ex: banco tem MLB3685475083 ativo para catalog MLB26441604,
  //     mas agora o melhor listing é MLB6619428772 → o antigo vira inactive.
  try {
    const { data: currentActive } = await supabase
      .from('products')
      .select('id, meli_item_id, affiliate_link, title')
      .eq('status', 'active');

    const staleDupeIds = new Set<string>();
    // Camada 1: detecta stale por catalog product ID (extraído da URL /p/MLBxxx)
    for (const [cid, winnerItemId] of cidToItemId) {
      const stale = (currentActive ?? []).filter(p => {
        const pCat = extractCatalogId(p.affiliate_link);
        return pCat === cid && p.meli_item_id !== winnerItemId;
      });
      for (const s of stale) staleDupeIds.add(s.meli_item_id);
    }
    // Camada 2: detecta stale por TÍTULO (case-insensitive — ML pode mudar capitalização)
    // Se um produto do sync tem o mesmo título (normalizado) que um produto no banco,
    // mas meli_item_id diferente, o do banco é uma versão antiga → inativa.
    const syncedItemIds = new Set(finalRecords.map((r: any) => r.meli_item_id));
    for (const rec of finalRecords) {
      const recTitleNorm = (rec.title ?? '').toLowerCase().trim();
      const staleByTitle = (currentActive ?? []).filter(p =>
        !syncedItemIds.has(p.meli_item_id) &&
        p.meli_item_id !== rec.meli_item_id &&
        (p.title ?? '').toLowerCase().trim() === recTitleNorm
      );
      for (const s of staleByTitle) staleDupeIds.add(s.meli_item_id);
    }

    if (staleDupeIds.size > 0) {
      log(`🧹 Inativando ${staleDupeIds.size} versões antigas do mesmo produto...`);
      const { error: dupErr } = await supabase
        .from('products')
        .update({ status: 'inactive', updated_at: new Date().toISOString() })
        .in('meli_item_id', Array.from(staleDupeIds));
      if (dupErr) log(`❌ Erro ao inativar versões antigas: ${dupErr.message}`);
      else        log(`✅ ${staleDupeIds.size} versões antigas inativadas.`);
    }
  } catch (e) {
    log(`⚠️ Erro ao verificar duplicatas no banco:`, e);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: Upsert em lotes (usando registros deduplicados)
  //
  // IMPORTANTE: Preserva affiliate_links gerados via portal de afiliados ML
  // (meli.la ou links com ref=). O cron só sobrescreve o affiliate_link de
  // produtos novos ou que ainda estão com o link de fallback (matt_tool).
  // ═══════════════════════════════════════════════════════════════════════════

  // Carrega todos os affiliate_links atuais do banco para preservar os bons
  const { data: existingLinks } = await supabase
    .from('products')
    .select('meli_item_id, affiliate_link')
    .eq('status', 'active');

  const existingLinkMap = new Map<string, string>();
  for (const row of existingLinks ?? []) {
    if (row.meli_item_id && row.affiliate_link) {
      existingLinkMap.set(row.meli_item_id, row.affiliate_link);
    }
  }

  // Detecta se um link foi gerado via portal de afiliados (não é fallback)
  // Links válidos: meli.la/* ou qualquer link com parâmetro ref=
  const isPortalLink = (link: string): boolean => {
    if (!link) return false;
    return link.includes('meli.la') || link.includes('ref=');
  };

  // Para cada produto, preserva o affiliate_link existente se for um link do portal
  let preservedCount = 0;
  for (const rec of finalRecords) {
    const existing = existingLinkMap.get(rec.meli_item_id);
    if (existing && isPortalLink(existing)) {
      rec.affiliate_link = existing; // preserva o link do portal de afiliados
      preservedCount++;
    }
    // Caso contrário, mantém o buildAffiliateLinkFallback gerado acima
  }
  if (preservedCount > 0) {
    log(`🔗 [Step 2] ${preservedCount} links de afiliado do portal preservados (não sobrescritos).`);
  }

  let totalUpserted = 0;
  for (const batch of chunks(finalRecords, 100)) {
    const { error } = await supabase
      .from('products')
      .upsert(batch, { onConflict: 'meli_item_id', ignoreDuplicates: false });
    if (error) { log(`❌ Upsert erro:`, error.message); }
    else        { totalUpserted += batch.length; }
  }
  log(`✅ ${totalUpserted} produtos upsertados.`);

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2b: Links de afiliado via portal ML (ML_SESSION_COOKIES)
  //
  // Gera links meli.la com ref= para produtos novos que ainda estão com fallback.
  // Os links gerados ficam persistidos no banco e são preservados nos ciclos
  // seguintes do cron (ver lógica isPortalLink acima).
  //
  // Para regenerar todos os links via portal, use: ?fix_all_affiliate_links=1
  // ═══════════════════════════════════════════════════════════════════════════

  // Produtos novos que ainda estão com fallback (matt_tool) → gera link via portal
  const newFallbackRecords = finalRecords.filter((r: any) => !isPortalLink(r.affiliate_link));
  if (newFallbackRecords.length > 0) {
    log(`🔗 [Step 2b] ${newFallbackRecords.length} produtos novos sem link do portal — gerando via ML_SESSION_COOKIES...`);
    const urlsToGen = newFallbackRecords.map((r: any) => {
      // Remove matt_tool para ter a URL base limpa
      try {
        const u = new URL(r.affiliate_link);
        u.searchParams.delete('matt_tool');
        u.searchParams.delete('matt_word');
        return u.toString();
      } catch { return r.affiliate_link; }
    });
    const affiliateMap = await generateMeliAffiliateLinks(urlsToGen, log);
    if (affiliateMap.size > 0) {
      const linkUpdates: Promise<any>[] = [];
      for (let i = 0; i < newFallbackRecords.length; i++) {
        const shortUrl = affiliateMap.get(urlsToGen[i]);
        if (shortUrl) {
          linkUpdates.push(
            supabase.from('products')
              .update({ affiliate_link: shortUrl, updated_at: new Date().toISOString() })
              .eq('meli_item_id', newFallbackRecords[i].meli_item_id)
          );
        }
      }
      for (const batch of chunks(linkUpdates, 20)) await Promise.allSettled(batch);
      log(`✅ [Step 2b] ${affiliateMap.size} links do portal gerados e salvos.`);
    } else {
      log(`⚠️ [Step 2b] Nenhum link gerado — ML_SESSION_COOKIES pode estar expirado.`);
    }
  }



  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3: Verifica produtos ativos não vistos (atualiza preços, inativa encerrados)
  // Só inativa se ML confirmar 'closed' ou 'inactive'.
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    const { data: activeInDb } = await supabase
      .from('products').select('id, meli_item_id, price, original_price').eq('status', 'active');

    const toCheck = (activeInDb ?? []).filter(p => !processedIds.has(p.meli_item_id));

    if (toCheck.length > 0) {
      log(`\n🔍 [Step 3] Verificando ${toCheck.length} produtos não vistos...`);
      const detailsMap = await checkItemsInBatch(toCheck.map(p => p.meli_item_id), token, log);

      const toInactivate: string[] = [];
      const updates: Promise<any>[] = [];
      const terminal = new Set(['closed', 'inactive']);

      for (const item of toCheck) {
        // ─ Inativa imediatamente se comissão estimada já está abaixo do limiar ─────────
        const commRate = (item as any).categories?.commission_rate ?? 0.04;
        if (item.price * commRate < MIN_COMMISSION_BRL) {
          toInactivate.push(item.meli_item_id);
          continue; // não precisa nem consultar a API do ML
        }

        const detail = detailsMap.get(item.meli_item_id);
        if (!detail) { log(`   ⚠️ ${item.meli_item_id} sem resposta — mantendo ativo.`); continue; }
        if (terminal.has(detail.status)) {
          log(`   🔴 Inativando ${item.meli_item_id} (${detail.status})`);
          toInactivate.push(item.meli_item_id);
          continue;
        }
        if (detail.price !== undefined && detail.price > 0) {
          const pc = Math.abs(item.price - detail.price) > 0.01;
          const oc = (item.original_price ?? null) !== (detail.originalPrice ?? null);
          if (pc || oc) {
            const newPrice = detail.price;
            // Usa a taxa real da categoria para checar a comissão com o novo preço
            if (newPrice * commRate < MIN_COMMISSION_BRL) {
              log(`   🔴 Inativando ${item.meli_item_id} — preço R$${newPrice} gera comissão abaixo de R$${MIN_COMMISSION_BRL}`);
              toInactivate.push(item.meli_item_id);
              continue;
            }
            log(`   ↳ Preço ${item.meli_item_id}: R$ ${item.price} → R$ ${newPrice}`);
            updates.push(
              supabase.from('products').update({
                price: newPrice, original_price: detail.originalPrice,
                updated_at: new Date().toISOString(),
              }).eq('id', item.id),
            );
          }
        }
      }

      if (toInactivate.length > 0) {
        const { error } = await supabase.from('products')
          .update({ status: 'inactive', updated_at: new Date().toISOString() })
          .in('meli_item_id', toInactivate);
        log(error ? `❌ Erro ao inativar: ${error.message}` : `✅ ${toInactivate.length} inativados.`);
      }
      if (updates.length > 0) {
        const results = await Promise.all(updates);
        const errors  = results.filter(r => r.error);
        log(errors.length > 0
          ? `❌ Erros ao atualizar: ${errors.map(e => e.error?.message).join(', ')}`
          : `✅ ${updates.length} preços atualizados.`);
      }
      if (!toInactivate.length && !updates.length) log('✅ Todos os preços já corretos.');
    } else {
      log('✅ [Step 3] Todos os produtos foram processados neste ciclo.');
    }
  } catch (e) { log('❌ Erro no Step 3:', e); }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP FINAL: Limpeza de duplicatas residuais (safety net em TypeScript)
  // Usa o client admin (service role) que bypassa RLS para garantir que nunca
  // haja dois produtos ativos com o mesmo título.
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    const { data: allActive2 } = await supabase
      .from('products').select('id, title, price, affiliate_link').eq('status', 'active');
    log(`🔍 [Final] ${allActive2?.length ?? 0} ativos verificados para dedup.`);
    if (allActive2 && allActive2.length > 0) {
      // Prioridade por formato (comissão > preço):
      // 0 = /p/catalogId — melhor para tracking | 1 = www.ML slug | 2 = produto. (perde params)
      const lp = (l: string) => l?.includes('/p/') ? 0 : l?.includes('produto.mercadolivre') ? 2 : 1;
      const keeperMap = new Map<string, { id: string; price: number; pri: number }>();
      const toInactivateFinal: string[] = [];
      for (const p of allActive2) {
        const key = (p.title ?? '').toLowerCase().trim();
        const pPri = lp(p.affiliate_link);
        const ex = keeperMap.get(key);
        if (!ex) {
          keeperMap.set(key, { id: p.id, price: p.price, pri: pPri });
        } else {
          const preferP = pPri < ex.pri ||
            (pPri === ex.pri && p.price < ex.price) ||
            (pPri === ex.pri && p.price === ex.price && p.id > ex.id);
          if (preferP) { toInactivateFinal.push(ex.id); keeperMap.set(key, { id: p.id, price: p.price, pri: pPri }); }
          else { toInactivateFinal.push(p.id); }
        }
      }
      log(`🔍 [Final] ${toInactivateFinal.length} duplicatas encontradas.`);
      if (toInactivateFinal.length > 0) {
        const { error: finalErr } = await supabase.from('products')
          .update({ status: 'inactive', updated_at: new Date().toISOString() })
          .in('id', toInactivateFinal);
        if (finalErr) log(`⚠️ [Final] Erro: ${finalErr.message}`);
        else log(`🧹 [Final] ${toInactivateFinal.length} duplicatas inativadas.`);
      }
    }
  } catch (e) { log(`⚠️ [Final] Erro no dedup:`, e); }


  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  const summary  = {

    success: true, duration_seconds: parseFloat(duration),
    products_upserted: totalUpserted,
    categories_cached: categoryCache.size, timestamp: new Date().toISOString(), logs,
  };
  log(`🏁 Concluído em ${duration}s | ${totalUpserted} produtos`);


  return new Response(JSON.stringify(summary), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
});
