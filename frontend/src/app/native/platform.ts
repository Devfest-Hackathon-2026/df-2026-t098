/**
 * The API address baked into a native build (`npm run native:build`). Web builds leave it unset and
 * call the relative `/api`, because the page and the API share an origin there.
 */
declare const __API_BASE_URL__: string | undefined;

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
}

/**
 * The native shell injects `window.Capacitor` before the app starts, so detection does not import
 * @capacitor/core: web visitors never download it. The plugins load on demand once native.
 */
function capacitor(): CapacitorGlobal | undefined {
  return (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor;
}

/** True inside the Capacitor iOS/Android shell, false in any browser. */
export function isNativePlatform(): boolean {
  try {
    return capacitor()?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

export function nativePlatformName(): string {
  try {
    return capacitor()?.getPlatform?.() ?? 'web';
  } catch {
    return 'web';
  }
}

export function nativeApiBaseUrl(): string {
  const value = typeof __API_BASE_URL__ === 'string' ? __API_BASE_URL__ : '';
  return value.replace(/\/+$/, '');
}
