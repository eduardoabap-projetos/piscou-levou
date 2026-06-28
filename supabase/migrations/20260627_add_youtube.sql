-- Adiciona coluna para rastrear posts do YouTube separado do Instagram
ALTER TABLE products ADD COLUMN IF NOT EXISTS youtube_posted_at TIMESTAMPTZ;

-- Índice para busca rápida por plataforma + não postado no YouTube
CREATE INDEX IF NOT EXISTS idx_products_youtube_posted 
  ON products(platform, youtube_posted_at, status, price);

-- Tabela de configuração do YouTube (igual ao instagram_settings)
CREATE TABLE IF NOT EXISTS youtube_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO youtube_settings (key, value) 
VALUES ('last_posted_platform', 'shopee')
ON CONFLICT (key) DO NOTHING;
