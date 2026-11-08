import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { isNativePlatform, nativePlatformName } from './platform';

export interface BackButtonEnvironment {
  document: Pick<Document, 'querySelector'>;
  canGoBack: boolean;
  goBack: () => void;
  exit: () => void;
}

/**
 * The Android hardware/gesture back button. It closes the open sheet first (the comments panel is a
 * modal <dialog>, which a WebView does not close on its own), then steps back through the app's
 * history, and only then leaves the app.
 */
export function handleBackButton({
  document,
  canGoBack,
  goBack,
  exit,
}: BackButtonEnvironment): void {
  const dialog = document.querySelector('dialog[open]') as HTMLDialogElement | null;
  if (dialog && typeof dialog.close === 'function') {
    // Same contract as Escape: a handler that cancels the event keeps the dialog open.
    if (dialog.dispatchEvent(new Event('cancel', { cancelable: true }))) dialog.close();
    return;
  }
  if (canGoBack) goBack();
  else exit();
}

/** Connects the Capacitor shell to the app. Does nothing in a browser. */
@Injectable({ providedIn: 'root' })
export class NativeShell {
  private readonly document = inject(DOCUMENT);
  private started = false;
  private requestedTheme: 'light' | 'dark' | null = null;
  private appliedTheme: 'light' | 'dark' | null = null;
  private statusBarQueue: Promise<void> = Promise.resolve();

  start(): void {
    if (this.started || !isNativePlatform()) return;
    this.started = true;
    const root = this.document.documentElement;
    root.classList.add('native-app');
    root.dataset['platform'] = nativePlatformName();

    // Light text on the dark theme, dark text on the light theme. Several screens switch the theme
    // on their own, but all of them set data-theme on the root element, so watch that.
    const theme = () => (root.dataset['theme'] === 'light' ? 'light' : 'dark');
    this.queueStatusBar(theme());
    new MutationObserver(() => this.queueStatusBar(theme())).observe(root, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    void this.watchBackButton();
  }

  /**
   * Native calls are not guaranteed to land in the order they were sent (on Android a late "dark"
   * overrode a "light" sent after it), so apply one style at a time and always finish on the latest.
   */
  private queueStatusBar(theme: 'light' | 'dark'): void {
    this.requestedTheme = theme;
    this.statusBarQueue = this.statusBarQueue.then(async () => {
      const wanted = this.requestedTheme;
      if (wanted === null || wanted === this.appliedTheme) return;
      this.appliedTheme = wanted;
      await this.statusBar(wanted);
    });
  }

  private async statusBar(theme: 'light' | 'dark'): Promise<void> {
    try {
      const { StatusBar, Style } = await import('@capacitor/status-bar');
      await StatusBar.setStyle({ style: theme === 'dark' ? Style.Dark : Style.Light });
    } catch {
      /* Status bar styling is cosmetic. */
    }
  }

  private async watchBackButton(): Promise<void> {
    try {
      const { App } = await import('@capacitor/app');
      await App.addListener('backButton', ({ canGoBack }) =>
        handleBackButton({
          document: this.document,
          canGoBack,
          goBack: () => this.document.defaultView?.history.back(),
          exit: () => void App.exitApp(),
        }),
      );
    } catch {
      /* iOS has no back button; a missing plugin leaves the default behaviour. */
    }
  }
}
