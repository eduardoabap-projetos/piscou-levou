-- =============================================================================
-- CRON: Shopee Sync — a cada 10 minutos (mesmo ritmo do meli-sync)
-- Execute no SQL Editor do Supabase Dashboard
-- =============================================================================

-- Remove jobs anteriores com o mesmo nome (idempotente)
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname IN ('piscoulevou-shopee-sync');

-- Cria o cron job
SELECT cron.schedule(
  'piscoulevou-shopee-sync',
  '*/10 * * * *',     -- a cada 10 minutos
  $$
    SELECT net.http_post(
      url     := 'https://zbupixtjhumxutsyaqtf.supabase.co/functions/v1/shopee-sync',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_6pgCs8PashnflgGTPRv4FA_OkRtN57R"}'::jsonb,
      body    := '{}'::jsonb
    ) AS request_id;
  $$
);

-- Confirma o agendamento
SELECT jobname, schedule, active
FROM cron.job
WHERE jobname = 'piscoulevou-shopee-sync';

-- =============================================================================
-- CONFIGURAR SECRETS (rode no terminal local, não aqui):
-- =============================================================================
-- npx supabase secrets set SHOPEE_APP_ID="SEU_APP_ID_AQUI"
-- npx supabase secrets set SHOPEE_SECRET_KEY="SUA_SECRET_KEY_AQUI"
--
-- Onde encontrar:
-- https://affiliate.shopee.com.br → Ferramentas → API de Afiliados
-- =============================================================================
