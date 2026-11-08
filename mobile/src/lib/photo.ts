import { File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

export type PickResult = { uri: string } | { error: string } | null;

/**
 * Lets the user choose a square profile photo from their library and keeps a copy in the
 * app's documents folder, so it survives cache clean-up. Returns null if they cancel.
 */
export async function pickProfilePhoto(previousUri?: string | null): Promise<PickResult> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return { error: 'Photo access is off. You can turn it on in your phone’s settings.' };

  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
  if (result.canceled || !result.assets?.length) return null;

  try {
    const source = new File(result.assets[0].uri);
    const target = new File(Paths.document, `profile-${Date.now()}.jpg`);
    await source.copy(target, { overwrite: true });
    removeProfilePhoto(previousUri);
    return { uri: target.uri };
  } catch {
    // Fall back to the picker's own copy if saving fails.
    return { uri: result.assets[0].uri };
  }
}

export function removeProfilePhoto(uri?: string | null) {
  if (!uri) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // Already gone; nothing to do.
  }
}

/**
 * Shrink a local photo to a 512 px square JPEG and return base64 for upload (stays well under the
 * server's 300 KB limit). Tries a lower quality if the first pass is still too large.
 */
export async function prepareProfilePhoto(uri: string): Promise<string> {
  const { ImageManipulator, SaveFormat } = await import('expo-image-manipulator');
  for (const compress of [0.7, 0.5, 0.35]) {
    const ref = await ImageManipulator.manipulate(uri).resize({ width: 512, height: 512 }).renderAsync();
    const out = await ref.saveAsync({ base64: true, compress, format: SaveFormat.JPEG });
    if (out.base64 && out.base64.length * 0.75 < 290_000) return out.base64;
  }
  throw new Error('That photo is too large. Try a different one.');
}
