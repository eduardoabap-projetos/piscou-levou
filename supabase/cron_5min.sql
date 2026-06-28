-- Remove jobs anteriores (5min e outros)
SELECT cron.unschedule(jobid) FROM cron.job
WHERE jobname IN ('piscoulevou-meli-sync-30min', 'piscoulevou-meli-sync-5min', 'piscoulevou-meli-sync-10min');

-- Cria novo job a cada 10 minutos
SELECT cron.schedule(
  'piscoulevou-meli-sync-10min',
  '*/10 * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://zbupixtjhumxutsyaqtf.supabase.co/functions/v1/meli-sync',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_6pgCs8PashnflgGTPRv4FA_OkRtN57R"}'::jsonb,
      body    := '{}'::jsonb
    ) as request_id;
  $$
);

-- Confirma
SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'piscoulevou-meli-sync-10min';
