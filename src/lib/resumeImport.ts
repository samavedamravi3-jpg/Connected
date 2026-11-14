/**
 * "Import from resume (PDF)": pick a PDF, send it to the proxy in /server, get draft experiences back.
 * Nothing is saved here. The caller shows the drafts for review first. If the proxy isn't configured or
 * fails, the result says so and the caller falls back to manual entry.
 */
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import type { Experience } from '@/data/types';
import { cleanExperience } from './experience';

const MAX_BYTES = 5_000_000;
const TIMEOUT_MS = 45_000;

export type ResumeResult =
  | { status: 'ok'; drafts: Experience[] }
  | { status: 'cancelled' }
  | { status: 'unavailable'; message: string };

const proxyBase = () => process.env.EXPO_PUBLIC_ASSISTANT_URL?.replace(/\/assistant\/?$/, '').replace(/\/$/, '');

/** True when the Claude proxy is configured, so the import button can explain the fallback up front. */
export const resumeImportConfigured = () => !!proxyBase();

export async function importResumePdf(): Promise<ResumeResult> {
  const base = proxyBase();
  if (!base) return { status: 'unavailable', message: 'Resume import needs the assistant server, which isn’t set up here. You can add your experience by hand instead.' };

  let picked: DocumentPicker.DocumentPickerResult;
  try {
    picked = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true, multiple: false });
  } catch {
    return { status: 'unavailable', message: 'Couldn’t open the file picker. You can add your experience by hand instead.' };
  }
  if (picked.canceled || !picked.assets?.length) return { status: 'cancelled' };
  const asset = picked.assets[0];
  if (asset.size != null && asset.size > MAX_BYTES) return { status: 'unavailable', message: 'That PDF is over 5 MB. Try a smaller file, or add your experience by hand.' };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const pdfBase64 = await new File(asset.uri).base64();
    const res = await fetch(`${base}/resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-app-token': process.env.EXPO_PUBLIC_ASSISTANT_TOKEN ?? '' },
      body: JSON.stringify({ pdfBase64 }),
      signal: ctrl.signal,
    });
    const body = (await res.json().catch(() => ({}))) as { experiences?: unknown; error?: string };
    if (!res.ok) return { status: 'unavailable', message: `${body.error ?? 'Resume import isn’t available right now.'} You can add your experience by hand instead.` };
    const drafts = (Array.isArray(body.experiences) ? body.experiences : [])
      .map((e) => cleanExperience(e as Partial<Experience>))
      .filter((e) => e.title && e.org);
    if (!drafts.length) return { status: 'unavailable', message: 'We didn’t find any roles in that PDF. You can add your experience by hand instead.' };
    // Keep incomplete drafts: the review screen lets the user fix them before saving.
    return { status: 'ok', drafts };
  } catch {
    return { status: 'unavailable', message: 'Couldn’t reach the resume service. You can add your experience by hand instead.' };
  } finally {
    clearTimeout(timer);
  }
}
