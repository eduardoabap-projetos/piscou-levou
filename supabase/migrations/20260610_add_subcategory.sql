-- ============================================================
-- PiscouLevou — Adiciona subcategoria por produto
-- Execute no SQL Editor do Supabase Dashboard
-- ============================================================

-- 1. Adiciona colunas de subcategoria na tabela products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS subcategory_name    TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS subcategory_meli_id TEXT DEFAULT NULL;

-- Índice para facilitar agrupamento e filtragem por subcategoria
CREATE INDEX IF NOT EXISTS idx_products_subcat ON public.products(subcategory_meli_id);

-- 2. Verificação
SELECT
  subcategory_name,
  COUNT(*) AS total
FROM public.products
WHERE status = 'active'
GROUP BY subcategory_name
ORDER BY total DESC
LIMIT 20;
