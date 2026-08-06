import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';

// Reliable image upload for React Native. RN's `fetch(uri).blob()` yields an
// empty (0-byte) blob, so instead we upload the base64 that expo-image-picker
// returns (with base64:true), decoded to raw bytes. Returns the public URL.
export async function uploadImageBase64(
  bucket: string,
  path: string,
  base64: string,
  ext = 'jpg',
): Promise<string> {
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, decode(base64), { contentType: `image/${ext}`, upsert: false });
  if (error) throw error;
  const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(path);
  return publicUrl;
}
