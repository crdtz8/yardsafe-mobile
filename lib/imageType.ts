// Identify an image by its first bytes ("magic numbers"), not its file name.
// Used to make sure we only ever store photos a web browser can display.

export type ImageType = 'jpeg' | 'png' | 'gif' | 'webp' | 'heic' | 'unknown';

/** Formats every major browser (Chrome, Edge, Safari, Firefox) can show. */
export const WEB_DISPLAYABLE: ReadonlySet<ImageType> = new Set(['jpeg', 'png', 'gif', 'webp']);

const CONTENT_TYPE: Record<ImageType, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  unknown: 'application/octet-stream',
};

export function contentTypeFor(type: ImageType): string {
  return CONTENT_TYPE[type];
}

export function detectImageType(bytes: Uint8Array): ImageType {
  const b = bytes;
  const ascii = (start: number, end: number) => String.fromCharCode(...Array.from(b.subarray(start, end)));
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 8 && b[0] === 0x89 && ascii(1, 4) === 'PNG') return 'png';
  if (b.length >= 6 && ascii(0, 4) === 'GIF8') return 'gif';
  if (b.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  // ISO media container: "....ftyp<brand>" — iPhone HEIC/HEIF photos (and AVIF)
  if (b.length >= 12 && ascii(4, 8) === 'ftyp') return 'heic';
  return 'unknown';
}
