import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Product {
  id:                   string;
  codigo_identificador: number;
  title:                string;
  price:                number;
  original_price:       number | null;
  discount_pct:         number | null;
  image_url:            string;
  affiliate_link:       string;
  subcategory_name:     string | null;
  platform:             'mercadolivre' | 'shopee';  // plataforma de origem
}
interface InstagramMediaResponse { id: string; }

// ─── Constantes ───────────────────────────────────────────────────────────────
const MAX_POSTS_PER_DAY = 3;
const IG_API_VERSION    = 'v21.0';
const IG_BASE           = `https://graph.facebook.com/${IG_API_VERSION}`;
const STORAGE_BUCKET    = 'instagram-images';

// Template fixo do story (upload manual via Dashboard → Storage → instagram-images)
// Se não existir, usa a imagem do produto redimensionada
const STORY_TEMPLATE_PATH = 'story-template.png';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const toBRL = (v: number): string => {
  const parts = v.toFixed(2).split('.');
  return `R$ ${parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${parts[1]}`;
};

/** Feed image: gera 1080×1080 com badge de desconto via generate-feed-image.
 *  Fallback para weserv.nl simples se a geração falhar. */
async function generateBrandedFeedImage(
  imageUrl: string,
  discountPct: number,
  price: number,
  originalPrice: number | null,
  log: (...a: any[]) => void,
): Promise<string> {
  try {
    log('🎨 Gerando imagem com badge de desconto...');
    const genUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-feed-image`;
    const res = await fetch(genUrl, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body:   JSON.stringify({ imageUrl, discountPct, price, originalPrice }),
      signal: AbortSignal.timeout(60000),
    });
    const data = await res.json();
    if (data.url) {
      log(`✅ Imagem branded gerada: ...${data.url.slice(-40)}`);
      return data.url;
    }
    throw new Error(data.error ?? 'URL não retornada');
  } catch (err: any) {
    log(`⚠️ Geração falhou (${err.message}), usando imagem original.`);
    // Fallback: imagem simples via weserv.nl
    const noProto = imageUrl.replace(/^https?:\/\//, '');
    return `https://images.weserv.nl/?${new URLSearchParams({
      url: noProto, w: '1080', h: '1080', fit: 'contain', bg: 'ffffff', output: 'jpg', q: '90',
    })}`;
  }
}

/** Story image: template estático redimensionado 1080×1920 via weserv */
async function getStoryImageUrl(
  supabase: ReturnType<typeof createClient>,
  productImageUrl: string,
  log: (...a: any[]) => void,
): Promise<string> {
  // Verifica se o template existe
  const { data } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(STORY_TEMPLATE_PATH);

  const toWeserv = (rawUrl: string, bg = '0f172a') => {
    const noProto = rawUrl.replace(/^https?:\/\//, '');
    return `https://images.weserv.nl/?${new URLSearchParams({
      url: noProto, w: '1080', h: '1920', fit: 'cover', output: 'jpg', q: '90',
    })}`;
  };

  if (data?.publicUrl) {
    try {
      const check = await fetch(data.publicUrl, { method: 'HEAD' });
      if (check.ok) {
        // Força resize 1080×1920 via weserv (evita distorção)
        const resized = toWeserv(data.publicUrl);
        log(`📋 Template de story (1080×1920): ${resized.slice(0, 80)}...`);
        return resized;
      }
    } catch (_) { /* ignora */ }
  }

  // Fallback: foto do produto em 9:16
  const fallback = toWeserv(productImageUrl);
  log(`⚠️ Template não encontrado, usando foto do produto 9:16`);
  return fallback;
}

/** Legenda do post de feed — adaptação por plataforma (MELI ou Shopee) */
function buildCaption(p: Product): string {
  const hasDis = p.original_price && p.original_price > p.price;
  const pct    = hasDis
    ? Math.round(((p.original_price! - p.price) / p.original_price!) * 100)
    : 0;
  const sub    = p.subcategory_name ? `\n📂 ${p.subcategory_name}` : '';
  const emojis = ['⚡', '🔥', '🚨'];
  const e      = emojis[p.codigo_identificador % 3];
  const isShopee = p.platform === 'shopee';

  const plataforma = isShopee ? '🛍️ SHOPEE' : '🛒 MERCADO LIVRE';
  const emojiLoja  = isShopee ? '🛍️' : '🛒';

  const hashtagsBase = isShopee
    ? '#piscoulevou #oferta #desconto #shopee #achados\n#promoção #economize #shopeeoferta #codigopiscou'
    : '#piscoulevou #oferta #desconto #mercadolivre #achados\n#promoção #economize #ofertadodia #codigopiscou';

  return [
    `${e} OFERTA RELÂMPAGO #${p.codigo_identificador} ${e}`,
    `${plataforma}`,
    ``,
    `${emojiLoja} ${p.title}${sub}`,
    ``,
    hasDis
      ? `🏷️ De ${toBRL(p.original_price!)} por ${toBRL(p.price)} (${pct}% OFF)`
      : `💰 Por apenas ${toBRL(p.price)}`,
    ``,
    `⏰ Oferta por tempo limitado! Pode acabar a qualquer momento.`,
    ``,
    `━━━━━━━━━━━━━━━━━━`,
    `📲 COMO GARANTIR:`,
    `1️⃣ Acesse www.piscoulevou.com.br`,
    `2️⃣ Clique em "Instagram" e busque pelo código ${p.codigo_identificador}`,
    `3️⃣ Clique em "Ver Desconto" e aproveite!`,
    `━━━━━━━━━━━━━━━━━━`,
    ``,
    `${hashtagsBase}${p.codigo_identificador}`,
  ].join('\n');
}

