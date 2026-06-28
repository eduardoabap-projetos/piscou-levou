-- ============================================================
-- PiscouLevou — Script de Criação do Banco de Dados Supabase
-- Execute no SQL Editor do Supabase Dashboard
-- ============================================================

-- 1. Tabela de Categorias
CREATE TABLE IF NOT EXISTS public.categories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  meli_category_id TEXT UNIQUE,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 2. Tabela de Produtos
CREATE TABLE IF NOT EXISTS public.products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meli_item_id    TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  slug            TEXT NOT NULL,
  price           NUMERIC(10,2) NOT NULL,
  original_price  NUMERIC(10,2),
  image_url       TEXT,
  affiliate_link  TEXT NOT NULL,
  category_id     UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  is_best_seller  BOOLEAN DEFAULT false,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Índices para performance nas queries do frontend
CREATE INDEX IF NOT EXISTS idx_products_status ON public.products(status);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_best_seller ON public.products(is_best_seller DESC);
CREATE INDEX IF NOT EXISTS idx_products_updated ON public.products(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_categories_slug ON public.categories(slug);

-- 3. Row Level Security (RLS) — leitura pública, escrita só via service role
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Permite leitura anônima (frontend Next.js usa anon key)
CREATE POLICY "categories_public_read" ON public.categories
  FOR SELECT TO anon USING (true);

CREATE POLICY "products_public_read_active" ON public.products
  FOR SELECT TO anon USING (status = 'active');

-- Permite escrita via service_role (Edge Function usa service role key)
CREATE POLICY "products_service_upsert" ON public.products
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "categories_service_all" ON public.categories
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 4. Dados Iniciais de Categorias (populares no Mercado Livre BR)
-- Os meli_category_id são os IDs reais da API Meli
-- ============================================================
INSERT INTO public.categories (name, slug, meli_category_id) VALUES
  ('Celulares e Smartphones', 'smartphones', 'MLB1051'),
  ('Informática', 'informatica', 'MLB1648'),
  ('Games', 'games', 'MLB1144'),
  ('Televisores', 'televisores', 'MLB1002'),
  ('Câmeras e Acessórios', 'cameras', 'MLB1004'),
  ('Eletroportáteis', 'eletroportateis', 'MLB1574'),
  ('Eletrodomésticos', 'eletrodomesticos', 'MLB1000'),
  ('Áudio', 'audio', 'MLB1003')
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- Verificação
-- ============================================================
SELECT 'categories' as tabela, count(*) as total FROM public.categories
UNION ALL
SELECT 'products', count(*) FROM public.products;
