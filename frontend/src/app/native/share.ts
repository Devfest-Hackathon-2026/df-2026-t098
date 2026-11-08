import { isNativePlatform, nativeApiBaseUrl } from './platform';

/**
 * The origin links should point at. A shared link must open in a browser, so the native shell uses
 * the deployed address (the API origin also serves the web app) instead of capacitor://localhost.
 */
export function shareBaseUrl(pageOrigin: string): string {
  return (isNativePlatform() && nativeApiBaseUrl()) || pageOrigin;
}

export type NativeShareResult = 'shared' | 'cancelled' | 'unavailable';

/** The operating system's share sheet. Browsers use navigator.share or the clipboard instead. */
export async function nativeShare(content: {
  title: string;
  text: string;
  url: string;
}): Promise<NativeShareResult> {
  if (!isNativePlatform()) return 'unavailable';
  try {
    const { Share } = await import('@capacitor/share');
    await Share.share({ ...content, dialogTitle: content.title });
    return 'shared';
  } catch (error) {
    // Closing the sheet rejects with a "canceled" message on both platforms.
    return /cancel/i.test(error instanceof Error ? error.message : String(error))
      ? 'cancelled'
      : 'unavailable';
  }
}