/** Lê a última plataforma postada e determina qual deve ser a próxima (50/50) */
async function getNextPlatform(
  supabase: ReturnType<typeof createClient>,
  log: (...a: any[]) => void,
): Promise<'mercadolivre' | 'shopee'> {
  const { data } = await supabase
    .from('instagram_settings')
    .select('value')
    .eq('key', 'last_posted_platform')
    .single();

  const last = data?.value ?? 'shopee';
  const next = last === 'shopee' ? 'mercadolivre' : 'shopee';
  log(`🔄 Alternância: última plataforma=${last} → próxima=${next}`);
  return next as 'mercadolivre' | 'shopee';
}

/** Atualiza a última plataforma postada no banco */
async function setLastPlatform(
  supabase: ReturnType<typeof createClient>,
  platform: string,
): Promise<void> {
  await supabase
    .from('instagram_settings')
    .upsert({ key: 'last_posted_platform', value: platform, updated_at: new Date().toISOString() }, { onConflict: 'key' });
}

// ─── Instagram Graph API ───────────────────────────────────────────────────────
class RateLimitError extends Error { constructor() { super('RATE_LIMIT'); this.name = 'RateLimitError'; } }

async function igRequest(url: string, body: URLSearchParams): Promise<InstagramMediaResponse> {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000); // 30s timeout
  try {
    const res  = await fetch(url, { method: 'POST', body, signal: ctrl.signal });
    clearTimeout(timer);
    const data = await res.json();
    // Rate limit: para imediatamente e avisa o loop externo
    if (res.status === 403 && JSON.stringify(data).includes('request limit')) throw new RateLimitError();
    if (!res.ok || !data.id) throw new Error(`HTTP ${res.status}: ${JSON.stringify(data)}`);
    return data;
  } catch (err: any) {
    clearTimeout(timer);
    if (err instanceof RateLimitError) throw err;
    if (err.name === 'AbortError') throw new Error(`Timeout (30s) na chamada Meta API: ${url}`);
    throw err;
  }
}

async function postFeed(
  igUserId: string, token: string,
  imageUrl: string, caption: string,
): Promise<string> {
  const { id: cId } = await igRequest(
    `${IG_BASE}/${igUserId}/media`,
    new URLSearchParams({ image_url: imageUrl, caption, access_token: token }),
  );
  await new Promise(r => setTimeout(r, 5000));
  const { id } = await igRequest(
    `${IG_BASE}/${igUserId}/media_publish`,
    new URLSearchParams({ creation_id: cId, access_token: token }),
  );
  return id;
}

