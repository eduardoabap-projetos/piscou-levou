'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import Navbar from '../../components/Navbar';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const formatBRL = (v) =>
  Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const discountPct = (original, current) =>
  original > current ? Math.round(((original - current) / original) * 100) : 0;

// ─── Componente interno (usa useSearchParams — precisa de Suspense) ────────────
function InstagramSearch() {
  const [code,    setCode]    = useState('');
  const [product, setProduct] = useState(null);
  const [status,  setStatus]  = useState('idle'); // idle | loading | found | not-found | error
  const inputRef    = useRef(null);
  const searchParams = useSearchParams();

  // ── Auto-busca se vier com ?code= na URL (usuário clicou no link sticker do Story)
  useEffect(() => {
    const urlCode = searchParams.get('code');
    if (urlCode) {
      const num = parseInt(urlCode, 10);
      if (num >= 1) {
        setCode(String(num));
        searchByCode(num);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Query ──────────────────────────────────────────────────────────────────
  const searchByCode = async (num) => {
    setStatus('loading');
    setProduct(null);
    const { data, error } = await supabase
      .from('products')
      .select('codigo_identificador, title, price, original_price, image_url, affiliate_link, subcategory_name, platform')
      .eq('codigo_identificador', num)
      .eq('status', 'active')
      .eq('enviado_instagram', true)   // só mostra ofertas já postadas no IG
      .single();
    if (error || !data) { setStatus('not-found'); return; }
    setProduct(data);
    setStatus('found');
  };

  const handleSearch = async (e) => {
    e?.preventDefault();
    const num = parseInt(code.trim(), 10);
    if (!num || num < 1) return;
    await searchByCode(num);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch();
  };

  const clearSearch = () => {
    setCode('');
    setProduct(null);
    setStatus('idle');
    inputRef.current?.focus();
  };

  const pct = product
    ? discountPct(product.original_price ?? 0, product.price)
    : 0;

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 60%, #0F172A 100%)' }}>
      <Navbar />

      {/* Hero da página */}
      <section style={{ padding: '48px 24px 32px', textAlign: 'center', maxWidth: '640px', margin: '0 auto' }}>

        {/* Badge Instagram */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '8px',
          background: 'linear-gradient(90deg, #833ab4, #fd1d1d, #fcb045)',
          borderRadius: '100px', padding: '6px 18px', marginBottom: '24px',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
          </svg>
          <span style={{ color: 'white', fontWeight: '700', fontSize: '13px' }}>Oferta do Instagram</span>
        </div>

        <h1 style={{ fontSize: 'clamp(26px, 6vw, 38px)', fontWeight: '800', color: 'white', lineHeight: 1.2, marginBottom: '12px' }}>
          Encontre o produto<br />
          <span style={{ color: '#FFF159' }}>pelo código do post</span>
        </h1>
        <p style={{ color: '#94A3B8', fontSize: '15px', marginBottom: '32px', lineHeight: 1.6 }}>
          Viu uma oferta no nosso Instagram? Digite o código <strong style={{ color: '#FFF159' }}>#XXX</strong> abaixo para encontrar o produto com desconto.
        </p>

        {/* Barra de busca */}
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '10px', maxWidth: '420px', margin: '0 auto' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <span style={{
              position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)',
              color: '#FFF159', fontWeight: '800', fontSize: '20px', pointerEvents: 'none',
            }}>#</span>
            <input
              ref={inputRef}
              type="number"
              min="1"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Digite o código..."
              id="instagram-code-input"
              aria-label="Código do produto do Instagram"
              style={{
                width: '100%', height: '56px',
                paddingLeft: '36px', paddingRight: '16px',
                fontSize: '18px', fontWeight: '700',
                background: 'rgba(255,255,255,0.08)',
                border: '2px solid rgba(255,255,255,0.15)',
                borderRadius: '16px', color: 'white',
                outline: 'none', transition: 'border-color 0.2s',
              }}
              onFocus={(e) => { e.target.style.borderColor = '#FFF159'; }}
              onBlur={(e)  => { e.target.style.borderColor = 'rgba(255,255,255,0.15)'; }}
            />
          </div>
          <button
            type="submit"
            disabled={!code || status === 'loading'}
            id="instagram-search-btn"
            style={{
              height: '56px', padding: '0 24px',
              background: '#FFF159', borderRadius: '16px',
              border: 'none', cursor: 'pointer',
              fontWeight: '800', fontSize: '15px', color: '#0F172A',
              whiteSpace: 'nowrap', transition: 'all 0.15s',
              opacity: !code || status === 'loading' ? 0.6 : 1,
            }}
            onMouseEnter={(e) => { e.target.style.transform = 'scale(1.03)'; }}
            onMouseLeave={(e) => { e.target.style.transform = 'scale(1)'; }}
          >
            {status === 'loading' ? '🔍...' : 'Buscar'}
          </button>
        </form>
      </section>

      {/* ── Resultados ────────────────────────────────────────────────────── */}
      <section style={{ maxWidth: '480px', margin: '0 auto', padding: '0 24px 64px' }}>

        {/* Loading */}
        {status === 'loading' && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '50%',
              border: '3px solid rgba(255,241,89,0.2)', borderTopColor: '#FFF159',
              animation: 'spin 0.8s linear infinite', margin: '0 auto',
            }} />
            <p style={{ color: '#94A3B8', marginTop: '16px', fontSize: '14px' }}>Buscando oferta...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* Não encontrado */}
        {status === 'not-found' && (
          <div style={{
            background: 'rgba(255,255,255,0.06)', borderRadius: '20px',
            padding: '32px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.1)',
          }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>😕</div>
            <p style={{ color: 'white', fontWeight: '700', fontSize: '16px', marginBottom: '8px' }}>
              Código #{code} não encontrado
            </p>
            <p style={{ color: '#94A3B8', fontSize: '14px', lineHeight: 1.6, marginBottom: '20px' }}>
              Verifique o número no post do Instagram e tente novamente. A oferta pode ter expirado.
            </p>
            <button onClick={clearSearch} style={{
              background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '12px', padding: '10px 20px', color: 'white',
              fontWeight: '600', cursor: 'pointer', fontSize: '14px',
            }}>
              Buscar outro código
            </button>
          </div>
        )}

        {/* Produto encontrado */}
        {status === 'found' && product && (
          <div style={{
            background: 'white', borderRadius: '24px', overflow: 'hidden',
            boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
            animation: 'slideUp 0.4s cubic-bezier(0.25, 1, 0.5, 1) both',
          }}>
            <style>{`
              @keyframes slideUp {
                from { opacity: 0; transform: translateY(20px); }
                to   { opacity: 1; transform: translateY(0); }
              }
            `}</style>

            {/* Badge do código */}
            <div style={{
              background: 'linear-gradient(135deg, #0F172A, #1E293B)',
              padding: '12px 20px', display: 'flex', alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <span style={{ color: '#94A3B8', fontSize: '13px', fontWeight: '600' }}>Oferta encontrada ✓</span>
              <span style={{
                background: '#FFF159', color: '#0F172A',
                fontWeight: '800', fontSize: '13px',
                padding: '3px 10px', borderRadius: '100px',
              }}>
                #{product.codigo_identificador}
              </span>
            </div>

            {/* Imagem */}
            <div style={{ background: '#F8FAFC', padding: '24px', textAlign: 'center' }}>
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={product.title}
                  style={{ maxHeight: '220px', maxWidth: '100%', objectFit: 'contain', borderRadius: '12px' }}
                />
              ) : (
                <div style={{ height: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '64px' }}>
                  🛍️
                </div>
              )}
            </div>

            {/* Info do produto */}
            <div style={{ padding: '20px 24px 28px' }}>
              {product.subcategory_name && (
                <p style={{ fontSize: '11px', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
                  {product.subcategory_name}
                </p>
              )}
              <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#0F172A', lineHeight: 1.4, marginBottom: '16px' }}>
                {product.title}
              </h2>

              {/* Preço */}
              <div style={{ marginBottom: '20px' }}>
                {product.original_price && product.original_price > product.price && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ textDecoration: 'line-through', color: '#94A3B8', fontSize: '13px' }}>
                      {formatBRL(product.original_price)}
                    </span>
                    <span style={{
                      background: '#FF5A00', color: 'white',
                      fontSize: '11px', fontWeight: '700',
                      padding: '2px 8px', borderRadius: '6px',
                    }}>
                      -{pct}% OFF
                    </span>
                  </div>
                )}
                <div style={{ fontSize: '28px', fontWeight: '900', color: '#0F172A' }}>
                  {formatBRL(product.price)}
                </div>
              </div>

              {/* CTA — dinâmico por plataforma */}
              <a
                href={product.affiliate_link}
                target="_blank"
                rel="noopener noreferrer"
                id={`ig-product-cta-${product.codigo_identificador}`}
                style={{
                  display: 'block', width: '100%',
                  background: product.platform === 'shopee' ? '#EE4D2D' : '#FFF159',
                  color:      product.platform === 'shopee' ? 'white'   : '#0F172A',
                  textDecoration: 'none', textAlign: 'center',
                  padding: '16px', borderRadius: '14px',
                  fontWeight: '800', fontSize: '16px',
                  boxShadow: product.platform === 'shopee'
                    ? '0 4px 14px rgba(238,77,45,0.35)'
                    : '0 4px 14px rgba(255,241,89,0.4)',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                {product.platform === 'shopee'
                  ? '🛍️ Ver Desconto na Shopee →'
                  : '🛒 Ver Desconto no Mercado Livre →'
                }
              </a>

              {/* Link novo código */}
              <button
                onClick={clearSearch}
                style={{
                  display: 'block', width: '100%', marginTop: '10px',
                  background: 'none', border: '1px solid #E2E8F0',
                  borderRadius: '14px', padding: '12px',
                  color: '#64748B', fontWeight: '600', fontSize: '14px',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => { e.target.style.background = '#F8FAFC'; }}
                onMouseLeave={(e) => { e.target.style.background = 'none'; }}
              >
                Buscar outro código
              </button>
            </div>
          </div>
        )}

        {/* Estado inicial */}
        {status === 'idle' && (
          <div style={{ textAlign: 'center', padding: '16px 0', opacity: 0.5 }}>
            <p style={{ color: '#94A3B8', fontSize: '13px' }}>
              💡 Exemplo: se o post mostra <strong style={{ color: '#FFF159' }}>#42</strong>, digite <strong style={{ color: '#FFF159' }}>42</strong> e clique em Buscar
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Export principal com Suspense (obrigatório para useSearchParams no Next.js) ─
export default function InstagramPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '50%',
            border: '3px solid rgba(255,241,89,0.2)', borderTopColor: '#FFF159',
            animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: '#94A3B8', fontSize: '14px' }}>Carregando...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    }>
      <InstagramSearch />
    </Suspense>
  );
}
