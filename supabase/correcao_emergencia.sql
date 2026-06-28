-- =============================================================================
-- CORREÇÃO DE EMERGÊNCIA: Libera locks presos e reseta fila se necessário
-- Execute no SQL Editor do Supabase Dashboard
-- =============================================================================

-- PASSO 1: Libera todos os locks presos (produtos que travaram durante postagem)
UPDATE products
SET instagram_lock = FALSE
WHERE instagram_lock = TRUE AND enviado_instagram = FALSE;

-- Resultado: mostra quantos foram liberados
SELECT COUNT(*) AS locks_liberados
FROM products
WHERE instagram_lock = FALSE AND enviado_instagram = FALSE AND status = 'active';

-- PASSO 2: Ver produtos disponíveis para postar agora
SELECT codigo_identificador, title, price, discount_pct, instagram_lock, enviado_instagram
FROM products
WHERE enviado_instagram = FALSE
  AND status = 'active'
  AND (instagram_lock = FALSE OR instagram_lock IS NULL)
ORDER BY discount_pct DESC NULLS LAST
LIMIT 10;

-- =============================================================================
-- SE A FILA ESTIVER VAZIA (todos já foram postados):
-- Descomente as linhas abaixo para resetar os produtos mais antigos
-- =============================================================================
-- -- Reseta os 30 produtos mais antigos para reaparecerem na fila
-- UPDATE products
-- SET enviado_instagram = FALSE,
--     instagram_lock    = FALSE,
--     data_envio_instagram = NULL
-- WHERE id IN (
--   SELECT id FROM products
--   WHERE enviado_instagram = TRUE AND status = 'active'
--   ORDER BY data_envio_instagram ASC  -- os mais antigos primeiro
--   LIMIT 30
-- );