/** Publica um Reel via Graph API (REELS container + poll status + publish) */
async function postReel(
  igUserId: string, token: string,
  videoUrl: string, caption: string,
  log: (...a: any[]) => void,
): Promise<string> {
  // 1. Cria container de Reel
  log('🎬 Criando container do Reel...');
  const { id: containerId } = await igRequest(
    `${IG_BASE}/${igUserId}/media`,
    new URLSearchParams({
      media_type: 'REELS',
      video_url:  videoUrl,
      caption,
      access_token: token,
    }),
  );
  log(`📦 Container: ${containerId}`);

  // 2. Aguarda processamento do vídeo (máx 3 min)
  const deadline = Date.now() + 180_000;
  let statusCode = 'IN_PROGRESS';
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 8000));
    const res  = await fetch(`${IG_BASE}/${containerId}?fields=status_code&access_token=${token}`);
    const data = await res.json();
    statusCode = data.status_code ?? 'UNKNOWN';
    log(`⏳ Status: ${statusCode}`);
    if (statusCode === 'FINISHED') break;
    if (statusCode === 'ERROR')    throw new Error(`Reel processing error: ${JSON.stringify(data)}`);
  }
  if (statusCode !== 'FINISHED') throw new Error('Timeout aguardando processamento do Reel');

  // 3. Publica
  const { id: reelId } = await igRequest(
    `${IG_BASE}/${igUserId}/media_publish`,
    new URLSearchParams({ creation_id: containerId, access_token: token }),
  );
  log(`✅ Reel publicado! id: ${reelId}`);
  return reelId;
}

import { v2 as cloudinary } from 'npm:cloudinary@1.41.0';

cloudinary.config({
  cloud_name: 'do7dl1bhc',
  api_key: '951885926295627',
  api_secret: 'pRKh3I9_FS8_rUOqg_4om2JiHjo'
});

/** Converte ArrayBuffer para Base64 de forma segura em Edge Functions */
function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Gera narração com OpenAI TTS e sobe para o Cloudinary. Retorna o public_id do áudio e a duração. */
async function generateNarration(
  title: string, discountPct: number, price: number, originalPrice: number | null,
  log: (...a: any[]) => void
): Promise<{ publicId: string, durationMs: number } | null> {
  try {
    log('🎙️ Gerando locução (OpenAI TTS)...');
    // Lê a chave da variável de ambiente que o usuário forneceu no chat (ou env var real)
    const openAiKey = Deno.env.get('OPENAI_API_KEY') ?? '';
    
    const toBRL = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;
    const shortTitle = title.split('-')[0].substring(0, 50).trim();
    const script = `Alerta de oferta no Piscou Levou! ${shortTitle} com incríveis ${Math.round(discountPct)}% de desconto. ${originalPrice ? `De ${toBRL(originalPrice)} ` : ''}Por apenas ${toBRL(price)}. Clique no link do nosso perfil e garanta antes que acabe!`;

    // Vozes disponíveis na OpenAI TTS — sorteia uma diferente a cada postagem
    const TTS_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer', 'coral', 'sage', 'ash'];
    const randomVoice = TTS_VOICES[Math.floor(Math.random() * TTS_VOICES.length)];
    log(`🎙️ Voz selecionada: ${randomVoice}`);

    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'tts-1',
        voice: randomVoice,
        input: script
      })
    });

    if (!res.ok) {
      log(`⚠️ Erro OpenAI TTS: ${await res.text()}`);
      return null;
    }

    const audioBuffer = await res.arrayBuffer();
    const base64Audio = arrayBufferToBase64(audioBuffer);
    const dataUri = `data:audio/mp3;base64,${base64Audio}`;

    log('☁️ Fazendo upload do áudio para Cloudinary...');
    const uploadRes = await cloudinary.uploader.upload(dataUri, {
      resource_type: 'video', // Audio deve ser 'video' no Cloudinary
      folder: 'piscoulevou-reels/audio'
    });

    const durationSec = uploadRes.duration || 15;
    const durationMs = Math.ceil(durationSec * 1000) + 1000; // Soma 1 segundo de folga

    log(`✅ Áudio salvo no Cloudinary! ID: ${uploadRes.public_id} (${durationSec}s)`);
    return { publicId: uploadRes.public_id, durationMs };
  } catch (err: any) {
    log(`⚠️ Falha ao gerar narração: ${err.message ?? err}`);
    return null;
  }
}

