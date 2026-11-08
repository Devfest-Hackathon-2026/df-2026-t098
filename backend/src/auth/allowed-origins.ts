/**
 * Origins allowed to call the API with a browser's Origin header.
 *
 * Web: the single origin of FRONTEND_URL. The page and the API share it, and the session lives in an
 * HttpOnly cookie that scripts cannot read.
 *
 * Native: a Capacitor shell loads bundled files from its own origin (capacitor://localhost on iOS,
 * https://localhost on Android), so its requests are cross-origin and a SameSite cookie does not
 * follow them. NATIVE_APP_ORIGINS lists those origins (comma separated). It is empty by default, so
 * a web-only deployment accepts nothing extra. Requests from a listed origin receive the session
 * token in the response body and send it back as `Authorization: Bearer`.
 */
const NATIVE_ORIGIN =
  /^(?:capacitor|ionic|https?):\/\/[a-z0-9]+(?:[.-][a-z0-9]+)*(?::\d{1,5})?$/;

export interface ParsedNativeOrigins {
  origins: string[];
  invalid: string[];
}

export function parseNativeAppOrigins(
  value: string | undefined,
): ParsedNativeOrigins {
  const origins: string[] = [];
  const invalid: string[] = [];
  for (const entry of (value ?? '').split(',')) {
    const candidate = entry.trim().toLowerCase();
    if (!candidate) continue;
    if (NATIVE_ORIGIN.test(candidate)) {
      if (!origins.includes(candidate)) origins.push(candidate);
    } else invalid.push(entry.trim());
  }
  return { origins, invalid };
}

export function nativeAppOrigins(
  value = process.env.NATIVE_APP_ORIGINS,
): string[] {
  return parseNativeAppOrigins(value).origins;
}

export function isNativeAppOrigin(origin: unknown): origin is string {
  return typeof origin === 'string' && nativeAppOrigins().includes(origin);
}

/** The web origin from FRONTEND_URL, or null when it is missing or not http(s). */
export function webOrigin(value = process.env.FRONTEND_URL): string | null {
  try {
    const url = new URL(value ?? '');
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

/** Origins to allow in CORS. Empty means cross-origin requests stay disabled. */
export function corsOrigins(): string[] {
  const web = webOrigin();
  return [...(web ? [web] : []), ...nativeAppOrigins()];
}
