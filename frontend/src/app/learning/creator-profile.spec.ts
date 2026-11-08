import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { CreatorProfilePage } from './creator-profile';
import { LearningApi, LearningError } from './learning-api';
import type { CreatorProfile } from './learning.types';

describe('Public creator profile', () => {
  const get = vi.fn();
  const params = new BehaviorSubject(convertToParamMap({ id: 'creator-1' }));
  const profile: CreatorProfile = {
    creator: { id: 'creator-1', displayName: 'A helpful learner', avatarUrl: null },
    counts: { questions: 0, explanations: 1, helpful: 3 },
    questions: [],
    explanations: [
      {
        id: 'explanation-1',
        questionId: 'question-1',
        questionTitle: 'Why use a variable?',
        text: 'A name lets me reuse the same value.',
        kind: 'explanation',
        helpfulCount: 3,
        author: { id: 'creator-1', displayName: 'A helpful learner', avatarUrl: null },
        createdAt: '2026-11-08T00:00:00Z',
      },
    ],
  };

  beforeEach(() => {
    localStorage.clear();
    params.next(convertToParamMap({ id: 'creator-1' }));
    get.mockReset().mockResolvedValue(profile);
    TestBed.configureTestingModule({
      imports: [CreatorProfilePage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: params.asObservable() } },
        { provide: LearningApi, useValue: { get } },
      ],
    });
  });

  it('renders public contributions and links back to their question', async () => {
    get.mockResolvedValueOnce({ ...profile, email: 'private@example.test', score: 4 });
    const fixture = TestBed.createComponent(CreatorProfilePage);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(get).toHaveBeenCalledWith('/creators/creator-1', expect.any(AbortSignal));
    expect(root.querySelector('h1')?.textContent).toBe('A helpful learner');
    expect(root.textContent).toContain('A name lets me reuse the same value.');
    expect(root.textContent).not.toContain('private@example.test');
    expect(root.querySelector('.creator-contributions a')?.getAttribute('href')).toBe(
      '/questions/question-1',
    );
  });

  it('ignores a previous profile response after changing creator', async () => {
    let resolve!: (value: CreatorProfile) => void;
    get.mockReturnValueOnce(new Promise<CreatorProfile>((done) => (resolve = done)));
    const fixture = TestBed.createComponent(CreatorProfilePage);
    await fixture.whenStable();
    params.next(convertToParamMap({ id: 'creator-2' }));
    get.mockResolvedValue({
      ...profile,
      creator: { ...profile.creator, displayName: 'Second creator' },
    });
    await fixture.whenStable();
    resolve(profile);
    await Promise.resolve();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('h1')?.textContent).toBe('Second creator');
    expect(get.mock.calls[0][1].aborted).toBe(true);
  });

  it('offers retry after a failed profile request', async () => {
    get.mockRejectedValueOnce(new LearningError(503, 'UNAVAILABLE'));
    const fixture = TestBed.createComponent(CreatorProfilePage);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[role="alert"]')).not.toBeNull();
    root.querySelector<HTMLButtonElement>('.creator-retry')!.click();
    await fixture.whenStable();
    expect(root.querySelector('h1')?.textContent).toBe('A helpful learner');
  });
});
