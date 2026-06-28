import { createClient }    from 'https://esm.sh/@supabase/supabase-js@2';
import { FFmpeg }           from 'https://esm.sh/@ffmpeg/ffmpeg@0.12.10';
import { fetchFile }        from 'https://esm.sh/@ffmpeg/util@0.12.1';

// ─── Instância global (reutilizada entre invocações quentes) ──────────────────
let ffmpeg: FFmpeg | null = null;

async function getFFmpeg(log: (...a: any[]) => void): Promise<FFmpeg> {
  if (ffmpeg?.loaded) return ffmpeg;

  log('📹 Inicializando ffmpeg-wasm (pode levar 30s no cold start)...');
  ffmpeg = new FFmpeg();
  ffmpeg.on('log', ({ message }) => {
    if (message && !message.startsWith('frame=')) console.log('[ffmpeg]', message);
  });

  await ffmpeg.load({
    coreURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js',
    wasmURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm',
  });

  log('✅ ffmpeg-wasm pronto');
  return ffmpeg;
}

// ─── Converte URL de imagem → Uint8Array ──────────────────────────────────────
async function fetchImageBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Falha ao baixar imagem: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

// ─── Escapa texto para o filtro drawtext do ffmpeg ────────────────────────────
function esc(text: string): string {
  return text.replace(/'/g, "\\'").replace(/:/g, '\\:').replace(/,/g, '\\,');
}

const toBRL = (v: number) => {
  const [int, dec] = v.toFixed(2).split('.');
  return `R$ ${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`;
};

// ─── Handler ──────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const logs: string[] = [];
  const log = (...a: any[]) => { const m = a.join(' '); logs.push(m); console.log(m); };

  try {
    const { imageUrl, discountPct, price, originalPrice } = await req.json();

    const ff     = await getFFmpeg(log);
    const pct    = Math.round(discountPct as number);
    const priceF = esc(toBRL(price as number));
    const origF  = originalPrice && (originalPrice as number) > (price as number)
      ? esc(toBRL(originalPrice as number)) : null;

    // ── Baixa imagem via weserv (1080×1080 contain, fundo branco) ─────────────
    const noProto   = (imageUrl as string).replace(/^https?:\/\//, '');
    const proxyUrl  = `https://images.weserv.nl/?url=${noProto}&w=1080&h=1080&fit=contain&bg=ffffff&output=jpg&q=85`;
    log('⬇️  Baixando imagem do produto...');
    const imgBytes = await fetchImageBytes(proxyUrl);

    await ff.writeFile('input.jpg', imgBytes);
    log(`🖼️  Imagem: ${(imgBytes.byteLength / 1024).toFixed(0)} KB`);

    // ── Filtros ffmpeg ────────────────────────────────────────────────────────
    // Layout 9:16 (1080×1920):
    //   - Topo (285px):  badge de desconto
    //   - Meio (1350px): imagem do produto com Ken Burns
    //   - Rodapé (285px): preço + site
    const drawtextFilters = [
      // Badge desconto — topo
      `drawtext=text='${pct}\\%':fontsize=160:fontcolor=white:x=(w-text_w)/2:y=40`,
      `drawtext=text='OFF':fontsize=100:fontcolor=fef08a:x=(w-text_w)/2:y=195`,
      // Preço — rodapé
      ...(origF ? [`drawtext=text='${origF}':fontsize=52:fontcolor=94a3b8:x=(w-text_w)/2:y=h-230`] : []),
      `drawtext=text='${priceF}':fontsize=90:fontcolor=facc15:x=(w-text_w)/2:y=h-155`,
      `drawtext=text='piscoulevou.com.br':fontsize=48:fontcolor=94a3b8:x=(w-text_w)/2:y=h-55`,
    ].join(',');

    const vfilter = [
      // Escala imagem para caber em 1080×1350 (área central)
      'scale=1080:1350:force_original_aspect_ratio=decrease',
      // Padding para 1080×1920 com fundo azul escuro (topo e rodapé)
      'pad=1080:1920:(ow-iw)/2:285:color=0f172a',
      // Ken Burns: zoom de 100% → 130% ao longo dos 375 frames (15s × 25fps)
      "zoompan=z='if(lte(zoom,1.0),1.3,max(1.001,zoom-0.00078))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=375:s=1080x1920",
      drawtextFilters,
    ].join(',');

    // ── Codifica vídeo ────────────────────────────────────────────────────────
    log('🎬 Codificando vídeo 1080×1920 15s (ultrafast)...');
    const t0 = Date.now();

    await ff.exec([
      '-loop',    '1',
      '-i',       'input.jpg',
      '-vf',      vfilter,
      '-t',       '15',
      '-r',       '25',
      '-c:v',     'libx264',
      '-preset',  'ultrafast',
      '-crf',     '30',
      '-pix_fmt', 'yuv420p',
      '-movflags','+faststart',
      '-an',               // sem áudio (Reels aceita sem áudio)
      'output.mp4',
    ]);

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    log(`✅ Vídeo codificado em ${elapsed}s`);

    // ── Lê saída e faz upload ─────────────────────────────────────────────────
    const videoData = await ff.readFile('output.mp4') as Uint8Array;
    log(`📦 Tamanho do vídeo: ${(videoData.byteLength / 1024 / 1024).toFixed(2)} MB`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const filename = `reel-${Date.now()}.mp4`;
    const { error: upErr } = await supabase.storage
      .from('instagram-images')
      .upload(filename, videoData, { contentType: 'video/mp4', upsert: true });
    if (upErr) throw upErr;

    const { data: { publicUrl } } = supabase.storage
      .from('instagram-images')
      .getPublicUrl(filename);

    log(`📤 Upload: ${filename}`);

    // Limpa o sistema de arquivos virtual para a próxima invocação
    try { await ff.deleteFile('input.jpg');  } catch (_) {}
    try { await ff.deleteFile('output.mp4'); } catch (_) {}

    return new Response(JSON.stringify({ url: publicUrl, logs }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('generate-reel-video error:', err);
    return new Response(
      JSON.stringify({ error: err?.message ?? String(err), logs }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});
