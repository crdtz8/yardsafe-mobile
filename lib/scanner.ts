import { requireOptionalNativeModule } from 'expo';

// The barcode scanner uses expo-camera, which is native code that app builds
// before v1.1 don't contain — and expo-camera throws the moment it's loaded if
// its native part is missing. So the scanner screen is only ever loaded after
// this check passes (same pattern as the photo converter in lib/photos.ts).
// On older builds the Scan button simply doesn't appear.
export function hasBarcodeScanner(): boolean {
  return requireOptionalNativeModule('ExpoCamera') != null;
}