/** Gera vídeo de avatar na D-ID. Retorna a URL do mp4 gerado ou null. */
async function generateDidVideo(audioUrl: string, log: (...a: any[]) => void): Promise<string | null> {
  try {
    log('🤖 Gerando vídeo de Avatar na D-ID...');
    const apiKey = 'ZWR1YXJkby5hYmFwQGdtYWlsLmNvbQ:Vr8u439o7IUy-1U3DKMbW';
    const base64Key = btoa(apiKey);
    const avatarUrl = 'https://res.cloudinary.com/do7dl1bhc/image/upload/v1781381367/piscoulevou-reels/avatars/vhl1igiyw0qlj2yciuvs.jpg';
    
    const res = await fetch('https://api.d-id.com/talks', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${base64Key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        source_url: avatarUrl,
        script: { type: 'audio', audio_url: audioUrl }
      })
    });
    
    if (!res.ok) {
       log(`⚠️ Erro ao iniciar D-ID: ${await res.text()}`);
       return null;
    }
    const data = await res.json();
    const id = data.id;
    
    // Polling (até 125s para dar mais tempo para a D-ID na fila grátis)
    for (let i = 0; i < 25; i++) {
       await new Promise(resolve => setTimeout(resolve, 5000));
       const pollRes = await fetch(`https://api.d-id.com/talks/${id}`, {
         headers: { 'Authorization': `Basic ${base64Key}` }
       });
       const pollData = await pollRes.json();
       if (pollData.status === 'done') {
          log(`✅ Vídeo D-ID gerado com sucesso!`);
          return pollData.result_url;
       } else if (pollData.status === 'error') {
          log(`⚠️ Erro no processamento D-ID: ${JSON.stringify(pollData)}`);
          return null;
       }
       log(`⏳ D-ID status: ${pollData.status}`);
    }
    log(`⚠️ Timeout na D-ID`);
    return null;
  } catch (err: any) {
    log(`⚠️ Falha ao chamar D-ID: ${err.message}`);
    return null;
  }
}

/** Mescla a imagem do produto com o vídeo D-ID gerado usando Cloudinary. */
async function buildAvatarReel(feedImageUrl: string, didVideoUrl: string, log: (...a: any[]) => void): Promise<string | null> {
  try {
    log('☁️ Fazendo upload do vídeo D-ID e da imagem para composição no Cloudinary...');
    
    const didUploadRes = await cloudinary.uploader.upload(didVideoUrl, {
      resource_type: 'video',
      folder: 'piscoulevou-reels/did_videos'
    });

    const uploadRes = await cloudinary.uploader.upload(feedImageUrl, {
      resource_type: 'image',
      folder: 'piscoulevou-reels'
    });

    const transformations: any[] = [
      { width: 1080, height: 1920, crop: 'pad', background: '#0f172a', gravity: 'north' },
      { overlay: `video:${didUploadRes.public_id.replace(/\//g, ':')}` },
      { width: 1080, crop: 'scale' },
      { flags: 'layer_apply', gravity: 'south' }
    ];

    const reelUrl = cloudinary.url(uploadRes.public_id, {
      resource_type: 'image',
      secure: true,
      format: 'mp4',
      transformation: transformations
    });

    log(`⏳ Forçando a renderização do Avatar Reel no Cloudinary...`);
    const warmupRes = await fetch(reelUrl, { method: 'GET' });
    if (!warmupRes.ok) throw new Error(`Falha ao renderizar avatar no Cloudinary: HTTP ${warmupRes.status}`);

    log(`✅ Vídeo Avatar renderizado e pronto!`);
    log(`🎬 Avatar URL: ${reelUrl}`);
    return reelUrl;
  } catch (err: any) {
    log(`⚠️ Geração de Reel Avatar falhou: ${err.message ?? err}`);
    return null;
  }
}

/** Gera vídeo Reel no Cloudinary (zoompan + narração opcional).
 *  Retorna a URL do vídeo ou null se falhar. */
