-- PiscouLevou — Adiciona coluna is_highlight à tabela products
-- is_highlight = true → produto veio da Highlights API do ML (destaques especiais)
-- is_highlight = false → produto veio da Search API (catálogo geral)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS is_highlight boolean NOT NULL DEFAULT false;
