-- Fictional development data; no users or staff are auto-authorized.
select public.submit_church(
  'ba06fb2d-7197-461e-b239-7f1766e7b115',
  '{"schemaVersion":1,"legalName":"Sample Community Church","displayName":"Sample Church","contactName":"Sample Coordinator","contactEmail":"coordinator@example.org","website":"https://example.org","socialLinks":[],"description":"A fictional development church.","serviceSchedule":"Sunday 10 AM","timezone":"America/Chicago","livestreamUrl":"https://example.org/live.m3u8","archiveUrl":"","appName":"Sample Church TV","primaryColor":"#c8e5b3","backgroundColor":"#152a28","platforms":["roku"],"contentRights":true,"consent":true}'::jsonb,
  '[]'::jsonb
) where not exists(select 1 from public.churches where id='ba06fb2d-7197-461e-b239-7f1766e7b115');
