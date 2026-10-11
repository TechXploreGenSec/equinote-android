import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { isNative as isNativeAndroid } from './shareFile';
import type jsPDF from 'jspdf';

export { isNativeAndroid };

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
  const safeName = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  const output = doc.output('arraybuffer') as ArrayBuffer;
  const base64 = arrayBufferToBase64(output);
  const saved = await Filesystem.writeFile({
    path: safeName,
    data: base64,
    directory: Directory.Documents,
  });
  try {
    await Share.share({
      title: 'EquiNote Statement',
      text: `Your EquiNote statement (${safeName})`,
      url: saved.uri,
      dialogTitle: 'Save / Share PDF Statement',
    });
  } catch {
    // Share dismissed — file is still in Documents.
  }
  return true;
}
