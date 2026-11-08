import { TestBed } from '@angular/core/testing';
import { HapticFeedback } from './haptics';

describe('HapticFeedback', () => {
  let vibrate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
  });

  afterEach(() => {
    delete (navigator as { vibrate?: unknown }).vibrate;
    delete (globalThis as { Capacitor?: unknown }).Capacitor;
  });

  it('vibrates briefly in a browser, longer for a wrong answer', () => {
    const haptics = TestBed.inject(HapticFeedback);
    haptics.answer(true);
    haptics.answer(false);
    expect(vibrate.mock.calls).toEqual([[18], [[30, 40, 30]]]);
  });

  it('stays silent for celebrations in a browser', () => {
    TestBed.inject(HapticFeedback).celebrate();
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('survives a browser that throws on vibrate', () => {
    vibrate.mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => TestBed.inject(HapticFeedback).answer(true)).not.toThrow();
  });

  it('uses the platform haptics, not navigator.vibrate, in the native shell', async () => {
    (globalThis as { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => true };
    const haptics = TestBed.inject(HapticFeedback);
    expect(() => {
      haptics.answer(true);
      haptics.answer(false);
      haptics.celebrate();
    }).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
});
