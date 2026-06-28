-- =============================================================================
-- PiscouLevou — Migration: Suporte a múltiplas plataformas (MELI + Shopee)
-- Execute no SQL Editor do Supabase Dashboard
-- =============================================================================

-- 1. Adiciona coluna 'platform' na tabela products
--    Default 'mercadolivre' para preservar todos os produtos existentes
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'mercadolivre'
  CHECK (platform IN ('mercadolivre', 'shopee'));

-- 2. Adiciona coluna 'shopee_item_id' para controle de duplicatas na Shopee
--    (equivalente ao meli_item_id)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS shopee_item_id TEXT UNIQUE;

-- 3. Torna meli_item_id não-obrigatório para permitir produtos Shopee sem ele
--    (produtos Shopee usam shopee_item_id em vez de meli_item_id)
ALTER TABLE public.products
  ALTER COLUMN meli_item_id DROP NOT NULL;

-- 4. Índice para filtrar por plataforma no frontend
CREATE INDEX IF NOT EXISTS idx_products_platform
  ON public.products(platform);

-- 5. Índice para shopee_item_id (busca de duplicatas na sync)
CREATE INDEX IF NOT EXISTS idx_products_shopee_item_id
  ON public.products(shopee_item_id)
  WHERE shopee_item_id IS NOT NULL;

-- 6. Tabela de controle de alternância Instagram (qual plataforma foi postada por último)
--    Usada pela função instagram-post para alternar MELI ↔ Shopee
CREATE TABLE IF NOT EXISTS public.instagram_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Política de segurança: apenas service_role pode escrever
ALTER TABLE public.instagram_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ig_settings_service_all" ON public.instagram_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Valor inicial: última plataforma postada foi shopee
-- (para que o PRÓXIMO post seja do mercadolivre)
INSERT INTO public.instagram_settings (key, value)
  VALUES ('last_posted_platform', 'shopee')
  ON CONFLICT (key) DO NOTHING;

-- =============================================================================
-- Verificação
-- =============================================================================
SELECT
  platform,
  COUNT(*) AS total_produtos,
  COUNT(*) FILTER (WHERE status = 'active') AS ativos
FROM public.products
GROUP BY platform
ORDER BY platform;
