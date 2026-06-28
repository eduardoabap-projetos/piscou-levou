'use client';

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-dark-bg flex items-center justify-center px-4">
      {/* Ambient */}
      <div
        className="hero-ambient w-64 h-64 bg-brand-orange/10"
        style={{ top: '20%', left: '10%' }}
      />

      <div className="text-center relative z-10">
        <div
          className="font-heading font-black text-gradient-brand mb-4"
          style={{ fontSize: 'clamp(5rem, 15vw, 10rem)', lineHeight: 1 }}
        >
          404
        </div>

        <h1 className="font-heading font-bold text-2xl text-text-primary mb-3">
          Oferta não encontrada 😔
        </h1>

        <p className="text-text-muted max-w-md mx-auto mb-8 text-base leading-relaxed">
          Parece que essa oferta <strong className="text-brand-orange">piscou e levou</strong>{' '}
          antes de você chegar. Mas temos muitas outras esperando por você!
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/"
            id="404-home-btn"
            className="btn-primary inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm"
          >
            🏠 Voltar para Home
          </Link>
          <a
            href="/#ofertas"
            id="404-offers-btn"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-dark-card border border-dark-border text-text-secondary hover:text-white hover:border-brand-orange/50 transition-all font-semibold text-sm"
          >
            🔥 Ver Todas as Ofertas
          </a>
        </div>
      </div>
    </div>
  );
}
