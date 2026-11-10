import { Alert } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import * as ImagePicker from 'expo-image-picker';

// One place for how the app captures photos. Goals:
//  - Only ever upload formats web browsers can show. iPhones often hand back
//    HEIC, which Chrome/Edge can't display (inspection reports showed broken
//    images). lib/storage.ts also refuses HEIC as a last line of defense.
//  - Keep photos small (full-size photos are 2–5 MB each).
//
// OVER-THE-AIR SAFE: the JPEG converter/resizer (expo-image-manipulator) is
// native code that app builds before v1.1 don't contain. Its JS throws the
// moment it's loaded if the native part is missing, so it is NEVER imported at
// the top of this file — only loaded after checking the phone actually has it.
// On older builds we fall back to the system picker's own JPEG output.

export const MAX_PHOTO_PX = 1600;   // long edge (when the converter is available)
const JPEG_QUALITY = 0.75;

type Source = 'camera' | 'library';

/** True when this app build includes the native JPEG converter (v1.1+). */
export function hasPhotoConverter(): boolean {
  return requireOptionalNativeModule('ExpoImageManipulator') != null;
}

/** Convert an image (HEIC, PNG, large JPEG…) to a resized JPEG. Requires hasPhotoConverter(). */
async function convertToJpegBase64(uri: string): Promise<string> {
  // Loaded lazily on purpose — see the note at the top of this file.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { ImageManipulator, SaveFormat } = require('expo-image-manipulator') as typeof import('expo-image-manipulator');
  const refs: { release?: () => void }[] = [];
  try {
    let img = await ImageManipulator.manipulate(uri).renderAsync();
    refs.push(img);
    if (Math.max(img.width, img.height) > MAX_PHOTO_PX) {
      const size = img.width >= img.height ? { width: MAX_PHOTO_PX } : { height: MAX_PHOTO_PX };
      img = await ImageManipulator.manipulate(img).resize(size).renderAsync();
      refs.push(img);
    }
    const out = await img.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY, base64: true });
    if (!out.base64) throw new Error('This photo could not be processed. Please try another photo.');
    return out.base64;
  } finally {
    refs.forEach(r => r.release?.());
  }
}

async function pickImage(source: Source, converter: boolean): Promise<ImagePicker.ImagePickerAsset | null> {
  const perm = source === 'camera'
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (perm.status !== 'granted') {
    Alert.alert(
      'Permission Required',
      source === 'camera' ? 'Camera access is needed to take photos.' : 'Photo library access is needed.',
    );
    return null;
  }
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    // iOS: hand back a JPEG-compatible version of library photos instead of HEIC.
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    // With the converter: take full quality in and let it handle size.
    // Without it (older builds): let the picker compress and give us base64 directly.
    ...(converter ? { quality: 1, base64: false } : { quality: 0.7, base64: true }),
  };
  const res = source === 'camera'
    ? await ImagePicker.launchCameraAsync(options)
    : await ImagePicker.launchImageLibraryAsync(options);
  return res.canceled ? null : (res.assets?.[0] ?? null);
}

/**
 * Show the "Take Photo / Choose from Library" menu, then call `onPhoto` with
 * base64 image data ready for uploadImageBase64. Nothing is called if the user
 * cancels. `onBusy` (optional) is true while the photo is being converted.
 */
export function promptForPhoto(
  onPhoto: (base64: string) => void | Promise<void>,
  { title = 'Add Photo', onBusy }: { title?: string; onBusy?: (busy: boolean) => void } = {},
) {
  const run = (source: Source) => async () => {
    try {
      const converter = hasPhotoConverter();
      const asset = await pickImage(source, converter);
      if (!asset) return;
      let base64: string | null | undefined;
      if (converter) {
        onBusy?.(true);
        base64 = await convertToJpegBase64(asset.uri);
        onBusy?.(false);
      } else {
        base64 = asset.base64;
      }
      if (!base64) throw new Error('This photo could not be read. Please try another photo.');
      await onPhoto(base64);
    } catch (e: any) {
      onBusy?.(false);
      Alert.alert('Photo Problem', e?.message ?? 'This photo could not be used. Please try another photo.');
    }
  };
  Alert.alert(title, undefined, [
    { text: 'Take Photo', onPress: run('camera') },
    { text: 'Choose from Library', onPress: run('library') },
    { text: 'Cancel', style: 'cancel' },
  ]);
}
