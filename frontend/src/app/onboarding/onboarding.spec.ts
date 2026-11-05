import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Onboarding } from './onboarding';
import { OnboardingState } from './onboarding-state';

describe('onboarding', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [Onboarding], providers: [provideRouter([])] });
  });
  afterEach(() => localStorage.clear());

  it('validates stored domain and supported stack together', () => {
    const state = TestBed.inject(OnboardingState);
    localStorage.setItem('whylint-onboarding-v1', JSON.stringify({ domain: 'backend', stack: 'javascript', onboardingCompleted: true }));
    expect(state.read()).toBeNull();
    expect(state.save('frontend', 'javascript')).toBe(true);
    expect(state.read()).toEqual({ domain: 'frontend', stack: 'javascript', onboardingCompleted: true });
  });

  it('filters options, preserves selection on back, and clears it when domain changes', async () => {
    const fixture = TestBed.createComponent(Onboarding);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const buttons = () => [...root.querySelectorAll('button')];
    expect((root.querySelector('.primary') as HTMLButtonElement).disabled).toBe(true);
    buttons().find(b => b.textContent?.includes('フロントエンド'))!.click();
    fixture.detectChanges();
    (root.querySelector('.primary') as HTMLButtonElement).click();
    fixture.detectChanges();
    const input = root.querySelector('input')!;
    input.value = 'SCRIPT'; input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(root.querySelectorAll('.stack-list button').length).toBe(2);
    buttons().find(b => b.textContent?.includes('JavaScript'))!.click();
    fixture.detectChanges();
    buttons().find(b => b.classList.contains('back'))!.click();
    fixture.detectChanges();
    (root.querySelector('.primary') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(root.querySelector('.stack-list button.selected')?.textContent).toContain('JavaScript');
    buttons().find(b => b.classList.contains('back'))!.click();
    fixture.detectChanges();
    buttons().find(b => b.textContent?.includes('バックエンド'))!.click();
    fixture.detectChanges();
    (root.querySelector('.primary') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect((root.querySelector('.primary') as HTMLButtonElement).disabled).toBe(true);
    expect(root.querySelector('.stack-list button.selected')).toBeNull();
  });

  it('saves before navigating to the feed', async () => {
    const fixture = TestBed.createComponent(Onboarding);
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    [...root.querySelectorAll('button')].find(b => b.textContent?.includes('フロントエンド'))!.click();
    fixture.detectChanges();
    (root.querySelector('.primary') as HTMLButtonElement).click();
    fixture.detectChanges();
    [...root.querySelectorAll<HTMLButtonElement>('.stack-list button')].find(b => b.textContent?.includes('JavaScript'))!.click();
    fixture.detectChanges();
    (root.querySelector('.primary') as HTMLButtonElement).click();
    expect(TestBed.inject(OnboardingState).read()?.stack).toBe('javascript');
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('searches categories and technologies across domains without enabling unavailable stacks', async () => {
    const fixture = TestBed.createComponent(Onboarding);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const input = root.querySelector<HTMLInputElement>('#category-search')!;
    const search = (value: string) => { input.value = value; input.dispatchEvent(new Event('input')); fixture.detectChanges(); };
    search('sQl');
    const sql = [...root.querySelectorAll<HTMLButtonElement>('.stack-list button')];
    expect(sql.length).toBe(4); // SQL in two categories, PostgreSQL and MySQL.
    expect(sql.every(button => button.disabled)).toBe(true);
    expect(root.textContent).toContain('データベース');
    search('フロント');
    expect(root.querySelectorAll('.domain').length).toBe(1);
    expect(root.querySelector('.domain')?.textContent).toContain('フロントエンド');
    search('no-such-stack');
    expect(root.querySelector('[role="status"]')?.textContent).toContain('一致する候補がありません');
  });

  it('completes directly from an available technology search result', async () => {
    const fixture = TestBed.createComponent(Onboarding);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const input = root.querySelector<HTMLInputElement>('#category-search')!;
    input.value = 'javaScript'; input.dispatchEvent(new Event('input')); fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.stack-list button')!.click();
    expect(TestBed.inject(OnboardingState).read()).toEqual({ domain: 'frontend', stack: 'javascript', onboardingCompleted: true });
    expect(navigate).toHaveBeenCalledWith('/');
  });
});
