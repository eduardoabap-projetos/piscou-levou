-- =============================================================================
-- CRON: Instagram Auto-Post — 3x ao dia (9h, 14h e 19h BRT)
-- Execute no SQL Editor do Supabase Dashboard
-- =============================================================================

-- Remove job anterior com o mesmo nome (idempotente)
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname IN ('piscoulevou-instagram-post', 'piscoulevou-instagram-9h', 'piscoulevou-instagram-14h', 'piscoulevou-instagram-19h');

-- ─── Post das 9h BRT (12:00 UTC) ─────────────────────────────────────────────
SELECT cron.schedule(
  'piscoulevou-instagram-9h',
  '0 12 * * *',          -- 09:00 BRT = 12:00 UTC
  $$
    SELECT net.http_post(
      url     := 'https://zbupixtjhumxutsyaqtf.supabase.co/functions/v1/instagram-post',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_6pgCs8PashnflgGTPRv4FA_OkRtN57R"}'::jsonb,
      body    := '{}'::jsonb
    ) AS request_id;
  $$
);

-- ─── Post das 14h BRT (17:00 UTC) ────────────────────────────────────────────
SELECT cron.schedule(
  'piscoulevou-instagram-14h',
  '0 17 * * *',          -- 14:00 BRT = 17:00 UTC
  $$
    SELECT net.http_post(
      url     := 'https://zbupixtjhumxutsyaqtf.supabase.co/functions/v1/instagram-post',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_6pgCs8PashnflgGTPRv4FA_OkRtN57R"}'::jsonb,
      body    := '{}'::jsonb
    ) AS request_id;
  $$
);

-- ─── Post das 19h BRT (22:00 UTC) ────────────────────────────────────────────
SELECT cron.schedule(
  'piscoulevou-instagram-19h',
  '0 22 * * *',          -- 19:00 BRT = 22:00 UTC
  $$
    SELECT net.http_post(
      url     := 'https://zbupixtjhumxutsyaqtf.supabase.co/functions/v1/instagram-post',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_6pgCs8PashnflgGTPRv4FA_OkRtN57R"}'::jsonb,
      body    := '{}'::jsonb
    ) AS request_id;
  $$
);

-- Confirma os agendamentos
SELECT jobname, schedule, active
FROM cron.job
WHERE jobname IN ('piscoulevou-instagram-9h', 'piscoulevou-instagram-14h', 'piscoulevou-instagram-19h');

-- =============================================================================
-- MONITORAMENTO: Ver posts do Instagram hoje
-- =============================================================================
-- SELECT
--   codigo_identificador,
--   title,
--   price,
--   discount_pct,
--   data_envio_instagram,
--   enviado_instagram
-- FROM products
-- WHERE enviado_instagram = TRUE
-- ORDER BY data_envio_instagram DESC
-- LIMIT 10;

-- =============================================================================
-- RESET MANUAL: Reenviar um produto específico (para testes)
-- =============================================================================
-- UPDATE products
-- SET enviado_instagram = FALSE, instagram_lock = FALSE, data_envio_instagram = NULL
-- WHERE codigo_identificador = 1;
