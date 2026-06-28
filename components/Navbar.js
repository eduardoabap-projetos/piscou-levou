'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

/* ─── Logo SVG fiel ao design do usuário ─────────────────────────────────────
   Oval com anel branco + anel amarelo + centro navy + etiqueta + raio
   Texto "piscou" navy / "levou" laranja — formato horizontal igual ao ML
────────────────────────────────────────────────────────────────────────────── */
function PiscouLevouLogo() {
  return (
    <svg
      width="210"
      height="64"
      viewBox="0 0 210 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="PiscouLevou"
    >
      {/* ── Linhas de velocidade ── */}
      <line x1="22" y1="20" x2="4"  y2="20" stroke="#162050" strokeWidth="3.2" strokeLinecap="round"/>
      <line x1="22" y1="30" x2="8"  y2="30" stroke="#162050" strokeWidth="3.2" strokeLinecap="round"/>
      <line x1="22" y1="40" x2="12" y2="40" stroke="#162050" strokeWidth="3.2" strokeLinecap="round"/>

      {/* ── Oval: anel branco externo ── */}
      <ellipse cx="65" cy="32" rx="40" ry="29" fill="white"/>

      {/* ── Oval: anel amarelo ── */}
      <ellipse cx="65" cy="32" rx="36" ry="25" fill="#FFD000"/>

      {/* ── Oval: centro navy ── */}
      <ellipse cx="65" cy="32" rx="30" ry="19" fill="#162050"/>

      {/* ── Etiqueta de preço rotacionada ── */}
      <g transform="translate(65,32) rotate(-18)">
        <rect x="-13" y="-18" width="23" height="32" rx="5" fill="#0D1B3E"/>
        {/* Buraco da etiqueta */}
        <circle cx="5" cy="-12" r="3" fill="#FFD000"/>
        {/* Raio elétrico branco */}
        <path
          d="M3 -8 L-5 6 L1 6 L-1 16 L8 0 L2 0 L6 -8 Z"
          fill="white"
        />
      </g>

      {/* ── Texto: piscou (navy) ── */}
      <text
        x="112" y="26"
        fontFamily="'Arial Rounded MT Bold', 'Nunito Black', 'Helvetica Neue', Arial, sans-serif"
        fontSize="26" fontWeight="900"
        fill="#162050"
        letterSpacing="-0.5"
      >
        piscou
      </text>

      {/* ── Texto: levou (laranja) ── */}
      <text
        x="112" y="54"
        fontFamily="'Arial Rounded MT Bold', 'Nunito Black', 'Helvetica Neue', Arial, sans-serif"
        fontSize="26" fontWeight="900"
        fill="#E84600"
        letterSpacing="-0.5"
      >
        levou
      </text>
    </svg>
  );
}

export default function Navbar({ onSearch, searchValue = '' }) {
  const [query,      setQuery]      = useState(searchValue);
  const [lastSync,   setLastSync]   = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    async function fetchLastSync() {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const sb = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        );
        const { data } = await sb
          .from('products').select('updated_at').eq('status', 'active')
          .order('updated_at', { ascending: false }).limit(1).single();
        if (data?.updated_at) {
          const mins = Math.round((Date.now() - new Date(data.updated_at).getTime()) / 60000);
          setLastSync(mins <= 1 ? 'agora' : `${mins} min atrás`);
        }
      } catch {}
    }
    fetchLastSync();
  }, []);

  const handleSearch = (e) => { e.preventDefault(); onSearch?.(query); };

  return (
    <nav style={{ width: '100%' }} className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
      <div
        style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 24px' }}
        className="h-[70px] flex items-center gap-6"
      >
        {/* Logo com fundo transparente */}
        <Link href="/" id="nav-logo" className="flex-shrink-0 group">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="PiscouLevou — Melhores Ofertas do Mercado Livre e Shopee"
            className="h-[54px] w-auto object-contain transition-transform duration-200 group-hover:scale-105"
          />
        </Link>

        {/* Busca */}
        <form onSubmit={handleSearch} className="flex-1 max-w-2xl hidden sm:flex">
          <div className="relative w-full">
            <input
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); onSearch?.(e.target.value); }}
              placeholder="Buscar produtos com desconto..."
              id="navbar-search"
              aria-label="Buscar produtos"
              className="w-full h-11 pl-5 pr-14 text-sm bg-[#F8FAFC] border border-slate-200 rounded-2xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#FF5A00] focus:ring-2 focus:ring-[#FF5A00]/20 transition-all"
            />
            <button type="submit"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-xl bg-[#FF5A00] hover:bg-[#e04e00] transition-colors"
              aria-label="Buscar">
              <svg width="15" height="15" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
            </button>
          </div>
        </form>

        {/* Direita */}
        <div className="flex items-center gap-3 ml-auto flex-shrink-0">
          {lastSync && (
            <div className="hidden md:flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-full whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Atualizado {lastSync}
            </div>
          )}
          <Link href="/"
            className="hidden sm:inline-flex items-center bg-[#0F172A] hover:bg-slate-800 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition-all h-10 whitespace-nowrap shadow-sm">
            Início
          </Link>
          <button className="sm:hidden flex items-center justify-center w-10 h-10 rounded-xl border border-slate-200 text-slate-600"
            onClick={() => setMobileOpen(!mobileOpen)} aria-label="Buscar">
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="sm:hidden px-6 pb-3 bg-white">
          <form onSubmit={handleSearch} className="flex gap-2">
            <input type="text" value={query}
              onChange={(e) => { setQuery(e.target.value); onSearch?.(e.target.value); }}
              placeholder="Buscar produtos..."
              className="flex-1 h-11 px-4 text-sm bg-[#F8FAFC] border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#FF5A00] transition-all"
              autoFocus />
            <button type="submit" className="h-11 px-5 bg-[#FF5A00] text-white text-sm font-black rounded-xl">Buscar</button>
          </form>
        </div>
      )}
    </nav>
  );
}
