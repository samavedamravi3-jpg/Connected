import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { FULL_PX, THUMB_PX, squareCrop } from './avatar';

export type PickResult = { uri: string } | { error: string } | null;

/**
 * Center-crops to a square, scales down to `px` and re-encodes as JPEG. Re-encoding writes a fresh file without the
 * original's EXIF block, so camera details and GPS location are not kept. Returns a cache-folder file URI.
 */
async function squareJpeg(uri: string, px: number, compress: number): Promise<string> {
  const source = await ImageManipulator.manipulate(uri).renderAsync();
  const crop = squareCrop(source.width, source.height);
  const side = Math.min(px, crop.width);
  const out = await ImageManipulator.manipulate(source).crop(crop).resize({ width: side, height: side }).renderAsync();
  try {
    return (await out.saveAsync({ format: SaveFormat.JPEG, compress })).uri;
  } finally {
    source.release();
    out.release();
  }
}

/**
 * Lets the user choose a square profile photo from their library and keeps a 512 px, metadata-free copy in the app's
 * documents folder, so it survives cache clean-up. Returns null if they cancel.
 */
export async function pickProfilePhoto(previousUri?: string | null): Promise<PickResult> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return { error: 'Photo access is off. You can turn it on in your phone’s settings.' };

  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8, exif: false });
  if (result.canceled || !result.assets?.length) return null;

  try {
    const source = new File(await squareJpeg(result.assets[0].uri, FULL_PX, 0.8));
    const target = new File(Paths.document, `profile-${Date.now()}.jpg`);
    await source.copy(target, { overwrite: true });
    removeProfilePhoto(previousUri);
    return { uri: target.uri };
  } catch {
    // Never fall back to the original: it can carry location metadata and would be uploaded as is.
    return { error: 'That photo couldn’t be prepared. Try another one.' };
  }
}

/** The two JPEGs to upload for your photo (512 px and the 128 px marker thumbnail), made fresh from the saved copy. */
export async function photoUploadBodies(uri: string): Promise<{ full: ArrayBuffer; thumb: ArrayBuffer }> {
  const [full, thumb] = await Promise.all([squareJpeg(uri, FULL_PX, 0.8), squareJpeg(uri, THUMB_PX, 0.7)]);
  try {
    return { full: await new File(full).arrayBuffer(), thumb: await new File(thumb).arrayBuffer() };
  } finally {
    removeProfilePhoto(full);
    removeProfilePhoto(thumb);
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
