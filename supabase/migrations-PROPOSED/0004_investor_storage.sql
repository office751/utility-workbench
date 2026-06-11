-- ⚠️ PROPOSED — do not run without approval. See README.md in this folder.
--
-- 0004 · A separate bucket for investor-visible photos
--
-- WHY A SECOND BUCKET instead of policies on project-files: the owner bucket
-- holds EVERYTHING (contracts, surveys, financials). Sharing a photo means
-- the owner app COPIES it into investor-files/<projectId>/… — so even a
-- policy bug can never expose an unshared owner file; the bytes simply
-- aren't in the bucket investors can reach. Trade-off: shared photos exist
-- twice (fine — photos are small next to plan sets).

insert into storage.buckets (id, name, public)
values ('investor-files', 'investor-files', false)
on conflict (id) do nothing;

-- Owners: full control of the bucket.
create policy "owners manage investor-files" on storage.objects
  for all using (bucket_id = 'investor-files' and public.is_owner())
  with check (bucket_id = 'investor-files' and public.is_owner());

-- Investors: read-only, and ONLY inside folders for projects they're granted.
-- Object paths are '<projectId>/<uuid>/<filename>', so the first folder
-- segment is the project id the grant is checked against.
create policy "investors read granted project photos" on storage.objects
  for select using (
    bucket_id = 'investor-files'
    and public.has_project(((storage.foldername(name))[1])::int)
  );
