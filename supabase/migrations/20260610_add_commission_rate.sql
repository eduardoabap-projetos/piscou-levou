-- ============================================================
-- PiscouLevou — Adiciona taxa de comissão por categoria
-- e inativa produtos com comissão estimada abaixo de R$10
-- Execute no SQL Editor do Supabase Dashboard
-- ============================================================

-- 1. Adiciona coluna commission_rate na tabela categories
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5,4) DEFAULT 0.04;

-- 2. Atualiza as taxas de comissão por categoria (baseado na tabela oficial ML Afiliados)
UPDATE public.categories SET commission_rate = 0.16 WHERE slug = 'cuidados-pessoais';      -- Beleza e Cuidados Pessoais ~16%
UPDATE public.categories SET commission_rate = 0.08 WHERE slug = 'casa-e-organizacao';     -- Casa, Móveis e Decoração ~8%
UPDATE public.categories SET commission_rate = 0.08 WHERE slug = 'ferramentas';            -- Ferramentas ~8%
UPDATE public.categories SET commission_rate = 0.04 WHERE slug = 'eletrodomesticos';       -- Eletrodomésticos/Eletroportáteis ~4%
UPDATE public.categories SET commission_rate = 0.04 WHERE slug = 'eletronicos-e-tecnologia'; -- Eletrônicos ~4%

-- Categorias antigas (caso ainda existam no banco)
UPDATE public.categories SET commission_rate = 0.16 WHERE slug = 'cuidados-pessoais';
UPDATE public.categories SET commission_rate = 0.04 WHERE slug = 'smartphones';
UPDATE public.categories SET commission_rate = 0.04 WHERE slug = 'informatica';
UPDATE public.categories SET commission_rate = 0.04 WHERE slug = 'games';
UPDATE public.categories SET commission_rate = 0.04 WHERE slug = 'televisores';
UPDATE public.categories SET commission_rate = 0.04 WHERE slug = 'cameras';
UPDATE public.categories SET commission_rate = 0.04 WHERE slug = 'eletroportateis';
UPDATE public.categories SET commission_rate = 0.04 WHERE slug = 'eletrodomesticos';
UPDATE public.categories SET commission_rate = 0.04 WHERE slug = 'audio';

-- 3. Inativa produtos existentes cuja comissão estimada seja menor que R$10
--    Comissão estimada = price * commission_rate (da categoria do produto)
UPDATE public.products p
SET
  status     = 'inactive',
  updated_at = now()
FROM public.categories c
WHERE
  p.category_id = c.id
  AND p.status   = 'active'
  AND (p.price * c.commission_rate) < 10.00;

-- 4. Verificação: mostra quantos produtos ativos restaram por categoria com suas comissões estimadas
SELECT
  c.name                                          AS categoria,
  c.commission_rate * 100                         AS "taxa_comissao_%",
  COUNT(*) FILTER (WHERE p.status = 'active')     AS ativos,
  COUNT(*) FILTER (WHERE p.status = 'inactive')   AS inativos,
  ROUND(MIN(p.price) FILTER (WHERE p.status = 'active'), 2) AS "preco_min_ativo",
  ROUND(AVG(p.price * c.commission_rate) FILTER (WHERE p.status = 'active'), 2) AS "comissao_media_R$"
FROM public.categories c
LEFT JOIN public.products p ON p.category_id = c.id
WHERE c.slug NOT IN ('__meli_tokens__', '__oauth_pkce__')
GROUP BY c.name, c.commission_rate
ORDER BY c.commission_rate DESC;
