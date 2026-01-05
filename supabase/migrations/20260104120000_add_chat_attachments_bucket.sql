-- Create the storage bucket for chat attachments
insert into storage.buckets (id, name, public)
values ('chat-attachments', 'chat-attachments', true)
on conflict (id) do nothing;

-- Allow public access to view files
create policy "Public Access"
  on storage.objects for select
  using ( bucket_id = 'chat-attachments' );

-- Allow authenticated users to upload files
create policy "Authenticated Uploads"
  on storage.objects for insert
  to authenticated
  with check ( bucket_id = 'chat-attachments' );

-- Allow users to update their own files (optional, but good for cleanup)
create policy "Users can update own files"
  on storage.objects for update
  to authenticated
  using ( auth.uid() = owner )
  with check ( bucket_id = 'chat-attachments' );

-- Allow users to delete their own files
create policy "Users can delete own files"
  on storage.objects for delete
  to authenticated
  using ( auth.uid() = owner and bucket_id = 'chat-attachments' );
