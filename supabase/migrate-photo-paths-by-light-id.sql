-- Run once after deploying case-photo-upload-url.  Photos use the lamp number
-- as their Storage filename and the queue resolves that lamp number back to
-- the newest matching repair/base-survey record.

create or replace function public.queue_streetlight_photo()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  m text[];
  target_record_id bigint;
  target_destination text;
  target_slot text;
begin
  if new.bucket_id <> 'streetlight-photos' then return new; end if;

  m := regexp_match(new.name, '^repair-reports/(.+)_(前|後)\\.[^/]+$');
  if m is not null then
    select id into target_record_id from repair_reports
    where streetlight_id = m[1]
    order by repaired_at desc nulls last, id desc limit 1;
    target_destination := 'repair';
    target_slot := case when m[2] = '前' then '0-pre' else '0-post' end;
  else
    m := regexp_match(new.name, '^base-surveys/(.+)_(前|後)\\.[^/]+$');
    if m is not null then
      select id into target_record_id from base_surveys
      where streetlight_id = m[1]
      order by created_at desc, id desc limit 1;
      target_destination := 'base-survey';
      target_slot := case when m[2] = '前' then 'before' else 'after' end;
    else
      m := regexp_match(new.name, '^replacement-history/([0-9]+)/photo/');
      if m is null then return new; end if;
      target_record_id := m[1]::bigint;
      target_destination := 'replacement';
      target_slot := 'photo';
    end if;
  end if;

  if target_record_id is null then
    raise warning 'No record found for uploaded photo %', new.name;
    return new;
  end if;

  insert into photo_transfers(storage_path, destination, record_id, slot)
  values (new.name, target_destination, target_record_id, target_slot)
  on conflict (storage_path) do update set
    destination = excluded.destination,
    record_id = excluded.record_id,
    slot = excluded.slot,
    status = 'pending',
    attempts = 0,
    last_error = null,
    drive_file_id = null,
    drive_url = null,
    completed_at = null,
    updated_at = now();

  perform public.request_photo_drive_sync();
  return new;
end $$;

drop trigger if exists queue_streetlight_photo_after_upload on storage.objects;
create trigger queue_streetlight_photo_after_upload
after insert or update on storage.objects
for each row execute function public.queue_streetlight_photo();
