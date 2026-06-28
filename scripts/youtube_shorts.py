#!/usr/bin/env python3
"""
PiscouLevou — YouTube Shorts Auto-Post
Gera um vídeo vertical (1080x1920) com a imagem do produto + overlay de preço/desconto
e faz upload para o canal do YouTube como Short.

Dependências: pip install requests google-auth google-auth-oauthlib google-api-python-client pillow
"""

import os
import sys
import json
import time
import subprocess
import tempfile
import requests
from pathlib import Path
from datetime import datetime, timezone

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

# ─── Configurações ────────────────────────────────────────────────────────────
SUPABASE_URL           = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY   = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
YOUTUBE_CLIENT_ID      = os.environ["YOUTUBE_CLIENT_ID"]
YOUTUBE_CLIENT_SECRET  = os.environ["YOUTUBE_CLIENT_SECRET"]
YOUTUBE_REFRESH_TOKEN  = os.environ["YOUTUBE_REFRESH_TOKEN"]
SITE_URL               = "https://www.piscoulevou.com.br"

SUPABASE_HEADERS = {
    "apikey":        SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Content-Type":  "application/json",
}


def log(msg: str):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


# ─── Supabase helpers ─────────────────────────────────────────────────────────

def get_last_platform() -> str:
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/youtube_settings?key=eq.last_posted_platform&select=value",
        headers=SUPABASE_HEADERS,
    )
    data = r.json()
    return data[0]["value"] if data else "shopee"


def set_last_platform(platform: str):
    requests.patch(
        f"{SUPABASE_URL}/rest/v1/youtube_settings?key=eq.last_posted_platform",
        headers=SUPABASE_HEADERS,
        json={"value": platform, "updated_at": datetime.now(timezone.utc).isoformat()},
    )


def pick_product(platform: str) -> dict | None:
    """Busca produto ativo, não postado no YouTube recentemente."""
    # Produtos não postados no YouTube ou postados há mais de 30 dias
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/products"
        f"?select=id,codigo_identificador,title,price,original_price,discount_pct,image_url,affiliate_link,subcategory_name,platform"
        f"&status=eq.active"
        f"&platform=eq.{platform}"
        f"&price=gte.10"
        f"&youtube_posted_at=is.null"
        f"&order=discount_pct.desc.nullslast,price.asc"
        f"&limit=1",
        headers=SUPABASE_HEADERS,
    )
    prods = r.json()
    if prods:
        return prods[0]
    # Fallback: qualquer produto dessa plataforma (postado há mais tempo)
    r2 = requests.get(
        f"{SUPABASE_URL}/rest/v1/products"
        f"?select=id,codigo_identificador,title,price,original_price,discount_pct,image_url,affiliate_link,subcategory_name,platform"
        f"&status=eq.active"
        f"&platform=eq.{platform}"
        f"&price=gte.10"
        f"&order=youtube_posted_at.asc.nullslast"
        f"&limit=1",
        headers=SUPABASE_HEADERS,
    )
    prods2 = r2.json()
    return prods2[0] if prods2 else None


def mark_posted(product_id: str):
    requests.patch(
        f"{SUPABASE_URL}/rest/v1/products?id=eq.{product_id}",
        headers=SUPABASE_HEADERS,
        json={"youtube_posted_at": datetime.now(timezone.utc).isoformat()},
    )


# ─── Geração de vídeo com FFmpeg ──────────────────────────────────────────────

