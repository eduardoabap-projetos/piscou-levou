'use client';

import { useState, useEffect, useMemo } from 'react';
import Navbar      from '../components/Navbar';
import HeroSection from '../components/HeroSection';
import CategoryNav from '../components/CategoryNav';
import ProductGrid from '../components/ProductGrid';
import Footer      from '../components/Footer';
import { supabase } from '../lib/supabaseClient';
import Link from 'next/link';

const CAT_EMOJI = {
  // Originais
  'eletrodomesticos':         '🏠',
  'ferramentas':              '🔧',
  'casa-e-organizacao':       '🛋️',
  'eletronicos-e-tecnologia': '📺',
  'cuidados-pessoais':        '💄',
  // Novas — slugs verificados
  'celulares':                '📱',
  'computacao':               '💻',
  'esportes':                 '⚽',
  'bebes':                    '👶',
  'games':                    '🎮',
  'pet-shop':                 '🐾',
  'automotivo':               '🚗',
  'moda':                     '👗',
};

const SORT_OPTIONS = [
  { value: 'relevantes',    label: '⭐ Relevância'       },
  { value: 'maior_desconto',label: '🔥 Maior Desconto'   },
  { value: 'menor_preco',   label: '💰 Menor Preço'      },
  { value: 'maior_preco',   label: '📈 Maior Preço'      },
];

const DISCOUNT_OPTIONS = [
  { value: 0,  label: 'Qualquer desconto' },
  { value: 10, label: '10% ou mais'       },
  { value: 20, label: '20% ou mais'       },
  { value: 30, label: '30% ou mais'       },
  { value: 40, label: '40% ou mais'       },
];

