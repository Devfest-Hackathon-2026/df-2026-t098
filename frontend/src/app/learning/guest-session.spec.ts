import { TestBed } from '@angular/core/testing';
import { GuestSession } from './guest-session';
import type { TapResult } from './learning.types';

const ID = '73d19468-cfac-45df-914d-da20c0a45ffc';
const other = '48a72346-5684-4d6d-b79d-502bb9579f67';

function tap(questionId: string, correct: boolean): TapResult {
  return {
    questionId,
    choice: correct ? 3 : 0,
    correct,
    correctOption: 3,
    quickExplanation: 'Because.',
    xpAwarded: 0,
    review: false,
    combo: null,
    progress: null,
  };
}

describe('Guest session', () => {
  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('counts answers and keeps the combo across a reload of the same tab', () => {
    const guest = TestBed.inject(GuestSession);
    guest.record(tap(ID, true));
    guest.record(tap(other, true));
    expect(guest.counters).toEqual({ answered: 2, correct: 2, combo: 2 });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const reloaded = TestBed.inject(GuestSession);
    expect(reloaded.counters).toEqual({ answered: 2, correct: 2, combo: 2 });
    expect(reloaded.tapFor(ID)).toEqual({
      choice: 3,
      correct: true,
      correctOption: 3,
      quickExplanation: 'Because.',
    });
    expect(reloaded.answeredIds().sort()).toEqual([ID, other].sort());
  });

  it('resets the combo on a miss', () => {
    const guest = TestBed.inject(GuestSession);
    guest.record(tap(ID, true));
    guest.record(tap(other, false));
    expect(guest.counters).toEqual({ answered: 2, correct: 1, combo: 0 });
  });

  it('keeps a pending transfer for the same account until the server acknowledges it', () => {
    const guest = TestBed.inject(GuestSession);
    guest.record(tap(ID, false));
    guest.record(tap(ID, true));
    const batch = guest.beginImport(ID)!;
    expect(batch.answers).toEqual([{ questionId: ID, choice: 0 }, { questionId: ID, choice: 3 }]);
    expect(guest.counters).toEqual({ answered: 0, correct: 0, combo: 0 });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const reloaded = TestBed.inject(GuestSession);
    expect(reloaded.beginImport(other)).toBeUndefined();
    expect(reloaded.beginImport(ID)).toEqual(batch);
    reloaded.finishImport(ID, batch.requestId);
    expect(reloaded.beginImport(ID)).toBeUndefined();
  });

  it('uses the saved choice for guest sessions created before the answer queue', () => {
    sessionStorage.setItem('whylint-guest-progress', JSON.stringify({
      answered: 1, correct: 1, combo: 1,
      taps: { [ID]: { choice: 3, correct: true, correctOption: 3, quickExplanation: 'Because.' } },
    }));
    expect(TestBed.inject(GuestSession).beginImport(other)?.answers).toEqual([
      { questionId: ID, choice: 3 },
    ]);
  });

  it('treats corrupt storage and bad question ids as a fresh start', () => {
    sessionStorage.setItem('whylint-guest-progress', '{not json');
    const guest = TestBed.inject(GuestSession);
    expect(guest.counters).toEqual({ answered: 0, correct: 0, combo: 0 });
    guest.record(tap('not-a-uuid', true));
    expect(guest.counters.answered).toBe(0);
  });
});