async function generateReelVideo(
  feedImageUrl: string,
  audioPublicId: string | null,
  log: (...a: any[]) => void,
): Promise<string | null> {
  try {
    log('🎥 Gerando vídeo Reel (Cloudinary)...');

    const eagerTransformations: any[] = [
      {
        format: 'mp4', 
        effect: 'zoompan', 
        duration: 15000,
        width: 1080, 
        height: 1920, 
        crop: 'pad', 
        background: '#0f172a' 
      }
    ];

    if (audioPublicId) {
      log(`🎧 Embutindo áudio no vídeo: ${audioPublicId}`);
      // Cloudinary exige "encadear" a transformação para aplicar camadas
      eagerTransformations.push({ overlay: `video:${audioPublicId.replace(/\//g, ':')}` });
      eagerTransformations.push({ flags: 'layer_apply' });
    }

    // Faz upload da imagem de feed já com badge (apenas upload normal)
    const uploadRes = await cloudinary.uploader.upload(feedImageUrl, {
      resource_type: 'image',
      folder: 'piscoulevou-reels'
    });

    // Monta a transformação encadeada (Array de transformações)
    const transformations: any[] = [
      {
        effect: 'zoompan', 
        duration: 15000,
        width: 1080, 
        height: 1920, 
        crop: 'pad', 
        background: '#0f172a' 
      }
    ];

    if (audioPublicId) {
      log(`🎧 Embutindo áudio no vídeo: ${audioPublicId}`);
      transformations.push({ overlay: `video:${audioPublicId.replace(/\//g, ':')}` });
      transformations.push({ flags: 'layer_apply' });
    }

    // Gera a URL do Cloudinary com todas as transformações aplicadas
    const reelUrl = cloudinary.url(uploadRes.public_id, {
      resource_type: 'image', // A base é uma imagem, o mp4 é gerado via transformation
      secure: true,
      format: 'mp4', // IMPORTANTE: garante a extensão .mp4 na URL final
      transformation: transformations
    });

    log(`⏳ Forçando a renderização do vídeo no Cloudinary (pode demorar uns 15s)...`);
    // Fazemos um fetch() na URL para obrigar o Cloudinary a gerar o vídeo na hora.
    // Assim, quando passarmos para o Instagram, o vídeo já estará 100% pronto (evitando timeout).
    const warmupRes = await fetch(reelUrl, { method: 'GET' });
    if (!warmupRes.ok) {
      throw new Error(`Falha ao renderizar vídeo no Cloudinary: HTTP ${warmupRes.status}`);
    }

    log(`✅ Vídeo Reel renderizado no Cloudinary e pronto!`);
    log(`🎬 Reel URL pronta: ${reelUrl}`);
    return reelUrl;
  } catch (err: any) {
    log(`⚠️ Geração de Reel no Cloudinary falhou: ${err.message ?? err}`);
    return null;
  }
}


