import satori from 'https://esm.sh/satori@0.10.14';
import { Resvg, initWasm } from 'https://esm.sh/@resvg/resvg-wasm@2.6.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Inicialização (roda uma vez por cold start) ───────────────────────────────
let ready = false;
let fontRegular: ArrayBuffer;
let fontBold: ArrayBuffer;

async function ensureReady() {
  if (ready) return;

  // Inicializa WASM do resvg
  await initWasm(fetch('https://esm.sh/@resvg/resvg-wasm@2.6.0/index_bg.wasm'));

  // Carrega fonte Inter (400 e 700) — satori suporta TTF/OTF/WOFF (não woff2)
  [fontRegular, fontBold] = await Promise.all([
    fetch('https://cdn.jsdelivr.net/npm/@fontsource/inter/files/inter-latin-400-normal.woff')
      .then(r => r.arrayBuffer()),
    fetch('https://cdn.jsdelivr.net/npm/@fontsource/inter/files/inter-latin-700-normal.woff')
      .then(r => r.arrayBuffer()),
  ]);

  ready = true;
}

// ─── Converte URL de imagem para data URL (base64) ────────────────────────────
async function imgToDataUrl(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error(`Falha ao buscar imagem: HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  const contentType = res.headers.get('content-type') || 'image/jpeg';
  return `data:${contentType};base64,${btoa(binary)}`;
}

// ─── Formata preço em BRL ──────────────────────────────────────────────────────
const toBRL = (v: number) => {
  const [int, dec] = v.toFixed(2).split('.');
  return `R$ ${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`;
};

// ─── Handler ───────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    await ensureReady();

    const { imageUrl, discountPct, price, originalPrice } = await req.json();

    // Baixa imagem do produto via weserv.nl (1080×1080 contain, fundo branco)
    const noProto  = (imageUrl as string).replace(/^https?:\/\//, '');
    const proxyUrl = `https://images.weserv.nl/?${new URLSearchParams({
      url: noProto, w: '1080', h: '900', fit: 'contain', bg: 'ffffff', output: 'jpg', q: '85',
    })}`;
    const imgData = await imgToDataUrl(proxyUrl);

    const pct      = Math.round(discountPct as number);
    const priceFmt = toBRL(price as number);
    const hasDis   = originalPrice && (originalPrice as number) > (price as number);
    const origFmt  = hasDis ? toBRL(originalPrice as number) : null;

    // ── Template Satori (React-element-like object) ──────────────────────────
    const template = {
      type: 'div',
      props: {
        style: {
          width: 1080, height: 1080,
          display: 'flex', flexDirection: 'column',
          backgroundColor: '#ffffff',
          fontFamily: 'Inter',
          position: 'relative',
        },
        children: [

          // ── Imagem do produto ──────────────────────────────────────────────
          {
            type: 'img',
            props: {
              src: imgData,
              width: 1080,
              height: 900,
              style: { objectFit: 'contain' },
            },
          },

          // ── Barra inferior ─────────────────────────────────────────────────
          {
            type: 'div',
            props: {
              style: {
                width: 1080, height: 180,
                backgroundColor: '#0f172a',
                display: 'flex', alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 48px',
                flexShrink: 0,
              },
              children: [
                // Texto esquerdo
                {
                  type: 'div',
                  props: {
                    style: { display: 'flex', flexDirection: 'column', gap: 4 },
                    children: [
                      {
                        type: 'span',
                        props: {
                          style: { color: '#94a3b8', fontSize: 26, fontWeight: 400 },
                          children: 'piscoulevou.com.br',
                        },
                      },
                      {
                        type: 'span',
                        props: {
                          style: { color: '#ffffff', fontSize: 30, fontWeight: 700 },
                          children: '⚡ Oferta por Tempo Limitado',
                        },
                      },
                    ],
                  },
                },
                // Preço direita
                {
                  type: 'div',
                  props: {
                    style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 },
                    children: [
                      ...(origFmt ? [{
                        type: 'span',
                        props: {
                          style: { color: '#94a3b8', fontSize: 26, fontWeight: 400, textDecoration: 'line-through' },
                          children: origFmt,
                        },
                      }] : []),
                      {
                        type: 'span',
                        props: {
                          style: { color: '#facc15', fontSize: 58, fontWeight: 700, lineHeight: 1 },
                          children: priceFmt,
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },

          // ── Badge de desconto (absoluto, canto superior direito) ───────────
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute', top: 24, right: 24,
                width: 230, height: 230,
                borderRadius: 115,
                backgroundColor: '#dc2626',
                border: '6px solid #fca5a5',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: 0,
              },
              children: [
                {
                  type: 'span',
                  props: {
                    style: {
                      color: '#ffffff', fontSize: 82,
                      fontWeight: 700, lineHeight: 1,
                    },
                    children: `${pct}%`,
                  },
                },
                {
                  type: 'span',
                  props: {
                    style: {
                      color: '#fef08a', fontSize: 42,
                      fontWeight: 700, letterSpacing: 4,
                    },
                    children: 'OFF',
                  },
                },
              ],
            },
          },

        ],
      },
    };

    // ── Renderiza SVG → PNG ────────────────────────────────────────────────────
    const svg = await satori(template, {
      width: 1080, height: 1080,
      fonts: [
        { name: 'Inter', data: fontRegular, weight: 400, style: 'normal' },
        { name: 'Inter', data: fontBold,    weight: 700, style: 'normal' },
      ],
    });

    const resvg  = new Resvg(svg, { fitTo: { mode: 'width', value: 1080 } });
    const render = resvg.render();
    const png    = render.asPng();

    // ── Salva no Supabase Storage ──────────────────────────────────────────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const filename = `feed-branded-${Date.now()}.png`;
    const { error: upErr } = await supabase.storage
      .from('instagram-images')
      .upload(filename, png, { contentType: 'image/png', upsert: true });
    if (upErr) throw upErr;

    const { data: { publicUrl } } = supabase.storage
      .from('instagram-images')
      .getPublicUrl(filename);

    return new Response(JSON.stringify({ url: publicUrl }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('generate-feed-image error:', err);
    return new Response(
      JSON.stringify({ error: err?.message ?? String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});
