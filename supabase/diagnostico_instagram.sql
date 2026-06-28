-- =============================================================================
-- DIAGNÓSTICO: Por que o instagram-post parou de funcionar?
-- Execute no SQL Editor do Supabase Dashboard
-- =============================================================================

-- 1. Ver jobs de cron ativos (confirma se os 3 jobs estão rodando)
SELECT jobname, schedule, active, last_run_time, next_run_time
FROM cron.job
ORDER BY jobname;

-- 2. Últimas execuções do cron instagram
SELECT jobname, start_time, end_time, status, return_message
FROM cron.job_run_details
WHERE jobname LIKE '%instagram%'
ORDER BY start_time DESC
LIMIT 20;

-- 3. Quantos produtos estão na fila (não enviados)
SELECT
  COUNT(*)                                            AS total_na_fila,
  COUNT(*) FILTER (WHERE instagram_lock = TRUE)       AS com_lock_preso,
  COUNT(*) FILTER (WHERE instagram_lock = FALSE OR instagram_lock IS NULL) AS disponiveis,
  COUNT(*) FILTER (WHERE discount_pct > 0)            AS com_desconto
FROM products
WHERE enviado_instagram = FALSE AND status = 'active';

-- 4. Posts feitos hoje (BRT)
SELECT codigo_identificador, title, price, discount_pct, data_envio_instagram
FROM products
WHERE enviado_instagram = TRUE
  AND data_envio_instagram >= (NOW() AT TIME ZONE 'America/Sao_Paulo')::date::timestamptz AT TIME ZONE 'America/Sao_Paulo'
ORDER BY data_envio_instagram DESC
LIMIT 10;

-- 5. Produtos com lock preso (possível causa do bloqueio da fila)
SELECT id, codigo_identificador, title, instagram_lock, enviado_instagram, updated_at
FROM products
WHERE instagram_lock = TRUE AND enviado_instagram = FALSE
LIMIT 10;
