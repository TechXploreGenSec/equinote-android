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

export function nativeFileBridgeOk(): boolean {
  try {
    return !isNative() || (Capacitor.isPluginAvailable('Filesystem') && Capacitor.isPluginAvailable('Share'));
  } catch {
    return false;
  }
}

export function realErrorMessage(e: unknown): string {
  return e instanceof Error && e.message ? e.message : String(e);
}

export function textToBase64(text: string): string {
  return btoa(
    encodeURIComponent(text).replace(/%([0-9A-F]{2})/g, (_m, hex: string) =>
      String.fromCharCode(Number(`0x${hex}`))
    )
  );
}

export interface SavedFileInfo {
  uri: string;
  /** Human-readable place, e.g. "Documents/EquiNote_Backup.json". */
  location: string;
}

/**
 * Download / save a text file (JSON, CSV) so it works on both web and
 * Android. WebView anchor downloads never fire on Android, so on native we
 * write to Documents (fallback: app Cache) and open the Share sheet.
 * Throws the REAL error on failure so the UI can show it — never silent.
 */
export async function downloadTextFile(
  filename: string,
  text: string,
  shareTitle = 'EquiNote File'
): Promise<SavedFileInfo> {
  if (isNative()) {
    if (!nativeFileBridgeOk()) {
      throw new Error('file bridge missing — reinstall the latest APK from Releases');
    }
    let savedUri = '';
    let location = '';
    try {
      const saved = await Filesystem.writeFile({
        path: filename,
        data: text,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
      });
      savedUri = saved.uri;
      location = `Documents/${filename}`;
    } catch (e) {
      // Documents can be blocked on some devices — fall back to app Cache.
      try {
        const saved = await Filesystem.writeFile({
          path: filename,
          data: text,
          directory: Directory.Cache,
        });
        savedUri = saved.uri;
        location = `app cache/${filename}`;
      } catch {
        throw new Error(`could not save file (${realErrorMessage(e)})`);
      }
    }
    // Confirm the file actually landed.
    try {
      await Filesystem.stat({ path: filename, directory: location.startsWith('Documents') ? Directory.Documents : Directory.Cache });
    } catch {
      // Stat unsupported on some providers — the write itself succeeded.
    }
    try {
      await Share.share({
        title: shareTitle,
        text: filename,
        url: savedUri,
        dialogTitle: `Save / Share ${filename}`,
      });
    } catch (e) {
      // Dismissing the sheet is fine — but surface real share errors.
      const msg = realErrorMessage(e).toLowerCase();
      if (!/dismiss|cancel|no activity/i.test(msg)) {
        throw new Error(`share sheet failed (${realErrorMessage(e)}). File is saved at ${location}.`);
      }
    }
    return { uri: savedUri, location };
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
  return { uri: url, location: filename };
}
