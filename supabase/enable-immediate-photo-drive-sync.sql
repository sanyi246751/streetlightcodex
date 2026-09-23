-- Run once in Supabase SQL Editor after enabling pg_net and storing the Vault
-- secrets photo_sync_project_url and photo_sync_cron_secret.
-- The existing Cron job remains the once-per-minute retry mechanism.

create or replace function public.request_photo_drive_sync()
returns void language plpgsql security definer set search_path = public, net, vault as $$
begin
  perform net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'photo_sync_project_url') || '/functions/v1/photo-drive-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-photo-sync-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'photo_sync_cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
exception when others then
  raise warning 'Could not start immediate photo sync: %', sqlerrm;
end $$;

create or replace function public.queue_streetlight_photo()
returns trigger language plpgsql security definer set search_path = public as $$
declare m text[];
begin
  if new.bucket_id <> 'streetlight-photos' then return new; end if;
  m := regexp_match(new.name, '^base-surveys/([0-9]+)/(before|after)/');
  if m is not null then
    insert into photo_transfers(storage_path, destination, record_id, slot)
    values (new.name, 'base-survey', m[1]::bigint, m[2]) on conflict (storage_path) do nothing;
    perform public.request_photo_drive_sync();
    return new;
  end if;
  m := regexp_match(new.name, '^replacement-history/([0-9]+)/photo/');
  if m is not null then
    insert into photo_transfers(storage_path, destination, record_id, slot)
    values (new.name, 'replacement', m[1]::bigint, 'photo') on conflict (storage_path) do nothing;
    perform public.request_photo_drive_sync();
    return new;
  end if;
  m := regexp_match(new.name, '^repair-reports/([0-9]+)/photos/([0-9]+-(pre|post))/');
  if m is not null then
    insert into photo_transfers(storage_path, destination, record_id, slot)
    values (new.name, 'repair', m[1]::bigint, m[2]) on conflict (storage_path) do nothing;
    perform public.request_photo_drive_sync();
  end if;
  return new;
end $$;
