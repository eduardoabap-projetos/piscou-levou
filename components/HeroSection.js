'use client';

export default function HeroSection({ totalProducts = 0 }) {
  return (
    <section style={{ width: '100%' }} className="bg-gradient-to-br from-[#0F172A] via-[#1E293B] to-[#0F172A] py-6 px-4 sm:py-8 sm:px-6">
      <div style={{ maxWidth: '1280px', margin: '0 auto' }}
           className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="text-center sm:text-left">
          <h1 className="font-extrabold text-xl sm:text-3xl text-white leading-tight mb-1">
            Achados com Desconto Real —{' '}
            <span className="text-[#FFF159]">Meli</span>
            {' '}&{' '}
            <span className="text-[#EE4D2D]">Shopee</span>
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            {totalProducts > 0
              ? <><span className="text-white font-bold">{totalProducts}</span> ofertas ativas agora • Atualizado a cada 30 min</>
              : 'Ofertas monitoradas em tempo real • Atualizado a cada 30 min'}
          </p>
        </div>
        {/* Badges — só desktop */}
        <div className="hidden sm:flex flex-wrap justify-end gap-2 flex-shrink-0">
          {[
            { icon: '✅', text: 'Preços verificados via API'   },
            { icon: '🛒', text: 'Mercado Livre + Shopee'      },
            { icon: '⚡', text: 'Atualização automática'      },
          ].map((b) => (
            <div key={b.text} className="flex items-center gap-1.5 bg-white/10 border border-white/20 text-white text-[11px] font-semibold px-3 py-1.5 rounded-full">
              <span>{b.icon}</span> {b.text}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
