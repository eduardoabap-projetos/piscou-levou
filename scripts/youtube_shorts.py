#!/usr/bin/env python3
"""
PiscouLevou — YouTube Shorts Auto-Post
Gera vídeo vertical 1080x1920 com Pillow (composição) + FFmpeg (encoding)
e faz upload para o YouTube como Short.
"""

import os, sys, json, time, subprocess, tempfile, io, textwrap, requests
from pathlib import Path
from datetime import datetime, timezone

from PIL import Image, ImageDraw, ImageFont, ImageFilter
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

# ─── Configurações ────────────────────────────────────────────────────────────
SUPABASE_URL          = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY  = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
YOUTUBE_CLIENT_ID     = os.environ["YOUTUBE_CLIENT_ID"]
YOUTUBE_CLIENT_SECRET = os.environ["YOUTUBE_CLIENT_SECRET"]
YOUTUBE_REFRESH_TOKEN = os.environ["YOUTUBE_REFRESH_TOKEN"]
SITE_URL              = "https://www.piscoulevou.com.br"

HEADERS = {
    "apikey":        SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Content-Type":  "application/json",
}

def log(msg): print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)

def format_brl(v: float) -> str:
    return f"R$ {v:_.2f}".replace("_", ".").replace(".", ",", 1) if "." not in f"{v:.2f}" else \
           "R$ " + f"{v:.2f}".replace(".", ",")

def format_brl(v: float) -> str:
    s = f"{v:.2f}"
    intpart, dec = s.split(".")
    # Adiciona separador de milhar
    result = ""
    for i, c in enumerate(reversed(intpart)):
        if i > 0 and i % 3 == 0:
            result = "." + result
        result = c + result
    return f"R$ {result},{dec}"

# ─── Supabase ─────────────────────────────────────────────────────────────────

def get_last_platform() -> str:
    r = requests.get(f"{SUPABASE_URL}/rest/v1/youtube_settings?key=eq.last_posted_platform&select=value", headers=HEADERS)
    d = r.json()
    return d[0]["value"] if d else "shopee"

def set_last_platform(p: str):
    requests.patch(f"{SUPABASE_URL}/rest/v1/youtube_settings?key=eq.last_posted_platform",
                   headers=HEADERS, json={"value": p, "updated_at": datetime.now(timezone.utc).isoformat()})

def pick_product(platform: str):
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/products"
        f"?select=id,codigo_identificador,title,price,original_price,discount_pct,image_url,affiliate_link,subcategory_name,platform"
        f"&status=eq.active&platform=eq.{platform}&price=gte.10"
        f"&youtube_posted_at=is.null&order=discount_pct.desc.nullslast,price.asc&limit=1",
        headers=HEADERS)
    p = r.json()
    if p: return p[0]
    r2 = requests.get(
        f"{SUPABASE_URL}/rest/v1/products"
        f"?select=id,codigo_identificador,title,price,original_price,discount_pct,image_url,affiliate_link,subcategory_name,platform"
        f"&status=eq.active&platform=eq.{platform}&price=gte.10"
        f"&order=youtube_posted_at.asc.nullslast&limit=1",
        headers=HEADERS)
    p2 = r2.json()
    return p2[0] if p2 else None

def mark_posted(product_id: str):
    requests.patch(f"{SUPABASE_URL}/rest/v1/products?id=eq.{product_id}",
                   headers=HEADERS, json={"youtube_posted_at": datetime.now(timezone.utc).isoformat()})

# ─── Geração de imagem com Pillow ─────────────────────────────────────────────

FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REG  = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

def load_font(path: str, size: int):
    try:    return ImageFont.truetype(path, size)
    except: return ImageFont.load_default()

def draw_centered_text(draw, text: str, y: int, font, color, W: int, shadow=True):
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    x = (W - tw) // 2
    if shadow:
        draw.text((x+2, y+2), text, font=font, fill=(0,0,0,200))
    draw.text((x, y), text, font=font, fill=color)
    return bbox[3] - bbox[1]  # altura do texto

