import { Injectable } from '@angular/core';
import { isNativePlatform } from './platform';

/**
 * Touch feedback. The native shell uses the platform's haptic engine (iOS has no
 * `navigator.vibrate`); browsers keep the short vibration where it exists. All of it is optional:
 * a missing plugin or an unsupported device never reaches the learner.
 */
@Injectable({ providedIn: 'root' })
export class HapticFeedback {
  /** A light tick for a right answer, a double buzz for a wrong one. */
  answer(correct: boolean): void {
    if (isNativePlatform()) {
      void this.native(async ({ Haptics, ImpactStyle, NotificationType }) => {
        if (correct) await Haptics.impact({ style: ImpactStyle.Light });
        else await Haptics.notification({ type: NotificationType.Warning });
      });
      return;
    }
    try {
      navigator.vibrate?.(correct ? 18 : [30, 40, 30]);
    } catch {
      /* Haptics are optional. */
    }
  }

  /** A success pattern for a level, badge, combo or daily goal. Native only. */
  celebrate(): void {
    if (!isNativePlatform()) return;
    void this.native(({ Haptics, NotificationType }) =>
      Haptics.notification({ type: NotificationType.Success }),
    );
  }

  private async native(run: (plugin: typeof import('@capacitor/haptics')) => Promise<void>) {
    try {
      await run(await import('@capacitor/haptics'));
    } catch {
      /* Haptics are optional. */
    }
  }
}