async function postStory(
  igUserId: string, token: string,
  imageUrl: string, linkUrl: string,
  log: (...a: any[]) => void,
): Promise<{ id: string; hasLink: boolean }> {
  log(`📱 Tentando story COM link sticker (timeout 15s)...`);

  // Tenta criar container com link sticker, com timeout de 15s
  const stickerData = JSON.stringify({ link_sticker: { link_url: linkUrl } });
  let containerId: string | null = null;
  let hasLink = false;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(`${IG_BASE}/${igUserId}/media`, {
      method: 'POST',
      body: new URLSearchParams({
        image_url:    imageUrl,
        media_type:   'STORIES',
        sticker_data: stickerData,
        access_token: token,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const data = await res.json();
    if (res.ok && data.id) {
      containerId = data.id;
      hasLink = true;
      log(`✅ Container COM link sticker: ${containerId}`);
    } else {
      log(`⚠️ API rejeitou link sticker: ${JSON.stringify(data)}`);
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      log(`⏱️ Timeout no link sticker (15s) — postando story sem link`);
    } else {
      log(`⚠️ Erro no link sticker: ${err.message}`);
    }
  }

  // Fallback: story sem link sticker
  if (!containerId) {
    log(`📱 Criando story SEM link sticker...`);
    const res2 = await fetch(`${IG_BASE}/${igUserId}/media`, {
      method: 'POST',
      body: new URLSearchParams({ image_url: imageUrl, media_type: 'STORIES', access_token: token }),
    });
    const data2 = await res2.json();
    if (!res2.ok || !data2.id) throw new Error(`Story sem link falhou: ${JSON.stringify(data2)}`);
    containerId = data2.id;
    log(`✅ Container story (sem link): ${containerId}`);
  }

  await new Promise(r => setTimeout(r, 5000));
  const pubRes = await fetch(`${IG_BASE}/${igUserId}/media_publish`, {
    method: 'POST',
    body: new URLSearchParams({ creation_id: containerId!, access_token: token }),
  });
  const pubData = await pubRes.json();
  if (!pubRes.ok || !pubData.id) throw new Error(`Publicação falhou: ${JSON.stringify(pubData)}`);
  log(`✅ Story publicado! media_id: ${pubData.id} | link: ${hasLink}`);
  return { id: pubData.id, hasLink };
}

// ─── Fluxo de postagem (reutilizado nos fallbacks) ───────────────────────────────────
async function handlePost(
  p: Product,
  supabase: ReturnType<typeof createClient>,
  igUserId: string,
  igToken: string,
  logs: string[],
  log: (...a: any[]) => void,
  postsToday: number = 0,
): Promise<Response> {
  const releaseLock = async (reason: string) => {
    log(`🔓 Lock liberado — ${reason}`);
    await supabase.from('products').update({ instagram_lock: false }).eq('id', p.id);
  };

  try {
    // ── 3. Prepara imagem com badge de desconto ────────────────────────────────────
    const feedImageUrl = await generateBrandedFeedImage(
      p.image_url, p.discount_pct ?? 0, p.price, p.original_price, log,
    );
    const storyLinkUrl = `https://piscoulevou.com.br/instagram?code=${p.codigo_identificador}`;
    log(`🔗 Story link: ${storyLinkUrl}`);

    // ── 4. Tenta gerar Reel; fallback para feed image ───────────────────────────────
    const caption = buildCaption(p);

    // 4.1 Gera áudio (opcional)
    const audioData = await generateNarration(p.title, p.discount_pct ?? 0, p.price, p.original_price, log);

    // 4.2 Lógica do Avatar D-ID (nos posts agendados das 9h, 14h e 19h)
    const currentHour = new Date().getUTCHours() - 3; // BRT
    const isAvatarTime = (currentHour === 9 || currentHour === 14 || currentHour === 19) && new Date().getMinutes() < 30;
    let reelUrl: string | null = null;

    if (isAvatarTime && audioData) {
      log(`🕒 Hora do Avatar! (${currentHour}h BRT) Iniciando fluxo D-ID...`);
      const audioUrl = cloudinary.url(audioData.publicId, { resource_type: 'video', format: 'mp3', secure: true });
      const didResultUrl = await generateDidVideo(audioUrl, log);
      if (didResultUrl) reelUrl = await buildAvatarReel(feedImageUrl, didResultUrl, log);
    }

    if (!reelUrl) {
      // 4.3 Gera vídeo clássico (imagem + áudio)
      reelUrl = await generateReelVideo(feedImageUrl, audioData?.publicId ?? null, log);
    }

    let mediaId: string;
    let postType: 'reel' | 'feed';

    if (reelUrl) {
      log(`📝 Legenda: ${caption.length} chars | Postando como Reel...`);
      try {
        mediaId  = await postReel(igUserId, igToken, reelUrl, caption, log);
        postType = 'reel';
      } catch (reelErr) {
        log(`⚠️ Reel falhou (${reelErr instanceof Error ? reelErr.message : reelErr}) — fallback para feed image`);
        if (reelErr instanceof RateLimitError) { await releaseLock('Rate limit no Reel'); throw reelErr; }
        try {
          log('🖼️ Postando como imagem de feed (fallback)...');
          mediaId  = await postFeed(igUserId, igToken, feedImageUrl, caption);
          postType = 'feed';
        } catch (feedErr) {
          await releaseLock(feedErr instanceof Error ? feedErr.message : String(feedErr));
          throw feedErr;
        }
      }
    } else {
      log(`📝 Legenda: ${caption.length} chars | Postando como imagem de feed...`);
      try {
        mediaId  = await postFeed(igUserId, igToken, feedImageUrl, caption);
        postType = 'feed';
      } catch (feedErr) {
        await releaseLock(feedErr instanceof Error ? feedErr.message : String(feedErr));
        throw feedErr;
      }
    }

    log(`✅ ${postType === 'reel' ? '🎬 Reel' : '🖼️ Feed'} publicado! media_id: ${mediaId}`);

    // ── 5. Marca como enviado SOMENTE após post confirmado ───────────────────────────
    const { error: updateErr } = await supabase.from('products')
      .update({ enviado_instagram: true, instagram_lock: false, data_envio_instagram: new Date().toISOString() })
      .eq('id', p.id);
    if (updateErr) log(`⚠️ Erro ao atualizar DB: ${updateErr.message}`);
    else {
      log(`💾 Produto #${p.codigo_identificador} marcado como enviado (${postType}) | ${p.platform}.`);
      // Registra a plataforma postada para alternar na próxima execução
      await setLastPlatform(supabase, p.platform ?? 'mercadolivre');
    }

    return new Response(
      JSON.stringify({
        success:    true,
        post_type:  postType,
        codigo:     p.codigo_identificador,
        title:      p.title,
        discount:   p.discount_pct,
        media_id:   mediaId,
        posts_today: postsToday + 1,
        logs,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    if (err instanceof RateLimitError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    log(`❌ Erro no handlePost: ${msg}`);
    return new Response(JSON.stringify({ error: msg, logs }), { status: 500 });
  }
}

// ─── Handler Principal ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const logs: string[] = [];
  const log = (...a: any[]) => { const m = a.join(' '); logs.push(m); console.log(m); };

  // Suporte a feed_only=true para postagem em massa (sem story, mais rápido)
  let feedOnly = false;
  try {
    const body = await req.json().catch(() => ({}));
    feedOnly = body.feed_only === true;
  } catch (_) {}
  if (feedOnly) log('⚡ Modo feed_only ativado — sem story');

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const igUserId = Deno.env.get('INSTAGRAM_USER_ID');
  const igToken  = Deno.env.get('INSTAGRAM_ACCESS_TOKEN');

  if (!igUserId || !igToken) {
    return new Response(JSON.stringify({ error: 'Credenciais Instagram ausentes.' }), { status: 500 });
  }

  try {
    // ── 1. Limite diário (máx 3 posts/dia) ─────────────────────────────────
    const now = new Date();
    // Meia-noite BRT (UTC-3) — garante reset correto no fuso local
    const brtOffset   = 3 * 60 * 60 * 1000; // 3h em ms
    const brtMidnight = new Date(now.getTime() - brtOffset);
    brtMidnight.setUTCHours(0, 0, 0, 0);
    const brtMidnightUTC = new Date(brtMidnight.getTime() + brtOffset);

    const { count: postsToday } = await supabase
      .from('products').select('id', { count: 'exact', head: true })
      .eq('enviado_instagram', true)
      .gte('data_envio_instagram', brtMidnightUTC.toISOString());

    if ((postsToday ?? 0) >= MAX_POSTS_PER_DAY) {
      log(`🛑 Limite diário atingido: ${postsToday}/${MAX_POSTS_PER_DAY} posts hoje`);
      return new Response(JSON.stringify({ message: 'Limite diário atingido', postsToday, logs }), { status: 200 });
    }
    log(`📊 Posts hoje: ${postsToday ?? 0}/${MAX_POSTS_PER_DAY} — selecionando melhor produto...`);

    // ── 2. Determina qual plataforma postar (alternância 50/50 MELI ↔ Shopee) ───────
    const nextPlatform = await getNextPlatform(supabase, log);

    // ── 3. Seleciona o MELHOR produto da plataforma alvo (maior desconto) ───────
    // IMPORTANTE: instagram_lock pode ser NULL em registros antigos (NULL != FALSE no SQL).
    // Por isso usamos .or() em vez de .eq('instagram_lock', false).
    let candidatos: any[] | null = null;
    let candidatosErr: any = null;

    // Tenta primeiro com a plataforma alvo
    const queryPlataforma = await supabase
      .from('products')
      .select('id, codigo_identificador, title, price, original_price, discount_pct, image_url, affiliate_link, subcategory_name, platform')
      .eq('enviado_instagram', false)
      .or('instagram_lock.is.null,instagram_lock.eq.false')
      .eq('status', 'active')
      .eq('platform', nextPlatform)       // ← filtra pela plataforma alvo
      .not('discount_pct', 'is', null)
      .gt('discount_pct', 0)
      .order('discount_pct', { ascending: false })
      .limit(5);

    candidatos    = queryPlataforma.data;
    candidatosErr = queryPlataforma.error;

    // Fallback: se a plataforma alvo não tem produtos, tenta qualquer plataforma
    if (!candidatos || candidatos.length === 0) {
      log(`⚠️ Nenhum produto ${nextPlatform} disponível — tentando qualquer plataforma...`);
      const queryAny = await supabase
        .from('products')
        .select('id, codigo_identificador, title, price, original_price, discount_pct, image_url, affiliate_link, subcategory_name, platform')
        .eq('enviado_instagram', false)
        .or('instagram_lock.is.null,instagram_lock.eq.false')
        .eq('status', 'active')
        .not('discount_pct', 'is', null)
        .gt('discount_pct', 0)
        .order('discount_pct', { ascending: false })
        .limit(5);
      candidatos    = queryAny.data;
      candidatosErr = queryAny.error;
    }

    log(`🔍 Candidatos encontrados: ${candidatos?.length ?? 0} | Erro: ${candidatosErr?.message ?? 'nenhum'}`);

    if (candidatosErr || !candidatos || candidatos.length === 0) {
      // Fallback final: tenta via RPC
      log('⚠️ Nenhum produto com desconto disponível — tentando fila geral via RPC...');
      const { data: claimData, error: claimErr } = await supabase
        .rpc('claim_next_instagram_product');
      log(`🔍 RPC retornou: ${JSON.stringify(claimData)?.slice(0, 100)} | Erro: ${claimErr?.message ?? 'nenhum'}`);
      if (claimErr || !claimData || (claimData as Product[]).length === 0) {
        log('ℹ️ Fila vazia — todos os produtos já foram postados ou a fila está travada.');
        return new Response(JSON.stringify({ message: 'Fila vazia', logs }), { status: 200 });
      }
      const p = (claimData as Product[])[0];
      if (!p.platform) (p as any).platform = 'mercadolivre'; // compat. retroativa
      log(`🎯 [Fallback RPC] #${p.codigo_identificador} — ${p.title} | ${p.discount_pct ?? 0}% OFF | ${p.platform}`);
      return await handlePost(p, supabase, igUserId, igToken, logs, log, postsToday ?? 0);
    }

    // Escolhe o melhor produto (maior desconto) e faz claim atômico
    const melhor = candidatos[0];
    log(`🏆 Melhor produto: #${melhor.codigo_identificador} — ${melhor.title} | ${melhor.discount_pct}% OFF | ${melhor.platform}`);

    // Lock atômico: só prossegue se conseguir marcar como locked
    const { data: lockData, error: lockErr } = await supabase
      .from('products')
      .update({ instagram_lock: true })
      .eq('id', melhor.id)
      .or('instagram_lock.is.null,instagram_lock.eq.false')
      .eq('enviado_instagram', false)
      .select('id, codigo_identificador, title, price, original_price, discount_pct, image_url, affiliate_link, subcategory_name, platform')
      .single();

    if (lockErr || !lockData) {
      log(`⚠️ Não conseguiu lock (${lockErr?.message ?? 'já pego'}) — usando RPC fallback...`);
      const { data: claimData, error: claimErr } = await supabase.rpc('claim_next_instagram_product');
      if (claimErr || !claimData || (claimData as Product[]).length === 0) {
        log('ℹ️ Fila vazia.');
        return new Response(JSON.stringify({ message: 'Fila vazia', logs }), { status: 200 });
      }
      const p = (claimData as Product[])[0];
      if (!p.platform) (p as any).platform = 'mercadolivre';
      log(`🎯 [RPC Fallback] #${p.codigo_identificador} — ${p.title}`);
      return await handlePost(p, supabase, igUserId, igToken, logs, log, postsToday ?? 0);
    }

    const p = lockData as unknown as Product;
    if (!p.platform) (p as any).platform = 'mercadolivre'; // compat. retroativa
    log(`🎯 #${p.codigo_identificador} — ${p.title} | ${p.discount_pct}% OFF | ${p.platform} | ${p.subcategory_name ?? ''}`);
    return await handlePost(p, supabase, igUserId, igToken, logs, log, postsToday ?? 0);

  } catch (err) {
    if (err instanceof RateLimitError) {
      log('🚫 Rate limit da API do Instagram atingido — aguarde ~1h');
      return new Response(JSON.stringify({ message: 'rate_limit', error: 'Rate limit atingido', logs }), { status: 429 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    log(`❌ Erro fatal: ${msg}`);
    return new Response(JSON.stringify({ error: msg, logs }), { status: 500 });
  }
});
