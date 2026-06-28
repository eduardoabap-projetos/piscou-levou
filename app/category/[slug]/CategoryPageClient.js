'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams }  from 'next/navigation';
import Navbar         from '../../../components/Navbar';
import CategoryNav    from '../../../components/CategoryNav';
import ProductGrid    from '../../../components/ProductGrid';
import Footer         from '../../../components/Footer';
import { supabase }   from '../../../lib/supabaseClient';
import Link           from 'next/link';

const SORT_OPTIONS = [
  { value: 'relevantes',    label: '⭐ Relevância'     },
  { value: 'maior_desconto',label: '🔥 Maior Desconto' },
  { value: 'menor_preco',   label: '💰 Menor Preço'    },
  { value: 'maior_preco',   label: '📈 Maior Preço'    },
];

export default function CategoryPageClient() {
  const params  = useParams();
  const rawSlug = params?.slug;
  const slug    = rawSlug ? decodeURIComponent(rawSlug).replace(/\/$/, '').toLowerCase() : '';

  const [category,   setCategory]   = useState(null);
  const [products,   setProducts]   = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [notFound,   setNotFound]   = useState(false);

  // Filtros
  const [searchTerm,  setSearchTerm]  = useState('');
  const [sortBy,      setSortBy]      = useState('relevantes');
  const [minDiscount, setMinDiscount] = useState(0);
  const [priceMax,    setPriceMax]    = useState(10000);
  const [priceMin,    setPriceMin]    = useState(0);
  const [sliderMax,   setSliderMax]   = useState(10000);
  const [sliderMin,   setSliderMin]   = useState(0);
  const [activeSubcats, setActiveSubcats] = useState(new Set()); // subcategorias selecionadas
  const [showBestSellers, setShowBestSellers] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false); // mobile

  useEffect(() => {
    if (!slug || slug === '_placeholder') return;
    async function fetchData() {
      setLoading(true);
      setNotFound(false);

      const { data: cats } = await supabase.from('categories').select('id, name, slug').order('name');
      if (cats) setCategories(cats);

      const { data: catData, error: catError } = await supabase
        .from('categories').select('id, name, slug').eq('slug', slug).single();
      if (catError || !catData) { setNotFound(true); setLoading(false); return; }
      setCategory(catData);

      const { data: prods } = await supabase
        .from('products')
        .select('id, meli_item_id, title, slug, price, original_price, discount_pct, image_url, affiliate_link, is_best_seller, is_highlight, category_id, subcategory_name, platform')
        .eq('status', 'active')
        .eq('category_id', catData.id);

      if (prods && prods.length > 0) {
        setProducts(prods);
        const prices  = prods.map((p) => p.price);
        const minP    = Math.floor(Math.min(...prices));
        const maxP    = Math.ceil(Math.max(...prices));
        setSliderMin(minP); setSliderMax(maxP);
        setPriceMin(minP);  setPriceMax(maxP);
      }
      setLoading(false);
    }
    fetchData();
  }, [slug]);

  useEffect(() => {
    if (category) {
      document.title = `${category.name} com Desconto — Meli & Shopee | PiscouLevou`;
      let metaDesc = document.querySelector('meta[name="description"]');
      if (!metaDesc) { metaDesc = document.createElement('meta'); metaDesc.setAttribute('name', 'description'); document.head.appendChild(metaDesc); }
      metaDesc.setAttribute('content', `As melhores ofertas de ${category.name} do Mercado Livre e Shopee com desconto real. Atualização automática. Piscou, Levou!`);
    }
  }, [category]);

  const formatBRL = (v) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);

  // Subcategorias únicas
  const subcatOptions = useMemo(() =>
    Array.from(new Set(products.map((p) => p.subcategory_name).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  , [products]);

  const toggleSubcat = (name) => {
    setActiveSubcats((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  // Ordenação
  const sortList = (list) => [...list].sort((a, b) => {
    const dA = a.original_price && a.original_price > a.price ? ((a.original_price - a.price) / a.original_price) * 100 : 0;
    const dB = b.original_price && b.original_price > b.price ? ((b.original_price - b.price) / b.original_price) * 100 : 0;
    if (sortBy === 'menor_preco')    return a.price - b.price;
    if (sortBy === 'maior_preco')    return b.price - a.price;
    if (sortBy === 'maior_desconto') return dB - dA;
    if (a.is_best_seller && !b.is_best_seller) return -1;
    if (!a.is_best_seller && b.is_best_seller) return 1;
    return dB - dA;
  });

  // Filtro completo
  const filtered = useMemo(() => {
    return products.filter((p) => {
      const disc = p.original_price && p.original_price > p.price ? ((p.original_price - p.price) / p.original_price) * 100 : 0;
      return (
        (!searchTerm   || p.title.toLowerCase().includes(searchTerm.toLowerCase())) &&
        disc >= minDiscount &&
        p.price >= priceMin && p.price <= priceMax &&
        (activeSubcats.size === 0 || activeSubcats.has(p.subcategory_name)) &&
        (!showBestSellers || p.is_best_seller)
      );
    });
  }, [products, searchTerm, minDiscount, priceMin, priceMax, activeSubcats, showBestSellers]);

  // Agrupado por subcategoria
  const grouped = useMemo(() => {
    const map = new Map();
    for (const p of filtered) {
      const key = p.subcategory_name ?? null;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    }
    return Array.from(map.entries()).sort(([a], [b]) => { if (!a) return 1; if (!b) return -1; return a.localeCompare(b, 'pt-BR'); });
  }, [filtered]);

  const hasFilters = searchTerm || minDiscount > 0 || priceMin > sliderMin || priceMax < sliderMax || activeSubcats.size > 0 || showBestSellers;

  const clearFilters = () => {
    setSearchTerm(''); setMinDiscount(0); setPriceMin(sliderMin); setPriceMax(sliderMax);
    setActiveSubcats(new Set()); setShowBestSellers(false);
  };

  if (notFound) {
    return (
      <>
        <Navbar />
        <div className="min-h-screen flex items-center justify-center text-center px-4">
          <div>
            <div className="text-7xl mb-6">🔍</div>
            <h1 className="font-bold text-3xl text-slate-900 mb-3">Categoria não encontrada</h1>
            <p className="text-slate-500 mb-8">A categoria <strong className="text-[#FF5A00]">{slug}</strong> não existe.</p>
            <Link href="/" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold bg-[#0F172A] text-white">← Voltar para Home</Link>
          </div>
        </div>
        <Footer />
      </>
    );
  }

  return (
    <div className="w-full min-h-screen bg-[#F1F5F9] antialiased">
      <Navbar onSearch={setSearchTerm} searchValue={searchTerm} />

      {/* Category Header */}
      <div style={{ width: '100%' }} className="bg-gradient-to-r from-[#0F172A] to-[#1E293B] py-6 px-6">
        <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
          <nav className="flex items-center gap-2 text-xs text-slate-400 mb-2">
            <Link href="/" className="hover:text-white transition-colors">Início</Link>
            <span>/</span>
            <span className="text-white font-semibold">{loading ? '...' : category?.name}</span>
          </nav>
          <h1 className="font-extrabold text-2xl sm:text-3xl text-white mb-1">
            {loading ? '...' : <>Ofertas de <span className="text-[#FFF159]">{category?.name}</span></>}
          </h1>
          <p className="text-slate-400 text-sm">
            As melhores ofertas com desconto real, atualizadas automaticamente
          </p>
        </div>
      </div>

      <CategoryNav categories={categories} activeSlug={slug} />

      {/* Main layout */}
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '32px 24px' }}
           className="flex gap-6 items-start">

        {/* ── Sidebar de filtros ─────────────────────────────────────── */}
        <aside className={`
          ${sidebarOpen ? 'fixed inset-0 z-50 flex' : 'hidden'}
          lg:flex lg:static lg:z-auto lg:inset-auto
          flex-col w-72 flex-shrink-0
        `}>
          {/* Overlay mobile */}
          {sidebarOpen && (
            <div className="absolute inset-0 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
          )}

          <div className="relative z-10 w-72 bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-6 lg:sticky lg:top-24 max-h-[calc(100vh-7rem)] overflow-y-auto">
            {/* Header sidebar */}
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-black text-[#0F172A] uppercase tracking-widest">🎛️ Filtros</h2>
              {hasFilters && (
                <button onClick={clearFilters} className="text-[10px] font-bold text-[#FF5A00] hover:underline">
                  Limpar tudo
                </button>
              )}
            </div>

            {/* Busca */}
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Palavra-chave</label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar nesta categoria..."
                className="w-full h-10 px-3.5 text-sm bg-[#F8FAFC] border border-slate-200 rounded-xl focus:outline-none focus:border-[#FF5A00] focus:ring-2 focus:ring-[#FF5A00]/20 transition-all placeholder-slate-400"
              />
            </div>

            {/* Ordenação */}
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Ordenar por</label>
              <div className="space-y-1">
                {SORT_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => setSortBy(o.value)}
                    className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                      sortBy === o.value ? 'bg-[#0F172A] text-white' : 'text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Faixa de preço */}
            {sliderMax > sliderMin && (
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-3">Faixa de Preço</label>
                <div className="flex justify-between text-xs font-bold text-[#FF5A00] mb-2">
                  <span>{formatBRL(priceMin)}</span>
                  <span>{formatBRL(priceMax)}</span>
                </div>
                <input
                  type="range"
                  min={sliderMin} max={sliderMax} step={10}
                  value={priceMin}
                  onChange={(e) => setPriceMin(Math.min(Number(e.target.value), priceMax - 10))}
                  className="range-slider w-full mb-2"
                  id="price-slider-min"
                />
                <input
                  type="range"
                  min={sliderMin} max={sliderMax} step={10}
                  value={priceMax}
                  onChange={(e) => setPriceMax(Math.max(Number(e.target.value), priceMin + 10))}
                  className="range-slider w-full"
                  id="price-slider-max"
                />
              </div>
            )}

            {/* Desconto mínimo */}
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Desconto mínimo</label>
              <div className="grid grid-cols-2 gap-1.5">
                {[0, 10, 20, 30].map((v) => (
                  <button
                    key={v}
                    onClick={() => setMinDiscount(v)}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                      minDiscount === v
                        ? 'bg-[#FF5A00] text-white border-[#FF5A00]'
                        : 'bg-white text-slate-500 border-slate-200 hover:border-[#FF5A00] hover:text-[#FF5A00]'
                    }`}
                  >
                    {v === 0 ? 'Qualquer' : `${v}%+`}
                  </button>
                ))}
              </div>
            </div>

            {/* Subcategorias */}
            {subcatOptions.length > 0 && (
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Subcategoria</label>
                <div className="space-y-1.5">
                  {subcatOptions.map((name) => {
                    const count   = products.filter((p) => p.subcategory_name === name).length;
                    const checked = activeSubcats.has(name);
                    return (
                      <label key={name} className="flex items-center gap-2.5 cursor-pointer group">
                        <div
                          onClick={() => toggleSubcat(name)}
                          className={`w-4 h-4 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                            checked ? 'bg-[#FF5A00] border-[#FF5A00]' : 'border-slate-300 group-hover:border-[#FF5A00]'
                          }`}
                        >
                          {checked && (
                            <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                              <path d="M1.5 4.5L3.5 6.5L7.5 2.5" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
                            </svg>
                          )}
                        </div>
                        <span className="text-xs font-medium text-slate-600 group-hover:text-[#0F172A] flex-1 truncate" onClick={() => toggleSubcat(name)}>{name}</span>
                        <span className="text-[10px] text-slate-400 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded-full">{count}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Mais vendidos */}
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                onClick={() => setShowBestSellers(!showBestSellers)}
                className={`w-9 h-5 rounded-full transition-colors flex items-center px-0.5 ${showBestSellers ? 'bg-[#FF5A00]' : 'bg-slate-200'}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${showBestSellers ? 'translate-x-4' : 'translate-x-0'}`} />
              </div>
              <span className="text-xs font-bold text-slate-600">🏆 Somente Mais Vendidos</span>
            </label>
          </div>
        </aside>

        {/* ── Área de produtos ──────────────────────────────────────── */}
        <div className="flex-1 min-w-0">

          {/* Barra de info + sort + mobile filter btn */}
          <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <button
                className="lg:hidden flex items-center gap-1.5 h-9 px-3.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 shadow-sm"
                onClick={() => setSidebarOpen(true)}
              >
                🎛️ Filtros
              </button>
              <span className="text-sm font-bold text-[#0F172A]">
                {!loading ? `${filtered.length} produto${filtered.length !== 1 ? 's' : ''}` : 'Carregando...'}
              </span>
              {hasFilters && (
                <button onClick={clearFilters} className="text-xs font-bold text-[#FF5A00] hover:underline">
                  Limpar filtros
                </button>
              )}
            </div>

            {/* Sort rápido */}
            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="appearance-none pl-3 pr-8 h-9 text-xs font-bold bg-white border border-slate-200 rounded-xl text-slate-700 cursor-pointer focus:outline-none focus:border-[#FF5A00] transition-all shadow-sm"
              >
                {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <span className="absolute right-3 top-3 text-[8px] text-slate-400 pointer-events-none">▼</span>
            </div>
          </div>

          {/* Skeleton */}
          {loading && <ProductGrid products={[]} loading={true} skeletonCount={12} />}

          {/* Grupos por subcategoria */}
          {!loading && (
            <div className="space-y-8">
              {grouped.length === 0 ? (
                <div className="bg-white rounded-2xl p-16 text-center text-slate-400 shadow-sm">
                  <div className="text-5xl mb-4">🔍</div>
                  <p className="font-semibold text-sm">Nenhum produto com os filtros aplicados.</p>
                  <button onClick={clearFilters} className="mt-4 px-5 py-2 bg-[#FF5A00] text-white text-xs font-bold rounded-xl">
                    Limpar filtros
                  </button>
                </div>
              ) : (
                grouped.map(([subcatName, subcatProds], idx) => {
                  const sorted  = sortList(subcatProds);
                  const isNamed = subcatName !== null;
                  const label   = subcatName ?? 'Catálogo Geral';

                  return (
                    <section
                      key={label}
                      className="rounded-2xl overflow-hidden shadow-sm border border-slate-200"
                      style={{ marginTop: idx > 0 ? '20px' : '0' }}
                    >
                      {/* ── Header da subcategoria ── */}
                      <div className={`px-6 py-4 flex items-center justify-between ${
                        isNamed ? 'bg-[#0F172A]' : 'bg-slate-700'
                      }`}>
                        <div className="flex items-center gap-3">
                          <span className="w-2 h-6 bg-[#FF5A00] rounded-full flex-shrink-0" />
                          <h3 className="text-white font-black text-sm uppercase tracking-wider">
                            {label}
                          </h3>
                        </div>
                        <span className="text-slate-400 text-xs font-semibold flex-shrink-0">
                          {sorted.length} produto{sorted.length !== 1 ? 's' : ''}
                        </span>
                      </div>

                      {/* ── Produtos ── */}
                      <div className="bg-white p-5">
                        <ProductGrid products={sorted} loading={false} skeletonCount={4} emptyMessage="Nenhum produto." />
                      </div>
                    </section>
                  );
                })
              )}
            </div>
          )}

          {/* Rodapé de resultados */}
          {!loading && filtered.length > 0 && (
            <p className="text-center mt-8 text-xs text-slate-400 font-semibold">
              Mostrando {filtered.length} oferta{filtered.length !== 1 ? 's' : ''} em {category?.name}.
            </p>
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
}
