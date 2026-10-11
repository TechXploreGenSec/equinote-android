import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { isNative as isNativeAndroid, realErrorMessage } from './shareFile';
import type jsPDF from 'jspdf';

export { isNativeAndroid };

export function friendlyNativeError(e: unknown): string {
  const msg = realErrorMessage(e);
  if (/not implemented|not available|unavailable|bridge missing/i.test(msg)) {
    return 'Native file bridge missing in this build — please reinstall the latest APK from Releases.';
  }
  return `Save failed: ${msg}`;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunkSize)) as number[]
    );
  }
  return btoa(binary);
}

/**
 * Save a generated jsPDF document on Android (Capacitor native):
 * writes to Documents and opens the Share sheet so the user can
 * save / send / open the statement. Returns true if native save ran.
 * Falls back to false on web so callers can use doc.save().
 */
export async function savePdfNative(doc: jsPDF, filename: string): Promise<boolean> {
  if (!isNativeAndroid()) return false;
  if (!Capacitor.isPluginAvailable('Filesystem') || !Capacitor.isPluginAvailable('Share')) {
    throw new Error('Native file bridge missing in this build — please reinstall the latest APK from Releases.');
  }
  const safeName = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  const output = doc.output('arraybuffer') as ArrayBuffer;
  const base64 = arrayBufferToBase64(output);
  let savedUri = '';
  let location = '';
  try {
    const saved = await Filesystem.writeFile({
      path: safeName,
      data: base64,
      directory: Directory.Documents,
    });
    savedUri = saved.uri;
    location = `Documents/${safeName}`;
  } catch (e) {
    try {
      const saved = await Filesystem.writeFile({
        path: safeName,
        data: base64,
        directory: Directory.Cache,
      });
      savedUri = saved.uri;
      location = `app cache/${safeName}`;
    } catch {
      throw new Error(`could not save PDF (${realErrorMessage(e)})`);
    }
  }
  try {
    await Share.share({
      title: 'EquiNote Statement',
      text: `Your EquiNote statement (${safeName}) — saved at ${location}`,
      url: savedUri,
      dialogTitle: 'Save / Share PDF Statement',
    });
  } catch (e) {
    const msg = realErrorMessage(e).toLowerCase();
    if (!/dismiss|cancel|no activity/i.test(msg)) {
      throw new Error(`share sheet failed (${realErrorMessage(e)}). PDF is saved at ${location}.`);
    }
  }
  return true;
}
