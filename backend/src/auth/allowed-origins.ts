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
