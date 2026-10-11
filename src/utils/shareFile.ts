import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function textToBase64(text: string): string {
  return btoa(
    encodeURIComponent(text).replace(/%([0-9A-F]{2})/g, (_m, hex: string) =>
      String.fromCharCode(Number(`0x${hex}`))
    )
  );
}

/**
 * Download / save a text file (JSON, CSV) so it works on both web and
 * Android. WebView anchor downloads never fire on Android, so on native we
 * write to Documents and open the Share sheet (save / send / open).
 */
export async function downloadTextFile(
  filename: string,
  text: string,
  shareTitle = 'EquiNote File'
): Promise<void> {
  if (isNative()) {
    const saved = await Filesystem.writeFile({
      path: filename,
      data: text,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });
    try {
      await Share.share({
        title: shareTitle,
        text: filename,
        url: saved.uri,
        dialogTitle: `Save / Share ${filename}`,
      });
    } catch {
      // Share dismissed — file is still in Documents.
    }
    return;
  }

  const blob = new Blob([text], { type: 'text/plain;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
