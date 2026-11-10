import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';
import { contentTypeFor, detectImageType, WEB_DISPLAYABLE } from './imageType';

// Reliable image upload for React Native. RN's `fetch(uri).blob()` yields an
// empty (0-byte) blob, so instead we upload base64 decoded to raw bytes.
// Returns the public URL.
//
// Guards (every upload, every build): never store an empty file, and never
// store a format web browsers can't display (iPhone HEIC). Both used to save
// "successfully" and then show as broken images in reports forever.
export async function uploadImageBase64(
  bucket: string,
  path: string,
  base64: string,
  _ext = 'jpg',
): Promise<string> {
  const buffer = decode(base64 || '');          // ArrayBuffer — the proven upload body
  const bytes = new Uint8Array(buffer);           // view for checking only
  if (bytes.byteLength === 0) {
    throw new Error('The photo was empty and was not uploaded. Please try again.');
  }
  const type = detectImageType(bytes);
  if (!WEB_DISPLAYABLE.has(type)) {
    throw new Error(
      type === 'heic'
        ? 'This photo is in iPhone HEIC format, which reports can\'t display. Please take the photo with the camera button, or set iPhone Settings → Camera → Formats → Most Compatible.'
        : 'This file isn\'t a supported photo type. Please use a JPEG or PNG photo.',
    );
  }
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, buffer, { contentType: contentTypeFor(type), upsert: false });
  if (error) throw error;
  const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(path);
  return publicUrl;
}
