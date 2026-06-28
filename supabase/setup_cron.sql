-- =============================================================
-- PiscouLevou — Cron Job: Sincronização automática de preços
-- Execução: a cada 30 minutos
-- =============================================================
-- INSTRUÇÕES:
-- Execute este SQL no Supabase Dashboard > SQL Editor > New Query
-- =============================================================

-- 1. Ativa extensões necessárias
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2. Remove jobs anteriores se existirem
select cron.unschedule(jobid)
from cron.job
where jobname in ('piscoulevou-meli-sync-30min', 'piscoulevou-meli-sync-5min');

-- 3. Cria o cron job que chama a Edge Function a cada 5 minutos
select cron.schedule(
  'piscoulevou-meli-sync-5min',
  '*/5 * * * *',
  $$
    select
      net.http_post(
        url     := 'https://zbupixtjhumxutsyaqtf.supabase.co/functions/v1/meli-sync',
        headers := '{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_6pgCs8PashnflgGTPRv4FA_OkRtN57R"}'::jsonb,
        body    := '{}'::jsonb
      ) as request_id;
  $$
);

-- 4. Confirma que o job foi criado com sucesso
select jobname, schedule, active
from cron.job
where jobname = 'piscoulevou-meli-sync-5min';