def format_brl(v: float) -> str:
    return f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def create_short_video(product: dict, output_path: str) -> bool:
    """Cria vídeo vertical 1080x1920 usando FFmpeg."""
    image_url = product["image_url"]
    price     = product["price"]
    orig      = product.get("original_price")
    disc_pct  = product.get("discount_pct", 0) or 0
    if orig and orig > price:
        disc_pct = round((orig - price) / orig * 100)

    title = product["title"]
    # Trunca título para caber no vídeo
    if len(title) > 50:
        title = title[:47] + "..."

    plataforma = "SHOPEE" if product.get("platform") == "shopee" else "MERCADO LIVRE"
    price_str  = format_brl(price)
    orig_str   = format_brl(orig) if orig and orig > price else ""
    codigo     = product.get("codigo_identificador", "")

    # Download da imagem do produto
    img_path = output_path.replace(".mp4", "_product.jpg")
    try:
        img_resp = requests.get(image_url, timeout=15)
        with open(img_path, "wb") as f:
            f.write(img_resp.content)
    except Exception as e:
        log(f"❌ Erro ao baixar imagem: {e}")
        return False

    # Filtros FFmpeg para criar vídeo vertical profissional
    # Fundo: imagem borrada (1080x1920)
    # Centro: imagem do produto (900x900 centralizada)
    # Overlay de texto: título, preço, desconto, plataforma, CTA
    
    discount_text = f"{disc_pct}% OFF" if disc_pct >= 5 else ""
    price_text    = price_str
    orig_text     = f"De: {orig_str}" if orig_str else ""
    
    # Cores por plataforma
    if product.get("platform") == "shopee":
        plat_color = "EE4D2D"  # Shopee laranja
    else:
        plat_color = "FFE600"  # ML amarelo (cor hex sem #)

    # Construção do filtro complexo
    vf_parts = [
        # Background borrado
        "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,"
        "crop=1080:1920,boxblur=15:5,brightness=0.4[bg]",
        
        # Produto centralizado
        "[0:v]scale=900:900:force_original_aspect_ratio=decrease,"
        "pad=900:900:(ow-iw)/2:(oh-ih)/2:color=white@0[fg]",
        
        # Composição base
        "[bg][fg]overlay=(W-w)/2:300[base]",
        
        # Badge de plataforma (topo)
        f"[base]drawtext="
        f"text='{plataforma}':"
        f"fontsize=42:fontcolor=black:"
        f"box=1:boxcolor=0x{plat_color}@1:boxborderw=20:"
        f"x=(w-text_w)/2:y=100[withplat]",
        
        # Título do produto
        f"[withplat]drawtext="
        f"text='{title.replace(chr(39), chr(96))}':"
        f"fontsize=30:fontcolor=white:"
        f"box=1:boxcolor=black@0.6:boxborderw=10:"
        f"x=(w-text_w)/2:y=1280:"
        f"line_spacing=5[withtitle]",
    ]
    
    # Preço com desconto
    if orig_str and disc_pct >= 5:
        vf_parts.append(
            f"[withtitle]drawtext="
            f"text='{orig_text}':"
            f"fontsize=32:fontcolor=gray:"
            f"x=(w-text_w)/2:y=1390[withorig]"
        )
        vf_parts.append(
            f"[withorig]drawtext="
            f"text='{discount_text}':"
            f"fontsize=48:fontcolor=white:"
            f"box=1:boxcolor=red@0.9:boxborderw=15:"
            f"x=50:y=1440[withdisc]"
        )
        vf_parts.append(
            f"[withdisc]drawtext="
            f"text='{price_text}':"
            f"fontsize=72:fontcolor=white:fontweight=bold:"
            f"box=1:boxcolor=black@0.5:boxborderw=10:"
            f"x=(w-text_w)/2:y=1500[withprice]"
        )
        last = "withprice"
    else:
        vf_parts.append(
            f"[withtitle]drawtext="
            f"text='{price_text}':"
            f"fontsize=72:fontcolor=white:fontweight=bold:"
            f"box=1:boxcolor=black@0.5:boxborderw=10:"
            f"x=(w-text_w)/2:y=1440[withprice]"
        )
        last = "withprice"

    # CTA - Call to action
    vf_parts.append(
        f"[{last}]drawtext="
        f"text='Ver oferta: www.piscoulevou.com.br':"
        f"fontsize=28:fontcolor=white:"
        f"box=1:boxcolor=black@0.7:boxborderw=12:"
        f"x=(w-text_w)/2:y=1820[final]"
    )

    vf_filter = ";".join(vf_parts)
    # O último estágio é "final" — indicamos para o mapeamento de saída
    # mas precisamos checar se o último estágio está correto
    # Simplificando: usar a última label
    
    cmd = [
        "ffmpeg", "-y",
        "-loop", "1",
        "-i", img_path,
        "-vf", vf_filter,
        "-map", "[final]",
        "-t", "20",              # 20 segundos
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-r", "30",
        "-preset", "fast",
        "-crf", "23",
        output_path,
    ]

    log(f"🎬 Gerando vídeo via FFmpeg...")
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            log(f"❌ FFmpeg stderr: {result.stderr[-500:]}")
            return False
        log(f"✅ Vídeo gerado: {output_path}")
        return True
    except subprocess.TimeoutExpired:
        log("❌ FFmpeg timeout (120s)")
        return False
    except Exception as e:
        log(f"❌ FFmpeg erro: {e}")
        return False


# ─── YouTube OAuth ─────────────────────────────────────────────────────────────

def get_youtube_service():
    """Obtém cliente autenticado do YouTube."""
    creds = Credentials(
        token=None,
        refresh_token=YOUTUBE_REFRESH_TOKEN,
        client_id=YOUTUBE_CLIENT_ID,
        client_secret=YOUTUBE_CLIENT_SECRET,
        token_uri="https://oauth2.googleapis.com/token",
        scopes=["https://www.googleapis.com/auth/youtube.upload"],
    )
    creds.refresh(Request())
    return build("youtube", "v3", credentials=creds)


# ─── Upload para YouTube ───────────────────────────────────────────────────────

