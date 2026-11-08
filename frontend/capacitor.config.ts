import type { CapacitorConfig } from '@capacitor/cli';

declare const process: { env: Record<string, string | undefined> };

// `native:build:dev` serves an http API (a local backend). Android blocks plain http unless allowed.
const developmentApi = process.env['WHYLINT_NATIVE_DEV'] === '1';

const config: CapacitorConfig = {
  // Placeholder: confirm the reverse-domain id before the first store submission. It cannot change later.
  appId: 'app.whylint.mobile',
  appName: 'WhyLint',
  // `ng build --configuration production,native` writes here (see angular.json).
  webDir: 'dist/native/browser',
  backgroundColor: '#080808',
  // Bridge logs include plugin arguments, including secure-storage session writes.
  loggingBehavior: 'none',
  zoomEnabled: true,
  // The files are served from capacitor://localhost (iOS) and https://localhost (Android).
  // Both must be listed in the backend's NATIVE_APP_ORIGINS.
  server: developmentApi ? { cleartext: true } : undefined,
  plugins: {
    SocialLogin: {
      providers: { google: true, facebook: false, apple: false, twitter: false },
    },
    SplashScreen: { backgroundColor: '#080808', launchShowDuration: 0, launchAutoHide: true },
    Keyboard: { resize: 'native' },
  },
};

export default config;