def create_frame_image(product: dict, out_path: str) -> bool:
    """Cria imagem composta 1080x1920 com Pillow."""
    W, H = 1080, 1920
    price    = product["price"]
    orig     = product.get("original_price")
    disc_pct = product.get("discount_pct") or 0
    if orig and orig > price:
        disc_pct = round((orig - price) / orig * 100)

    is_shopee = product.get("platform") == "shopee"
    plat_label = "SHOPEE" if is_shopee else "MERCADO LIVRE"
    plat_bg    = (238, 77, 45)  if is_shopee else (255, 210, 0)
    plat_fg    = (255,255,255)  if is_shopee else (0,0,0)

    # Baixa imagem do produto
    try:
        resp = requests.get(product["image_url"], timeout=15)
        prod_img = Image.open(io.BytesIO(resp.content)).convert("RGB")
    except Exception as e:
        log(f"❌ Erro ao baixar imagem: {e}")
        return False

    # ── Background borrado ──────────────────────────────────────────────────
    bg = prod_img.resize((W, H), Image.LANCZOS).filter(ImageFilter.GaussianBlur(25))
    canvas = bg.convert("RGBA")
    # Escurece background
    canvas.alpha_composite(Image.new("RGBA", (W, H), (0, 0, 0, 170)))

    draw = ImageDraw.Draw(canvas)

    # ── Fontes ─────────────────────────────────────────────────────────────
    f_badge  = load_font(FONT_BOLD, 44)
    f_title  = load_font(FONT_BOLD, 34)
    f_orig   = load_font(FONT_REG,  36)
    f_disc   = load_font(FONT_BOLD, 50)
    f_price  = load_font(FONT_BOLD, 88)
    f_cta    = load_font(FONT_REG,  30)

    # ── Badge de plataforma (topo) ──────────────────────────────────────────
    pad = 24
    bb  = draw.textbbox((0,0), plat_label, font=f_badge)
    bw, bh = bb[2]-bb[0]+pad*2, bb[3]-bb[1]+pad
    bx = (W - bw) // 2
    by = 80
    draw.rounded_rectangle([bx, by, bx+bw, by+bh], radius=14, fill=plat_bg)
    draw.text((bx+pad, by+pad//2), plat_label, font=f_badge, fill=plat_fg)

    # ── Imagem do produto (quadrado branco centralizado) ───────────────────
    prod_size = 880
    prod_box  = Image.new("RGB", (prod_size, prod_size), (255,255,255))
    prod_img.thumbnail((prod_size, prod_size), Image.LANCZOS)
    px_ = (prod_size - prod_img.width)  // 2
    py_ = (prod_size - prod_img.height) // 2
    prod_box.paste(prod_img, (px_, py_))
    canvas.paste(prod_box.convert("RGBA"), ((W-prod_size)//2, by+bh+30))

    # ── Posição Y após a imagem ────────────────────────────────────────────
    ty = by + bh + 30 + prod_size + 28

    # ── Título (até 3 linhas) ──────────────────────────────────────────────
    raw_title = product["title"]
    lines = textwrap.wrap(raw_title, width=38)[:3]
    for line in lines:
        h = draw_centered_text(draw, line, ty, f_title, (255,255,255), W)
        ty += h + 8
    ty += 12

    # ── Preço original + desconto ──────────────────────────────────────────
    if orig and orig > price and disc_pct >= 5:
        orig_str = format_brl(orig)
        bb2 = draw.textbbox((0,0), f"De: {orig_str}", font=f_orig)
        ow  = bb2[2]-bb2[0]
        ox  = (W - ow) // 2
        draw.text((ox, ty), f"De: {orig_str}", font=f_orig, fill=(180,180,180))
        # Linha riscada
        mid_y = ty + (bb2[3]-bb2[1])//2
        draw.line([(ox, mid_y), (ox+ow, mid_y)], fill=(180,180,180), width=3)
        ty += bb2[3]-bb2[1] + 10

        disc_txt = f"  -{disc_pct}% OFF  "
        bb3 = draw.textbbox((0,0), disc_txt, font=f_disc)
        dw, dh = bb3[2]-bb3[0]+20, bb3[3]-bb3[1]+16
        dx = (W - dw) // 2
        draw.rounded_rectangle([dx, ty, dx+dw, ty+dh], radius=10, fill=(210,20,20))
        draw.text((dx+10, ty+8), disc_txt, font=f_disc, fill=(255,255,255))
        ty += dh + 14

    # ── Preço atual ────────────────────────────────────────────────────────
    price_str = format_brl(price)
    bb4 = draw.textbbox((0,0), price_str, font=f_price)
    pw  = bb4[2]-bb4[0]
    draw.text(((W-pw)//2+3, ty+3), price_str, font=f_price, fill=(0,0,0,180))
    draw.text(((W-pw)//2, ty),   price_str, font=f_price, fill=(255,255,255))

    # ── CTA (rodapé fixo) ──────────────────────────────────────────────────
    cta = "Ver oferta em: www.piscoulevou.com.br"
    canvas.alpha_composite(Image.new("RGBA", (W, 64), (0,0,0,200)), (0, H-74))
    bb5 = draw.textbbox((0,0), cta, font=f_cta)
    cw  = bb5[2]-bb5[0]
    draw.text(((W-cw)//2, H-62), cta, font=f_cta, fill=(255,255,255))

    # Salva
    canvas.convert("RGB").save(out_path, "JPEG", quality=95)
    log(f"✅ Frame composto: {out_path}")
    return True


def create_short_video(product: dict, output_path: str) -> bool:
    """Cria vídeo vertical 1080x1920 com Pillow + FFmpeg simples."""
    frame_path = output_path.replace(".mp4", "_frame.jpg")
    if not create_frame_image(product, frame_path):
        return False

    cmd = [
        "ffmpeg", "-y",
        "-loop", "1",
        "-i", frame_path,
        "-t", "20",           # 20 segundos
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-r", "30",
        "-preset", "fast",
        "-crf", "22",
        output_path,
    ]
    log("🎬 Convertendo frame → vídeo MP4 via FFmpeg...")
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if r.returncode != 0:
            log(f"❌ FFmpeg stderr: {r.stderr[-400:]}")
            return False
        log(f"✅ Vídeo gerado: {output_path}")
        return True
    except Exception as e:
        log(f"❌ FFmpeg erro: {e}")
        return False


# ─── YouTube ──────────────────────────────────────────────────────────────────

def get_youtube_service():
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


def build_description(p: dict) -> str:
    price  = p["price"]
    orig   = p.get("original_price")
    disc   = p.get("discount_pct") or 0
    if orig and orig > price: disc = round((orig-price)/orig*100)
    codigo = p.get("codigo_identificador","")
    link   = p.get("affiliate_link", SITE_URL)
    plat   = "Shopee" if p.get("platform")=="shopee" else "Mercado Livre"
    lines  = [
        f"🔥 OFERTA #{codigo} — {p['title']}","",
        f"💰 {format_brl(price)}",
    ]
    if orig and orig>price and disc>=5:
        lines.append(f"🏷️ De {format_brl(orig)} — {disc}% OFF!")
    lines += ["",f"👉 Garantir agora: {link}","",
              f"📲 Ou acesse {SITE_URL} e busque #{ codigo}","",
              "─"*30,f"Oferta {plat} verificada via API","",
              f"#shorts #oferta #desconto #{plat.lower().replace(' ','')} #piscoulevou #achados #promoção #{codigo}"]
    return "\n".join(lines)


def upload_to_youtube(youtube, video_path: str, p: dict):
    price = p["price"]
    orig  = p.get("original_price")
    disc  = p.get("discount_pct") or 0
    if orig and orig > price: disc = round((orig-price)/orig*100)
    codigo = p.get("codigo_identificador","")
    plat   = "Shopee" if p.get("platform")=="shopee" else "Mercado Livre"
    disc_s = f" — {disc}% OFF" if disc>=5 else ""
    title  = f"#{codigo} {p['title'][:55]}{disc_s} #shorts"[:100]

    body = {
        "snippet": {
            "title":       title,
            "description": build_description(p),
            "tags":        ["oferta","desconto","promoção","shorts","piscoulevou",
                            plat.lower(),str(codigo),"economize","achados"],
            "categoryId":  "26",
        },
        "status": {"privacyStatus":"public","selfDeclaredMadeForKids":False},
    }
    media = MediaFileUpload(video_path, mimetype="video/mp4", resumable=True, chunksize=5*1024*1024)
    log("📤 Fazendo upload para o YouTube...")
    try:
        req = youtube.videos().insert(part="snippet,status", body=body, media_body=media)
        response = None
        while response is None:
            status, response = req.next_chunk()
            if status: log(f"   Upload: {int(status.progress()*100)}%")
        vid = response.get("id")
        log(f"✅ Short publicado: https://youtube.com/shorts/{vid}")
        return vid
    except Exception as e:
        log(f"❌ Erro no upload: {e}")
        return None


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    log("🚀 PiscouLevou — YouTube Shorts Auto-Post")
    last = get_last_platform()
    nxt  = "mercadolivre" if last=="shopee" else "shopee"
    log(f"🔄 {last} → {nxt}")

    product = pick_product(nxt)
    if not product:
        alt = "shopee" if nxt=="mercadolivre" else "mercadolivre"
        product = pick_product(alt)
        if not product:
            log("❌ Sem produtos disponíveis."); sys.exit(0)
        nxt = alt

    log(f"📦 #{product.get('codigo_identificador')} — {product['title'][:60]}")
    log(f"   Preço: {format_brl(product['price'])} | {product.get('platform')}")

    with tempfile.TemporaryDirectory() as tmp:
        video_path = str(Path(tmp) / "short.mp4")
        if not create_short_video(product, video_path):
            log("❌ Falha ao gerar vídeo."); sys.exit(1)

        log("🔐 Autenticando YouTube...")
        try:
            yt = get_youtube_service()
        except Exception as e:
            log(f"❌ Auth falhou: {e}"); sys.exit(1)

        vid_id = upload_to_youtube(yt, video_path, product)
        if not vid_id:
            log("❌ Upload falhou."); sys.exit(1)

        mark_posted(product["id"])
        set_last_platform(nxt)
        log(f"🎉 Concluído! https://youtube.com/shorts/{vid_id}")


if __name__ == "__main__":
    main()
