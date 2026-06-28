'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

const CAT_CONFIG = {
  // Originais — slugs verificados
  'eletrodomesticos':         { emoji: '🏠', label: 'Eletrodomésticos'   },
  'ferramentas':              { emoji: '🔧', label: 'Ferramentas'         },
  'casa-e-organizacao':       { emoji: '🛋️', label: 'Casa e Decoração'   },
  'eletronicos-e-tecnologia': { emoji: '📺', label: 'Eletrônicos'         },
  'cuidados-pessoais':        { emoji: '💄', label: 'Beleza'              },
  // Novas — slugs verificados
  'celulares':                { emoji: '📱', label: 'Celulares'           },
  'computacao':               { emoji: '💻', label: 'Informática'         },
  'esportes':                 { emoji: '⚽', label: 'Esportes e Fitness'  },
  'bebes':                    { emoji: '👶', label: 'Bebês'               },
  'games':                    { emoji: '🎮', label: 'Games'               },
  'pet-shop':                 { emoji: '🐾', label: 'Pet Shop'            },
  'automotivo':               { emoji: '🚗', label: 'Automotivo'          },
  'moda':                     { emoji: '👗', label: 'Moda'                },
};

export default function CategoryNav({ categories = [], activeSlug = '' }) {
  const router = useRouter();

  const handleChange = (e) => {
    const slug = e.target.value;
    if (slug === '') router.push('/');
    else router.push(`/category/${slug}/`);
  };

  const activeCfg = CAT_CONFIG[activeSlug] ?? null;
  const placeholder = activeCfg
    ? `${activeCfg.emoji} ${activeCfg.label}`
    : '🔥 Todas as categorias';

  return (
    <div style={{ width: '100%', background: 'white', borderBottom: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '10px 24px' }}>
        <div style={{ position: 'relative', maxWidth: '420px' }}>

          {/* Select estilizado */}
          <select
            value={activeSlug ?? ''}
            onChange={handleChange}
            id="category-nav-select"
            aria-label="Selecionar categoria"
            style={{
              width: '100%',
              height: '44px',
              paddingLeft: '16px',
              paddingRight: '44px',
              fontSize: '14px',
              fontWeight: '700',
              background: 'white',
              border: '2px solid #e2e8f0',
              borderRadius: '14px',
              color: '#1e293b',
              cursor: 'pointer',
              appearance: 'none',
              outline: 'none',
              transition: 'border-color 0.15s',
            }}
            onFocus={(e)  => { e.target.style.borderColor = '#FF5A00'; }}
            onBlur={(e)   => { e.target.style.borderColor = '#e2e8f0'; }}
          >
            <option value="">🔥 Todas as categorias</option>
            {categories.map((cat) => {
              const cfg = CAT_CONFIG[cat.slug] ?? { emoji: '🛍️', label: cat.name };
              return (
                <option key={cat.id} value={cat.slug}>
                  {cfg.emoji} {cfg.label}
                </option>
              );
            })}
          </select>

          {/* Seta customizada */}
          <div style={{
            position: 'absolute', right: '14px', top: '50%',
            transform: 'translateY(-50%)', pointerEvents: 'none', color: '#94a3b8',
          }}>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5"
                 strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="m6 9 6 6 6-6"/>
            </svg>
          </div>

        </div>
      </div>
    </div>
  );
}
