-- setup-selection-images.sql · RUN ONCE
--
-- Creates the storage bucket that holds Selections-catalog OPTION PHOTOS
-- (paint swatches, flooring samples, hardware finishes, …). Independent of the
-- investor-portal migrations in migrations-PROPOSED/ — safe to run on its own.
--
-- HOW TO APPLY (pick one):
--   • Supabase dashboard → SQL Editor → paste this → Run, OR
--   • supabase db execute --file supabase/setup-selection-images.sql
--
-- WHY PUBLIC: these are non-sensitive showroom images shown to clients. A
-- public bucket gives each image a STABLE url (getPublicUrl) with no signing or
-- expiry — so a catalog photo set today still loads in a year. (Contrast the
-- private 'project-files' bucket, which holds sensitive docs behind signed,
-- expiring links.) Uploads/edits are still limited to signed-in users.

insert into storage.buckets (id, name, public)
values ('selection-images', 'selection-images', true)
on conflict (id) do nothing;

-- Public READ comes free with a public bucket. Restrict WRITES (upload / replace
-- / delete) to authenticated users — matches the app's current "authenticated
-- only" posture. If/when the RBAC migrations land, this can tighten to
-- public.is_owner().
create policy "authenticated manage selection-images" on storage.objects
  for all to authenticated
  using (bucket_id = 'selection-images')
  with check (bucket_id = 'selection-images');
