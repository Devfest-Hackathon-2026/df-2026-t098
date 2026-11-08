import { TestBed } from '@angular/core/testing';
import { handleBackButton, NativeShell } from './native-shell';

function fakeDialog(options: { cancelled?: boolean } = {}) {
  return {
    dispatchEvent: vi.fn((_event: Event) => !options.cancelled),
    close: vi.fn(),
  };
}

describe('handleBackButton', () => {
  const goBack = vi.fn();
  const exit = vi.fn();

  beforeEach(() => {
    goBack.mockReset();
    exit.mockReset();
  });

  it('closes the open sheet first, like Escape would', () => {
    const dialog = fakeDialog();
    handleBackButton({
      document: { querySelector: () => dialog } as unknown as Document,
      canGoBack: true,
      goBack,
      exit,
    });
    expect(dialog.dispatchEvent.mock.calls[0][0]).toMatchObject({
      type: 'cancel',
      cancelable: true,
    });
    expect(dialog.close).toHaveBeenCalled();
    expect(goBack).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });

  it('leaves a sheet open when its cancel handler prevents closing', () => {
    const dialog = fakeDialog({ cancelled: true });
    handleBackButton({
      document: { querySelector: () => dialog } as unknown as Document,
      canGoBack: true,
      goBack,
      exit,
    });
    expect(dialog.close).not.toHaveBeenCalled();
    expect(goBack).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });

  it('steps back through history when nothing is open', () => {
    handleBackButton({ document: { querySelector: () => null }, canGoBack: true, goBack, exit });
    expect(goBack).toHaveBeenCalledTimes(1);
    expect(exit).not.toHaveBeenCalled();
  });

  it('leaves the app at the first screen', () => {
    handleBackButton({ document: { querySelector: () => null }, canGoBack: false, goBack, exit });
    expect(exit).toHaveBeenCalledTimes(1);
    expect(goBack).not.toHaveBeenCalled();
  });
});

describe('NativeShell', () => {
  afterEach(() => {
    delete (globalThis as { Capacitor?: unknown }).Capacitor;
    document.documentElement.classList.remove('native-app');
    delete document.documentElement.dataset['platform'];
    delete document.documentElement.dataset['theme'];
    vi.restoreAllMocks();
  });

  function startNativeShell() {
    (globalThis as { Capacitor?: unknown }).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'ios',
    };
    const shell = TestBed.inject(NativeShell);
    const statusBar = vi
      .spyOn(shell as unknown as { statusBar(theme: string): Promise<void> }, 'statusBar')
      .mockResolvedValue(undefined);
    shell.start();
    return statusBar;
  }

  it('does nothing in a browser', () => {
    TestBed.inject(NativeShell).start();
    expect(document.documentElement.classList.contains('native-app')).toBe(false);
    expect(document.documentElement.dataset['platform']).toBeUndefined();
  });

  it('marks the document so styles can tell the shell from a browser', () => {
    (globalThis as { Capacitor?: unknown }).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'android',
    };
    TestBed.inject(NativeShell).start();
    expect(document.documentElement.classList.contains('native-app')).toBe(true);
    expect(document.documentElement.dataset['platform']).toBe('android');
  });

  it('styles the status bar for the theme at start and whenever any screen changes it', async () => {
    document.documentElement.dataset['theme'] = 'light';
    const statusBar = startNativeShell();
    await vi.waitFor(() => expect(statusBar).toHaveBeenLastCalledWith('light'));

    // The login and signup screens switch the theme themselves, only by setting data-theme.
    document.documentElement.dataset['theme'] = 'dark';
    await vi.waitFor(() => expect(statusBar).toHaveBeenLastCalledWith('dark'));
    document.documentElement.dataset['theme'] = 'light';
    await vi.waitFor(() => expect(statusBar).toHaveBeenLastCalledWith('light'));
  });

  it('treats a missing theme as dark, the app default', async () => {
    const statusBar = startNativeShell();
    await vi.waitFor(() => expect(statusBar).toHaveBeenLastCalledWith('dark'));
  });

  it('starts only once', async () => {
    const statusBar = startNativeShell();
    TestBed.inject(NativeShell).start();
    await vi.waitFor(() => expect(statusBar).toHaveBeenCalledTimes(1));
  });

  it('applies one status bar style at a time and finishes on the latest theme', async () => {
    // No data-theme yet at start (the app default is dark), then the page sets light a moment later.
    const releases: (() => void)[] = [];
    (globalThis as { Capacitor?: unknown }).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'android',
    };
    const shell = TestBed.inject(NativeShell);
    const statusBar = vi
      .spyOn(shell as unknown as { statusBar(theme: string): Promise<void> }, 'statusBar')
      .mockImplementation(() => new Promise<void>((resolve) => releases.push(resolve)));
    shell.start();
    await vi.waitFor(() => expect(statusBar).toHaveBeenCalledTimes(1));
    expect(statusBar).toHaveBeenLastCalledWith('dark');

    document.documentElement.dataset['theme'] = 'light';
    await new Promise((resolve) => setTimeout(resolve, 20));
    // The first native call is still in flight, so the second must not be sent yet.
    expect(statusBar).toHaveBeenCalledTimes(1);

    releases[0]();
    await vi.waitFor(() => expect(statusBar).toHaveBeenCalledTimes(2));
    expect(statusBar).toHaveBeenLastCalledWith('light');
  });

  it('skips themes that were replaced while an earlier style was still being applied', async () => {
    const releases: (() => void)[] = [];
    (globalThis as { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => true };
    const shell = TestBed.inject(NativeShell);
    const statusBar = vi
      .spyOn(shell as unknown as { statusBar(theme: string): Promise<void> }, 'statusBar')
      .mockImplementation(() => new Promise<void>((resolve) => releases.push(resolve)));
    shell.start();
    await vi.waitFor(() => expect(statusBar).toHaveBeenCalledTimes(1));

    for (const theme of ['light', 'dark', 'light', 'dark']) {
      document.documentElement.dataset['theme'] = theme;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    releases[0]();
    await new Promise((resolve) => setTimeout(resolve, 20));
    // The app ended on dark, which is already what the first call applied: nothing more to send.
    expect(statusBar).toHaveBeenCalledTimes(1);
  });
});
