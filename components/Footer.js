'use client';

import Link from 'next/link';

export default function Footer() {
  return (
    <footer style={{ width: '100%' }} className="bg-[#0F172A] text-slate-400 mt-12">

      {/* Trust bar */}
      <div style={{ width: '100%' }} className="border-b border-white/5">
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 24px' }}
             className="py-5 flex flex-wrap justify-center gap-6">
          {[
            { icon: '🔒', title: 'Site Seguro',              sub: 'Conexão HTTPS criptografada'  },
            { icon: '✅', title: 'Preços Verificados',       sub: 'Sincronizados via API do ML'  },
            { icon: '🤝', title: 'Afiliado Oficial',         sub: 'Participante do ML Afiliados' },
            { icon: '⚡', title: 'Atualização a cada 30min', sub: 'Ofertas sempre recentes'      },
          ].map((item) => (
            <div key={item.title} className="flex items-center gap-3">
              <span className="text-2xl">{item.icon}</span>
              <div>
                <p className="text-white text-xs font-bold">{item.title}</p>
                <p className="text-slate-500 text-[11px]">{item.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main */}
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '40px 24px' }}
           className="grid grid-cols-1 sm:grid-cols-3 gap-8">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-[#FFF159] flex items-center justify-center text-sm font-black text-[#0F172A]">⚡</div>
            <span className="font-extrabold text-base text-white uppercase tracking-tight">Piscou<span className="text-[#FF5A00]">Levou</span></span>
          </div>
          <p className="text-[12px] leading-relaxed text-slate-500">
            Monitoramos produtos altamente avaliados do Mercado Livre e notificamos quando os preços caem. Garanta o desconto antes que acabe!
          </p>
        </div>
        <div>
          <h3 className="text-white text-xs font-bold uppercase tracking-wider mb-3">Categorias</h3>
          <div className="flex flex-col gap-2">
            {[
              { label: '🔧 Ferramentas',      href: '/category/ferramentas/'              },
              { label: '🏠 Casa e Decoração', href: '/category/casa-e-organizacao/'       },
              { label: '📺 Eletrônicos',      href: '/category/eletronicos-e-tecnologia/' },
              { label: '💄 Beleza',           href: '/category/cuidados-pessoais/'        },
              { label: '🏠 Eletrodomésticos', href: '/category/eletrodomesticos/'         },
            ].map((l) => (
              <Link key={l.href} href={l.href} className="text-[12px] text-slate-500 hover:text-white transition-colors">{l.label}</Link>
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-white text-xs font-bold uppercase tracking-wider mb-3">Transparência</h3>
          <p className="text-[11px] leading-relaxed text-slate-500">
            O PiscouLevou participa do programa de afiliados do Mercado Livre. Ao clicar em "Ver Oferta", você é redirecionado ao site oficial do ML. Podemos receber uma comissão pela venda — sem custo extra para você.
          </p>
        </div>
      </div>

      <div className="border-t border-white/5 py-4 text-center text-[11px] text-slate-600">
        © {new Date().getFullYear()} PiscouLevou · Todos os direitos reservados · Afiliado Mercado Livre
      </div>
    </footer>
  );
}
