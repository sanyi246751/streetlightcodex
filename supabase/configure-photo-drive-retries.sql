-- Run once in the Supabase SQL Editor.
--
-- Behaviour:
--   * a Storage upload still starts photo-drive-sync immediately;
--   * only failed/incomplete transfers are retried;
--   * retries run no sooner than 10 minutes apart, at most three times
--     (four total attempts including the original upload-triggered attempt).

-- The old minute-based job invokes photo-drive-sync even with an empty queue.
-- Remove only jobs belonging to this photo-sync implementation, leaving other
-- project cron jobs untouched.
do $$
declare existing_job record;
begin
  for existing_job in
    select jobid
    from cron.job
    where jobname = 'photo-drive-sync-retry'
       or command ilike '%photo-drive-sync%'
       or command ilike '%request_photo_drive_sync%'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
end $$;

-- A retry scheduler does not call the Edge Function unless there is an
-- eligible failed transfer.  It therefore produces no photo-sync request
-- while the queue is healthy or empty.
create or replace function public.retry_failed_photo_drive_sync()
returns void
language plpgsql
security definer
set search_path = public, net, vault
as $$
begin
  if exists (
    select 1
    from public.photo_transfers
    where status in ('failed', 'drive_uploaded')
      and attempts < 4
      and updated_at <= now() - interval '10 minutes'
  ) then
    perform public.request_photo_drive_sync();
  end if;
end;
$$;

-- One check every 10 minutes.  The function above makes this a no-op unless
-- a transfer actually needs its next retry.
select cron.schedule(
  'photo-drive-sync-retry',
  '*/10 * * * *',
  'select public.retry_failed_photo_drive_sync();'
);

-- Initial upload = attempt 1.  A failed or partially completed job is then
-- eligible for attempts 2, 3 and 4 only, each at least 10 minutes later.
create or replace function public.claim_photo_transfers(batch_size integer default 10)
returns setof public.photo_transfers
language sql
security definer
set search_path = public
as $$
  with candidates as (
    select id
    from public.photo_transfers
    where status = 'pending'
       or (
         status in ('failed', 'drive_uploaded')
         and attempts < 4
         and updated_at <= now() - interval '10 minutes'
       )
       or (
         status = 'processing'
         and attempts < 4
         and updated_at < now() - interval '10 minutes'
       )
    order by created_at
    for update skip locked
    limit greatest(1, least(batch_size, 25))
  ), claimed as (
    update public.photo_transfers p
    set status = case when p.status = 'drive_uploaded' then 'drive_uploaded' else 'processing' end,
        attempts = attempts + 1,
        updated_at = now(),
        last_error = null
    from candidates c
    where p.id = c.id
    returning p.*
  )
  select * from claimed;
$$;

-- Optional verification after running this script:
-- select jobid, jobname, schedule, command from cron.job order by jobid;
