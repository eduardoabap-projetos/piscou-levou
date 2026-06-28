-- =============================================================================
-- MIGRATION: Instagram Queue Control
-- Tabela: products (equivalente a "produtos_aceitos")
-- Execute no SQL Editor do Supabase Dashboard
-- =============================================================================

-- 1. Sequência para gerar códigos curtos e sequenciais
CREATE SEQUENCE IF NOT EXISTS instagram_codigo_seq START 1 INCREMENT 1;

-- 2. Adiciona colunas de controle de Instagram
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS codigo_identificador INT UNIQUE DEFAULT nextval('instagram_codigo_seq'),
  ADD COLUMN IF NOT EXISTS enviado_instagram    BOOLEAN   NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS data_envio_instagram TIMESTAMPTZ;

-- 3. Popula código nos registos existentes (que ficaram com o DEFAULT nextval)
--    Garante que nenhum registo fique sem código
UPDATE products
SET codigo_identificador = nextval('instagram_codigo_seq')
WHERE codigo_identificador IS NULL;

-- 4. Índice parcial — otimiza a query de fila (somente registos não enviados)
CREATE INDEX IF NOT EXISTS idx_products_instagram_queue
  ON products (updated_at ASC)
  WHERE enviado_instagram = FALSE AND status = 'active';

-- 5. Índice de busca por código (usado na página /instagram)
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_codigo
  ON products (codigo_identificador);

-- Verifica resultado
SELECT
  COUNT(*)                                          AS total_produtos,
  COUNT(*) FILTER (WHERE enviado_instagram = FALSE) AS na_fila,
  MIN(codigo_identificador)                         AS primeiro_codigo,
  MAX(codigo_identificador)                         AS ultimo_codigo
FROM products
WHERE status = 'active';