export default function HomePage() {
  const [allProducts, setAllProducts] = useState([]);
  const [categories,  setCategories]  = useState([]);
  const [loading,     setLoading]     = useState(true);

  const [searchTerm,   setSearchTerm]   = useState('');
  const [sortBy,       setSortBy]       = useState('relevantes');
  const [minDiscount,  setMinDiscount]  = useState(0);
  const [activeCategory, setActiveCategory] = useState('all');
  const [activePlatform, setActivePlatform] = useState('all'); // 'all' | 'mercadolivre' | 'shopee'
  const [expandedCats,   setExpandedCats]   = useState({}); // { [catId]: true } quando expandido

  const PREVIEW_COUNT = 5; // produtos visíveis por padrão por categoria

  const toggleCat = (catId) =>
    setExpandedCats((prev) => ({ ...prev, [catId]: !prev[catId] }));
  const [isMobile,     setIsMobile]     = useState(false);

  // ── Instagram code search widget ───────────────────────────────
  const [igCode,       setIgCode]       = useState('');
  const [igProduct,    setIgProduct]    = useState(null);
  const [igStatus,     setIgStatus]     = useState('idle'); // idle | loading | found | not-found
  const [showIgWidget, setShowIgWidget] = useState(true);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const handleIgSearch = async (codeStr) => {
    const num = parseInt(codeStr ?? igCode, 10);
    if (!num || num < 1) return;
    setIgStatus('loading');
    setIgProduct(null);
    const { data, error } = await supabase
      .from('products')
      .select('codigo_identificador, title, price, original_price, image_url, affiliate_link, subcategory_name')
      .eq('codigo_identificador', num)
      .eq('status', 'active')
      .single();
    if (error || !data) { setIgStatus('not-found'); return; }
    setIgProduct(data);
    setIgStatus('found');
  };

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const { data: cats } = await supabase
        .from('categories')
        .select('id, name, slug')
        .order('name', { ascending: true });
      if (cats) setCategories(cats);

      const { data: all } = await supabase
        .from('products')
        .select('id, meli_item_id, title, slug, price, original_price, discount_pct, image_url, affiliate_link, is_best_seller, is_highlight, category_id, subcategory_name, platform')
        .eq('status', 'active');
      if (all) setAllProducts(all);
      setLoading(false);
    }
    fetchData();
  }, []);

  // Ordenação
  const sortList = (list) => [...list].sort((a, b) => {
    const discA = a.original_price && a.original_price > a.price
      ? ((a.original_price - a.price) / a.original_price) * 100 : 0;
    const discB = b.original_price && b.original_price > b.price
      ? ((b.original_price - b.price) / b.original_price) * 100 : 0;
    if (sortBy === 'menor_preco')    return a.price - b.price;
    if (sortBy === 'maior_preco')    return b.price - a.price;
    if (sortBy === 'maior_desconto') return discB - discA;
    // relevância: best-sellers primeiro, depois maior desconto
    if (a.is_best_seller && !b.is_best_seller) return -1;
    if (!a.is_best_seller && b.is_best_seller) return 1;
    return discB - discA;
  });

  // Produtos filtrados globalmente
  const filtered = useMemo(() => {
    return allProducts.filter((p) => {
      const disc = p.original_price && p.original_price > p.price
        ? ((p.original_price - p.price) / p.original_price) * 100 : 0;
      const matchSearch   = !searchTerm || p.title.toLowerCase().includes(searchTerm.toLowerCase());
      const matchDiscount = disc >= minDiscount;
      const matchCat      = activeCategory === 'all' || p.category_id === activeCategory;
      const matchPlatform = activePlatform === 'all' || p.platform === activePlatform;
      return matchSearch && matchDiscount && matchCat && matchPlatform;
    });
  }, [allProducts, searchTerm, minDiscount, activeCategory, activePlatform]);

  // Produtos por categoria (agrupados por subcategoria dentro)
  const byCategory = useMemo(() => {
    return categories.map((cat) => {
      const prods = filtered.filter((p) => p.category_id === cat.id);
      // Agrupa por subcategoria
      const subcatMap = new Map();
      for (const p of prods) {
        const key = p.subcategory_name ?? null;
        if (!subcatMap.has(key)) subcatMap.set(key, []);
        subcatMap.get(key).push(p);
      }
      const groups = Array.from(subcatMap.entries())
        .sort(([a], [b]) => { if (!a) return 1; if (!b) return -1; return a.localeCompare(b, 'pt-BR'); });
      return { cat, groups, total: prods.length };
    }).filter((c) => c.total > 0);
  }, [categories, filtered]);

  // Maiores descontos (destaque rápido)
  const topDeals = useMemo(() =>
    sortList(allProducts.filter((p) => {
      const d = p.original_price && p.original_price > p.price
        ? ((p.original_price - p.price) / p.original_price) * 100 : 0;
      return d >= 25;
    })).slice(0, 8)
  , [allProducts, sortBy]);

  const hasFilters = searchTerm || minDiscount > 0 || activeCategory !== 'all' || activePlatform !== 'all';

  // Contagem por plataforma (para exibir nos botões)
  const countMeli   = allProducts.filter(p => !p.platform || p.platform === 'mercadolivre').length;
  const countShopee = allProducts.filter(p => p.platform === 'shopee').length;

  return (
    <div className="w-full min-h-screen bg-[#F1F5F9] antialiased">
      <Navbar onSearch={setSearchTerm} searchValue={searchTerm} />
      <HeroSection totalProducts={allProducts.length} />
      <CategoryNav categories={categories} activeSlug={null} />

      {/* ────────── Widget de Busca Instagram ────────── */}
      {showIgWidget && (
        <div style={{
          background: 'linear-gradient(135deg, #833ab4 0%, #fd1d1d 50%, #fcb045 100%)',
          padding: '20px 16px',
        }}>
          <div style={{ maxWidth: '640px', margin: '0 auto' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                </svg>
                <div>
                  <p style={{ color: 'white', fontWeight: '800', fontSize: '14px', lineHeight: 1 }}>Veio pelo Instagram?</p>
                  <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '12px', marginTop: '2px' }}>Digite o código do post para encontrar a oferta</p>
                </div>
              </div>
              <button onClick={() => setShowIgWidget(false)}
                style={{ color: 'rgba(255,255,255,0.7)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}>
                ✕
              </button>
            </div>

            {/* Barra de busca */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#fcb045', fontWeight: '900', fontSize: '18px', pointerEvents: 'none' }}>#</span>
                <input
                  type="number" min="1"
                  value={igCode}
                  onChange={(e) => setIgCode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleIgSearch()}
                  placeholder="Ex: 42"
                  id="ig-code-search-home"
                  style={{
                    width: '100%', height: '48px',
                    paddingLeft: '32px', paddingRight: '12px',
                    fontSize: '16px', fontWeight: '700',
                    background: 'rgba(255,255,255,0.15)',
                    border: '2px solid rgba(255,255,255,0.4)',
                    borderRadius: '14px', color: 'white',
                    outline: 'none',
                  }}
                />
              </div>
              <button
                onClick={() => handleIgSearch()}
                disabled={!igCode || igStatus === 'loading'}
                id="ig-search-home-btn"
                style={{
                  height: '48px', padding: '0 20px',
                  background: 'white', borderRadius: '14px',
                  border: 'none', cursor: 'pointer',
                  fontWeight: '800', fontSize: '14px', color: '#833ab4',
                  whiteSpace: 'nowrap',
                  opacity: !igCode || igStatus === 'loading' ? 0.6 : 1,
                }}>
                {igStatus === 'loading' ? '🔍...' : 'Buscar'}
              </button>
            </div>

            {/* Resultado */}
            {igStatus === 'not-found' && (
              <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '13px', marginTop: '10px', textAlign: 'center' }}>
                😕 Código <strong>#{igCode}</strong> não encontrado. Verifique o número no post.
              </p>
            )}

            {igStatus === 'found' && igProduct && (
              <div style={{
                marginTop: '12px', background: 'white', borderRadius: '16px',
                overflow: 'hidden', display: 'flex', gap: '0', alignItems: 'stretch',
                boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
              }}>
                {/* Imagem */}
                {igProduct.image_url && (
                  <div style={{ width: '90px', minWidth: '90px', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px' }}>
                    <img src={igProduct.image_url} alt={igProduct.title}
                      style={{ maxWidth: '100%', maxHeight: '80px', objectFit: 'contain' }} />
                  </div>
                )}
                {/* Info */}
                <div style={{ flex: 1, padding: '10px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0 }}>
                  <div>
                    <span style={{ background: '#FFF159', color: '#0F172A', fontSize: '10px', fontWeight: '800', padding: '2px 7px', borderRadius: '6px' }}>#{igProduct.codigo_identificador}</span>
                    <p style={{ fontSize: '12px', fontWeight: '600', color: '#0F172A', lineHeight: 1.3, marginTop: '4px',
                      overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {igProduct.title}
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px', gap: '8px' }}>
                    <span style={{ fontSize: '15px', fontWeight: '900', color: '#0F172A' }}>
                      {Number(igProduct.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                    <a href={igProduct.affiliate_link} target="_blank" rel="noopener noreferrer"
                      id={`ig-home-cta-${igProduct.codigo_identificador}`}
                      style={{
                        background: '#FFF159', color: '#0F172A',
                        textDecoration: 'none', padding: '6px 12px',
                        borderRadius: '10px', fontWeight: '800', fontSize: '12px',
                        whiteSpace: 'nowrap',
                      }}>
                      Ver Desconto →
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {/* ────────────────────────────────────────────────── */}

      {/* Barra de filtros */}
      <div style={{ width: '100%', background: 'white', borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 16px' }}>

          {isMobile ? (
            /* ── Mobile: 2 dropdowns em linha ── */
            <div style={{ padding: '10px 0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* Linha 1: ordenação + desconto */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {/* Sort */}
                <div style={{ position: 'relative', flex: 1 }}>
                  <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} id="home-sort"
                    style={{ width: '100%', height: '44px', paddingLeft: '12px', paddingRight: '32px', fontSize: '13px', fontWeight: '700', background: 'white', border: '2px solid #e2e8f0', borderRadius: '12px', color: '#1e293b', cursor: 'pointer', appearance: 'none', outline: 'none' }}>
                    {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <div style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#94a3b8' }}>
                    <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>
                  </div>
                </div>
                {/* Desconto */}
                <div style={{ position: 'relative', flex: 1 }}>
                  <select value={minDiscount} onChange={(e) => setMinDiscount(Number(e.target.value))} id="home-discount-mobile"
                    style={{ width: '100%', height: '44px', paddingLeft: '12px', paddingRight: '32px', fontSize: '13px', fontWeight: '700', background: 'white', border: '2px solid #e2e8f0', borderRadius: '12px', color: '#1e293b', cursor: 'pointer', appearance: 'none', outline: 'none' }}>
                    {DISCOUNT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <div style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#94a3b8' }}>
                    <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>
                  </div>
                </div>
              </div>
              {/* Linha 2: plataforma + contagem + limpar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                {[
                  { v: 'all',          label: 'Todos' },
                  { v: 'mercadolivre', label: '🛒 Meli' },
                  { v: 'shopee',       label: '🛍️ Shopee' },
                ].map(({ v, label }) => (
                  <button key={v} onClick={() => setActivePlatform(v)} id={`platform-filter-mobile-${v}`}
                    style={{
                      height: '32px', padding: '0 10px',
                      background: activePlatform === v
                        ? (v === 'shopee' ? '#EE4D2D' : v === 'mercadolivre' ? '#FFF159' : '#0F172A')
                        : 'white',
                      color: activePlatform === v
                        ? (v === 'mercadolivre' ? '#0F172A' : 'white')
                        : '#64748B',
                      border: activePlatform === v ? '1px solid transparent' : '2px solid #e2e8f0',
                      borderRadius: '10px', fontSize: '12px', fontWeight: '700', cursor: 'pointer',
                    }}>
                    {label}
                  </button>
                ))}
                {hasFilters && (
                  <button onClick={() => { setSearchTerm(''); setMinDiscount(0); setActiveCategory('all'); setActivePlatform('all'); }}
                    style={{ fontSize: '12px', fontWeight: '700', color: '#FF5A00', background: 'none', border: 'none', cursor: 'pointer', marginLeft: 'auto' }}>
                    ✕ Limpar
                  </button>
                )}
                <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '600', marginLeft: 'auto' }}>
                  {!loading ? `${filtered.length} ofertas` : '…'}
                </span>
              </div>
            </div>
          ) : (
            /* ── Desktop: sort + desconto + plataforma ── */
            <div className="py-3 flex flex-wrap items-center gap-3">
              {/* Ordenação */}
              <div className="relative">
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} id="home-sort"
                  className="appearance-none pl-3 pr-7 h-9 text-xs font-bold bg-white border border-slate-200 rounded-xl text-slate-700 cursor-pointer focus:outline-none focus:border-[#FF5A00] transition-all">
                  {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <span className="absolute right-2.5 top-3 text-[8px] text-slate-400 pointer-events-none">▼</span>
              </div>
              {/* Pills desconto */}
              <div className="flex items-center gap-1.5">
                {DISCOUNT_OPTIONS.map((o) => (
                  <button key={o.value} onClick={() => setMinDiscount(o.value)} id={`discount-filter-${o.value}`}
                    className={`filter-pill ${minDiscount === o.value ? 'active' : ''}`}>
                    {o.label}
                  </button>
                ))}
              </div>
              {/* Separador */}
              <div className="w-px h-5 bg-slate-200" />
              {/* Filtro por plataforma */}
              <div className="flex items-center gap-1.5">
                {[
                  { v: 'all',          label: 'Todos',           count: allProducts.length },
                  { v: 'mercadolivre', label: '🛒 Mercado Livre', count: countMeli },
                  { v: 'shopee',       label: '🛍️ Shopee',        count: countShopee },
                ].map(({ v, label, count }) => (
                  <button key={v} onClick={() => setActivePlatform(v)} id={`platform-filter-${v}`}
                    style={activePlatform === v ? {
                      background: v === 'shopee' ? '#EE4D2D' : v === 'mercadolivre' ? '#FFF159' : '#0F172A',
                      color:      v === 'mercadolivre' ? '#0F172A' : 'white',
                      border:     '1px solid transparent',
                    } : {}}
                    className={`filter-pill ${activePlatform === v ? '' : ''}`}>
                    {label} <span style={{ opacity: 0.7, fontSize: '10px', marginLeft: '2px' }}>({count})</span>
                  </button>
                ))}
              </div>
              {hasFilters && (
                <button onClick={() => { setSearchTerm(''); setMinDiscount(0); setActiveCategory('all'); setActivePlatform('all'); }}
                  className="ml-auto text-xs font-bold text-slate-500 hover:text-[#FF5A00] transition-colors">
                  ✕ Limpar filtros
                </button>
              )}
              <span className="text-[11px] text-slate-400 font-semibold ml-auto">
                {!loading ? `${filtered.length} ofertas` : '…'}
              </span>
            </div>
          )}


        </div>
      </div>

      {/* Conteúdo principal */}
      <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '32px 24px' }} className="space-y-10">

        {/* Maiores descontos — só aparece na home sem filtros ativos */}
        {!hasFilters && !loading && topDeals.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-extrabold text-[#0F172A] flex items-center gap-2 uppercase tracking-wider">
                <span className="w-1 h-5 bg-[#FF5A00] rounded-full" />
                🔥 Maiores Descontos (25%+ OFF)
              </h2>
            </div>
            <div className="bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-100 rounded-2xl p-5">
              <ProductGrid products={topDeals} loading={loading} skeletonCount={4} />
            </div>
          </section>
        )}

        {/* Categoria sections */}
        {loading ? (
          <section>
            <div className="h-7 w-48 bg-slate-200 rounded-lg animate-pulse mb-4" />
            <ProductGrid products={[]} loading={true} skeletonCount={8} />
          </section>
        ) : byCategory.length === 0 ? (
          <div className="bg-white rounded-2xl p-16 text-center text-slate-400 shadow-sm">
            <div className="text-5xl mb-4">🔍</div>
            <p className="font-semibold text-sm">Nenhum produto encontrado com os filtros selecionados.</p>
            <button
              onClick={() => { setSearchTerm(''); setMinDiscount(0); setActiveCategory('all'); }}
              className="mt-4 px-5 py-2 bg-[#FF5A00] text-white text-xs font-bold rounded-xl"
            >
              Limpar filtros
            </button>
          </div>
        ) : (
          byCategory.map(({ cat, groups, total }) => (
            <section key={cat.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
              {/* Header da categoria */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-50">
                <h2 className="text-sm font-extrabold text-[#0F172A] flex items-center gap-2 uppercase tracking-wide">
                  <span className="text-base">{CAT_EMOJI[cat.slug] ?? '📦'}</span>
                  {cat.name}
                  <span className="text-xs font-normal text-slate-400 normal-case tracking-normal">
                    {total} oferta{total !== 1 ? 's' : ''}
                  </span>
                </h2>
                <Link
                  href={`/category/${cat.slug}/`}
                  className="text-xs font-bold text-[#FF5A00] hover:underline flex items-center gap-1"
                >
                  Ver todas →
                </Link>
              </div>

              {/* Produtos da categoria — limitados por padrão */}
              {(() => {
                // Junta todos os produtos da categoria em uma lista ordenada
                const allCatProds = groups.flatMap(([, prods]) => sortList(prods));
                const isExpanded  = !!expandedCats[cat.id];
                const visible     = isExpanded ? allCatProds : allCatProds.slice(0, PREVIEW_COUNT);
                const hasMore     = allCatProds.length > PREVIEW_COUNT;

                return (
                  <div className="p-5">
                    <ProductGrid products={visible} loading={false} skeletonCount={4} />

                    {hasMore && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '18px' }}>
                        <button
                          onClick={() => toggleCat(cat.id)}
                          id={`expand-cat-${cat.slug}`}
                          style={{
                            flex: 1,
                            height: '42px',
                            background: isExpanded ? '#F1F5F9' : 'linear-gradient(135deg,#FF5A00,#FF8C00)',
                            color: isExpanded ? '#64748b' : 'white',
                            border: 'none',
                            borderRadius: '12px',
                            fontWeight: '800',
                            fontSize: '13px',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                          }}
                        >
                          {isExpanded
                            ? `▲ Mostrar menos`
                            : `▼ Ver mais ${allCatProds.length - PREVIEW_COUNT} produto${allCatProds.length - PREVIEW_COUNT !== 1 ? 's' : ''}`
                          }
                        </button>
                        {!isExpanded && (
                          <Link
                            href={`/category/${cat.slug}/`}
                            id={`see-all-cat-${cat.slug}`}
                            style={{
                              height: '42px',
                              padding: '0 16px',
                              background: 'white',
                              border: '2px solid #FF5A00',
                              borderRadius: '12px',
                              color: '#FF5A00',
                              fontWeight: '800',
                              fontSize: '13px',
                              textDecoration: 'none',
                              display: 'flex',
                              alignItems: 'center',
                              whiteSpace: 'nowrap',
                              transition: 'all 0.2s',
                            }}
                          >
                            Ver página →
                          </Link>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </section>
          ))
        )}
      </main>

      <Footer />
    </div>
  );
}
