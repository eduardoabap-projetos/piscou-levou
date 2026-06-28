-- ============================================================
-- PiscouLevou — Cron Job: Auto-sync de preços a cada 5 minutos
-- ============================================================
-- Atualiza o intervalo de 30 min → 5 min para manter preços
-- sempre sincronizados com o Mercado Livre.
-- ============================================================

-- Garante extensões ativas
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove jobs anteriores (tanto o de 30 min quanto qualquer 5 min anterior)
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname IN ('piscoulevou-meli-sync-30min', 'piscoulevou-meli-sync-5min');

-- Cria novo job a cada 5 minutos
SELECT cron.schedule(
  'piscoulevou-meli-sync-5min',
  '*/5 * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://zbupixtjhumxutsyaqtf.supabase.co/functions/v1/meli-sync',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_6pgCs8PashnflgGTPRv4FA_OkRtN57R"}'::jsonb,
      body    := '{}'::jsonb
    ) as request_id;
  $$
);

-- Confirma criação
SELECT jobname, schedule, active
FROM cron.job
WHERE jobname = 'piscoulevou-meli-sync-5min';
