import { supabase, SUPABASE_STORAGE_BUCKET } from './supabase';

export async function uploadUserFile(userId: string, file: File) {
  const path = `${userId}/${crypto.randomUUID()}-${file.name}`;
  const { data, error } = await supabase.storage.from(SUPABASE_STORAGE_BUCKET).upload(path, file, { upsert: false });
  if (error) throw error;
  return data.path;
}

export async function createUserFileUrl(path: string, expiresIn = 3600) {
  const { data, error } = await supabase.storage.from(SUPABASE_STORAGE_BUCKET).createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}
