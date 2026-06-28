-- ============================================================
-- PiscouLevou — Cron Job: Auto-sync de preços a cada 30 minutos
-- ============================================================
-- Ativa a extensão pg_cron (disponível no Supabase)
-- e cria um job que chama a Edge Function meli-sync a cada 30 min.
-- ============================================================

-- Habilita pg_cron (se ainda não estiver ativo)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Habilita pg_net (necessário para HTTP requests via cron no Supabase)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove job anterior se existir (para evitar duplicatas ao re-rodar)
SELECT cron.unschedule('piscoulevou-meli-sync-30min')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'piscoulevou-meli-sync-30min'
);

-- Cria o job de sincronização a cada 30 minutos
-- A URL da Edge Function usa o projeto Supabase e o service_role_key para autenticação
SELECT cron.schedule(
  'piscoulevou-meli-sync-30min',   -- Nome único do job
  '*/30 * * * *',                   -- A cada 30 minutos
  $$
  SELECT net.http_post(
    url     := 'https://zbupixtjhumxutsyaqtf.supabase.co/functions/v1/meli-sync',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true)
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- Cria uma configuração de runtime para a service role key
-- (o cron job precisa do service_role_key para chamar a Edge Function)
DO $$
BEGIN
  -- Tenta configurar a chave. Ignora se já existir.
  PERFORM set_config('app.supabase_service_role_key', '', false);
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

-- Verifica que o job foi criado
SELECT jobname, schedule, command, active
FROM cron.job
WHERE jobname = 'piscoulevou-meli-sync-30min';