def build_description(product: dict) -> str:
    price   = product["price"]
    orig    = product.get("original_price")
    disc    = product.get("discount_pct", 0) or 0
    if orig and orig > price:
        disc = round((orig - price) / orig * 100)
    codigo  = product.get("codigo_identificador", "")
    link    = product.get("affiliate_link", SITE_URL)
    plat    = "Shopee" if product.get("platform") == "shopee" else "Mercado Livre"

    lines = [
        f"🔥 OFERTA #{codigo} — {product['title']}",
        "",
        f"💰 Por apenas R$ {price:.2f}".replace(".", ","),
    ]
    if orig and orig > price and disc >= 5:
        lines.append(f"🏷️ De R$ {orig:.2f} — {disc}% OFF!".replace(".", ","))
    lines += [
        "",
        f"👉 Garantir agora: {link}",
        "",
        f"📲 Ou acesse {SITE_URL} e busque pelo código #{codigo}",
        "",
        "─" * 30,
        f"🛒 Oferta {plat} verificada via API",
        "⚡ Atualizado em tempo real | Pode acabar a qualquer momento",
        "",
        f"#shorts #oferta #desconto #{plat.lower().replace(' ', '')} #piscoulevou #achados #promoção #economize #{codigo}",
    ]
    return "\n".join(lines)


def upload_to_youtube(youtube, video_path: str, product: dict) -> str | None:
    """Faz upload do vídeo para o YouTube como Short."""
    price  = product["price"]
    disc   = product.get("discount_pct", 0) or 0
    orig   = product.get("original_price")
    if orig and orig > price:
        disc = round((orig - price) / orig * 100)
    
    codigo = product.get("codigo_identificador", "")
    plat   = "Shopee" if product.get("platform") == "shopee" else "Mercado Livre"

    title = f"#{codigo} {product['title'][:60]} — {disc}% OFF #shorts"
    if len(title) > 100:
        title = title[:97] + "..."

    body = {
        "snippet": {
            "title":       title,
            "description": build_description(product),
            "tags": [
                "oferta", "desconto", "promoção", "shorts", "piscoulevou",
                plat.lower(), "achados", "economize", str(codigo),
            ],
            "categoryId":  "26",   # How-to & Style (bom para produtos)
        },
        "status": {
            "privacyStatus": "public",
            "selfDeclaredMadeForKids": False,
        },
    }

    media = MediaFileUpload(
        video_path,
        mimetype="video/mp4",
        resumable=True,
        chunksize=5 * 1024 * 1024,  # 5MB chunks
    )

    log(f"📤 Fazendo upload para o YouTube...")
    try:
        request = youtube.videos().insert(
            part="snippet,status",
            body=body,
            media_body=media,
        )
        response = None
        while response is None:
            status, response = request.next_chunk()
            if status:
                log(f"   Upload: {int(status.progress() * 100)}%")
        
        video_id = response.get("id")
        log(f"✅ Vídeo publicado: https://youtube.com/shorts/{video_id}")
        return video_id
    except Exception as e:
        log(f"❌ Erro no upload: {e}")
        return None


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    log("🚀 PiscouLevou — YouTube Shorts Auto-Post")

    # Determina próxima plataforma (alternância ML ↔ Shopee)
    last_platform = get_last_platform()
    next_platform = "mercadolivre" if last_platform == "shopee" else "shopee"
    log(f"🔄 Plataforma: {last_platform} → {next_platform}")

    # Busca produto
    product = pick_product(next_platform)
    if not product:
        log(f"⚠️  Sem produtos disponíveis para {next_platform}, tentando outra plataforma...")
        alt = "shopee" if next_platform == "mercadolivre" else "mercadolivre"
        product = pick_product(alt)
        if not product:
            log("❌ Nenhum produto disponível. Encerrando.")
            sys.exit(0)
        next_platform = alt

    log(f"📦 Produto selecionado: #{product.get('codigo_identificador')} — {product['title'][:60]}")
    log(f"   Preço: R$ {product['price']:.2f} | Plataforma: {product.get('platform')}")

    with tempfile.TemporaryDirectory() as tmpdir:
        video_path = str(Path(tmpdir) / "short.mp4")

        # Gera vídeo
        ok = create_short_video(product, video_path)
        if not ok:
            log("❌ Falha na geração do vídeo.")
            sys.exit(1)

        # Autentica no YouTube
        log("🔐 Autenticando no YouTube...")
        try:
            youtube = get_youtube_service()
        except Exception as e:
            log(f"❌ Falha na autenticação YouTube: {e}")
            sys.exit(1)

        # Upload
        video_id = upload_to_youtube(youtube, video_path, product)
        if not video_id:
            log("❌ Upload falhou.")
            sys.exit(1)

        # Marca como postado
        mark_posted(product["id"])
        set_last_platform(next_platform)
        log(f"✅ Concluído! Short: https://youtube.com/shorts/{video_id}")


if __name__ == "__main__":
    main()
