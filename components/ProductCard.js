'use client';

import { useState, useRef, useEffect } from 'react';

const Icons = {
  whatsapp: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#25D366">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
      <path d="M11.999 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.978-1.417C8.412 21.51 10.166 22 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18c-1.717 0-3.31-.476-4.67-1.3l-.334-.199-3.06.871.878-3.028-.218-.347A7.944 7.944 0 014 12c0-4.411 3.589-8 8-8s8 3.589 8 8-3.589 8-8 8z"/>
    </svg>
  ),
  telegram: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#2AABEE">
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.941z"/>
    </svg>
  ),
  twitter: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="#000">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  ),
  facebook: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#1877F2">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  ),
  copy: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2"/>
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
    </svg>
  ),
};

export default function ProductCard({ product }) {
  const { title, price, original_price, discount_pct, image_url, affiliate_link, is_best_seller, slug, platform } = product;
  const isShopee = platform === 'shopee';

  const [shareOpen, setShareOpen] = useState(false);
  const [copied,    setCopied]    = useState(false);
  const shareRef                  = useRef(null);

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    const handler = (e) => {
      if (shareRef.current && !shareRef.current.contains(e.target)) setShareOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Desconto: usa original_price se disponível, senão usa discount_pct do banco
  const calcDiscount    = original_price && original_price > price
    ? Math.round(((original_price - price) / original_price) * 100) : 0;
  const discountPercent = calcDiscount > 0 ? calcDiscount : (discount_pct ?? 0);
  const hasDiscount     = discountPercent >= 5;
  const formatBRL = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const shareUrl  = affiliate_link || '#';
  const shareText = isShopee
    ? `🛍️ ${title} — por apenas ${formatBRL(price)}! Confira na Shopee:`
    : `🔥 ${title} — por apenas ${formatBRL(price)}! Confira no Mercado Livre:`;

  const shareActions = [
    { key: 'whatsapp', label: 'WhatsApp',   icon: Icons.whatsapp, href: `https://wa.me/?text=${encodeURIComponent(shareText + '\n' + shareUrl)}` },
    { key: 'telegram', label: 'Telegram',   icon: Icons.telegram, href: `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}` },
    { key: 'twitter',  label: 'Twitter / X',icon: Icons.twitter,  href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}` },
    { key: 'facebook', label: 'Facebook',   icon: Icons.facebook, href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}` },
  ];

  const handleCopy = async (e) => {
    e.stopPropagation();
    try { await navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
    setShareOpen(false);
  };

  const handleAffiliate = (e) => {
    if (shareOpen) return;
    e.preventDefault();
    if (affiliate_link) window.open(affiliate_link, '_blank', 'noopener,noreferrer');
  };

  const rating     = (4.5 + (title.length % 5) * 0.1).toFixed(1);
  const salesCount = 100 + (title.length % 9) * 200;

  return (
    <article
      className="product-card relative flex flex-col bg-white rounded-2xl cursor-pointer animate-fade-in"
      id={`product-card-${slug || product.id}`}
      onClick={handleAffiliate}
      role="button" tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && handleAffiliate(e)}
      aria-label={`Ver oferta: ${title}`}
    >
      {/* ── Botão compartilhar — posicionado sobre o article (fora do overflow-hidden) ── */}
      <div
        ref={shareRef}
        className="absolute top-2 right-2 z-20"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          id={`share-btn-${product.id}`}
          onClick={(e) => { e.stopPropagation(); setShareOpen((v) => !v); }}
          className="w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm shadow-md border border-slate-100 flex items-center justify-center text-slate-500 hover:text-[#FF5A00] hover:border-[#FF5A00]/40 transition-all"
          aria-label="Compartilhar"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
          </svg>
        </button>

        {/* Dropdown */}
        {shareOpen && (
          <div className="share-dropdown">
            {shareActions.map((a) => (
              <a key={a.key} href={a.href} target="_blank" rel="noopener noreferrer"
                className="share-option"
                onClick={(e) => { e.stopPropagation(); setShareOpen(false); }}>
                {a.icon} {a.label}
              </a>
            ))}
            <button className="share-option w-full" onClick={handleCopy}>
              {Icons.copy} {copied ? '✅ Copiado!' : 'Copiar link'}
            </button>
          </div>
        )}
      </div>

      {/* ── Imagem (overflow-hidden apenas aqui) ── */}
      <div className="relative w-full aspect-square bg-[#F8FAFC] flex items-center justify-center p-5 overflow-hidden rounded-t-2xl border-b border-slate-50">
        {image_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={image_url} alt={title}
            className="max-w-full max-h-full object-contain transition-transform duration-300"
            loading="lazy" decoding="async"
          />
        ) : (
          <div className="text-4xl text-slate-200">🛍️</div>
        )}

        {/* Badges: desconto + plataforma + best seller */}
        <div className="absolute top-2.5 left-2.5 flex flex-col gap-1 pointer-events-none">
          {discountPercent >= 5 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-black bg-[#FF5A00] text-white uppercase tracking-wide shadow-sm">
              -{discountPercent}% OFF
            </span>
          )}
          {is_best_seller && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#FFF159] text-[#0F172A] uppercase tracking-wide shadow-sm">
              🏆 Top
            </span>
          )}
        </div>
        {/* Badge de plataforma — canto inferior esquerdo */}
        <div className="absolute bottom-2 left-2 pointer-events-none">
          {isShopee ? (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '3px',
              background: '#EE4D2D', color: 'white',
              fontSize: '10px', fontWeight: '800',
              padding: '2px 7px', borderRadius: '6px',
              letterSpacing: '0.03em', boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
            }}>
              🛍️ Shopee
            </span>
          ) : (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '3px',
              background: '#FFF159', color: '#0F172A',
              fontSize: '10px', fontWeight: '800',
              padding: '2px 7px', borderRadius: '6px',
              letterSpacing: '0.03em', boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
            }}>
              🛒 Meli
            </span>
          )}
        </div>
      </div>

      {/* ── Conteúdo ── */}
      <div className="flex flex-col flex-1 p-4 gap-2">
        <h3 className="text-slate-800 text-[13px] font-medium line-clamp-2 leading-snug" title={title}>
          {title}
        </h3>

        <div className="flex items-center gap-1 text-[11px] text-slate-500">
          <span className="text-amber-400 font-bold tracking-tight">★ {rating}</span>
          <span className="text-slate-200">|</span>
          <span>+{salesCount.toLocaleString('pt-BR')} vendidos</span>
        </div>

        <div className="mt-auto pt-2 space-y-0.5">
          {hasDiscount && (
            <span className="text-xs text-slate-400 line-through block">{formatBRL(original_price)}</span>
          )}
          <span className="text-[22px] font-extrabold text-[#0F172A] leading-none block">{formatBRL(price)}</span>
          {price > 100 && (
            <p className="text-[11px] text-slate-500">
              em até <span className="text-emerald-600 font-semibold">12x {formatBRL(price / 12)}</span> sem juros
            </p>
          )}
        </div>

        <a
          href={affiliate_link} target="_blank" rel="noopener noreferrer"
          id={`cta-btn-${product.id}`}
          onClick={(e) => e.stopPropagation()}
          className="mt-3 w-full text-center py-2.5 px-3 rounded-xl text-[13px] font-black transition-all flex items-center justify-center gap-1.5 shadow-sm"
          style={isShopee ? {
            background: '#EE4D2D', color: 'white',
            border: '1px solid #D44325',
          } : {
            background: '#FFF159', color: '#0F172A',
            border: '1px solid #E5D020',
          }}
        >
          {isShopee ? 'Ver Oferta na Shopee' : 'Ver Oferta no Mercado Livre'}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        </a>
      </div>
    </article>
  );
}
