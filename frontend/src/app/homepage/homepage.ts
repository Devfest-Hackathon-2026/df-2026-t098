import { DOCUMENT } from '@angular/common';
import { afterNextRender, Component, DestroyRef, inject, Injector, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SyntaxHighlightPipe } from './syntax-highlight.pipe';
import { AuthSession } from '../auth/auth-session';
import { UsernameSetup } from '../auth/username-setup';

type Tab = 'feed' | 'news' | 'profile' | 'discover';
type Difficulty = 'all' | 'beginner' | 'intermediate' | 'advanced';
type AnswerView = 'choice' | 'reason';
type SelfRating = 'got-it' | 'almost' | 'no';
type Language = 'ja' | 'en';
type Theme = 'light' | 'dark';

interface CardText {
  concept: string;
  title: string;
  question: string;
  options: string[];
  solution: string;
}

const COPY = {
  ja: {
    preview: 'プレビュー', lightTheme: 'ライトテーマに切り替え', darkTheme: 'ダークテーマに切り替え', practice: '学習', card: (n: number, total: number) => `カード ${n} / ${total}`,
    reviewCard: '復習用のサンプル', progressTitle: 'この端末の学習状況', progressSaved: '回答と入力した理由は、この端末にのみ保存されます。説明の採点や同期には対応していません。', progressSession: '保存できないため、この画面を開いている間のみ記録されます。', progressAttempted: '回答済み', progressPeeked: '解答を見た', progressPending: '未回答', progressDraft: '入力中', progressReview: '復習', clearProgress: '学習履歴を消去', confirmClear: '本当に消去する', cancelClear: 'キャンセル', clearError: '履歴を消去できませんでした。端末の保存設定を確認してください。', progressNote: 'これはサンプルの学習履歴です。習熟度はまだ判定されません。',
    codeExample: 'コード例', yourAnswer: 'あなたの回答', viewSolution: '解答を見る', answerSection: '回答の入力方法',
    choose: '選択肢', yourWhy: '理由を説明', chooseExplanation: '正しい説明を選んでください',
    reasonLabel: '選んだ理由を自分の言葉で説明してください', reasonPlaceholder: 'なぜそう思いますか？',
    reasonNote: 'このプレビューでは、説明は採点されません。', solution: '解答', peeked: '解答を見た', attempted: '回答済み',
    correct: '選択肢は正解です。', incorrect: '選択肢は不正解です。', yourExplanation: 'あなたの説明',
    previewNote: 'このプレビューでは選択肢のみ判定されます。説明は採点されません。',
    rating: '理解できましたか？', optional: '任意', gotIt: 'わかった', almost: 'あと少し', no: 'まだ',
    continue: 'スクロールして続ける', end: 'プレビューはここまで', previous: '前へ', next: '次へ', backToFirst: '最初へ戻る',
    news: 'ニュース', newsIntro: '気になる話題を、もっと深く。', newsTitle: '準備中です。',
    newsBody: '厳選した記事と出典をここに掲載する予定です。それまではフィードをお楽しみください。',
    profile: 'プロフィール', changeLearning: '学習対象を変更', profileIntro: '理解を少しずつ積み重ねよう。', profileTitle: 'ここから始まります。',
    account: 'アカウント', accountLoading: 'アカウントを確認しています…', accountGuest: 'ログインすると、アカウント情報を確認できます。', accountSignIn: 'Googleでログイン', accountUnavailable: 'アカウント情報を取得できませんでした。', accountRetry: '再試行',
    signOut: 'ログアウト', signingOut: 'ログアウト中…', signOutError: 'ログアウトできませんでした。もう一度お試しください。',
    profileBody: '進捗管理が使えるようになると、概念ごとの習熟度や弱点がここに表示されます。',
    backToPractice: '学習に戻る', navigation: 'メインナビゲーション', feed: 'フィード',
    save: '保存', saved: '保存済み', removeSaved: '保存を解除', savedTitle: '保存した問題', savedEmpty: '気になる問題を保存すると、ここからいつでも見返せます。', savedLocal: '保存した問題はこの端末にのみ保存されます。', savedSession: '保存できないため、この画面を開いている間のみ保持されます。', openSaved: '問題を開く',
    menu: 'メニュー', discover: '学ぶトピックを探す', discoverIntro: '言語や概念で絞り込んで、学びたいトピックを見つけましょう。', search: '言語や概念を検索', languages: '言語', difficulty: '難易度', concepts: '概念', all: 'すべて', beginner: '初級', intermediate: '中級', advanced: '上級', learn: 'この条件で学ぶ', noConcepts: '条件に合うトピックがありません。', noCards: '条件に合う問題がありません。条件を変えてお試しください。', editFilters: '条件を変更', sampleLevel: '現在のサンプル問題は初級として表示しています。', count: (n: number) => `${n}問`,
  },
  en: {
    preview: 'Early preview', lightTheme: 'Switch to light theme', darkTheme: 'Switch to dark theme', practice: 'Practice', card: (n: number, total: number) => `Card ${n} of ${total}`,
    reviewCard: 'Sample review card', progressTitle: 'Progress on this device', progressSaved: 'Answers and explanations stay on this device. They are not synced, and explanations are not graded.', progressSession: 'Storage is unavailable, so progress lasts only for this session.', progressAttempted: 'Attempted', progressPeeked: 'Peeked', progressPending: 'Not answered', progressDraft: 'In progress', progressReview: 'Review', clearProgress: 'Clear practice history', confirmClear: 'Confirm clear', cancelClear: 'Cancel', clearError: 'Could not clear history. Check this device’s storage settings.', progressNote: 'This is sample practice history. Mastery is not assessed yet.',
    codeExample: 'Code example', yourAnswer: 'Your answer', viewSolution: 'View solution', answerSection: 'Answer section',
    choose: 'Choose', yourWhy: 'Your why', chooseExplanation: 'Choose an explanation',
    reasonLabel: 'Explain your choice in your own words', reasonPlaceholder: 'What’s your reasoning?',
    reasonNote: 'Your explanation won’t be graded in this preview.', solution: 'Solution', peeked: 'Peeked', attempted: 'Attempted',
    correct: 'Your choice is right.', incorrect: 'Your choice isn’t quite right.', yourExplanation: 'Your explanation',
    previewNote: 'Choices can be checked in this preview. Explanations aren’t graded.',
    rating: 'How did it feel?', optional: 'Optional', gotIt: 'Got it', almost: 'Almost', no: 'No',
    continue: 'Scroll to continue', end: 'End of preview', previous: 'Previous', next: 'Next', backToFirst: 'Back to first',
    news: 'News', newsIntro: 'Good ideas are worth looking into.', newsTitle: 'Coming into focus.',
    newsBody: 'Curated reads and their sources will live here. For now, there’s plenty to explore in the feed.',
    profile: 'Profile', changeLearning: 'Change learning target', profileIntro: 'Make space for what you know.', profileTitle: 'Your map starts here.',
    account: 'Account', accountLoading: 'Checking your account…', accountGuest: 'Sign in to see your account details.', accountSignIn: 'Sign in with Google', accountUnavailable: 'Could not load your account.', accountRetry: 'Try again',
    signOut: 'Sign out', signingOut: 'Signing out…', signOutError: 'Could not sign out. Please try again.',
    profileBody: 'Your concept gaps and mastery will show up here once progress tracking is connected.',
    backToPractice: 'Back to practice', navigation: 'Main navigation', feed: 'Feed',
    save: 'Save', saved: 'Saved', removeSaved: 'Remove saved question', savedTitle: 'Saved questions', savedEmpty: 'Save a question to find it here later.', savedLocal: 'Saved questions stay on this device.', savedSession: 'Storage is unavailable, so saved questions last only for this session.', openSaved: 'Open question',
    menu: 'Menu', discover: 'Explore topics', discoverIntro: 'Find something to learn by language or concept.', search: 'Search languages or concepts', languages: 'Language', difficulty: 'Difficulty', concepts: 'Concepts', all: 'All', beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced', learn: 'Practice with these filters', noConcepts: 'No topics match these filters.', noCards: 'No questions match these filters. Try changing them.', editFilters: 'Change filters', sampleLevel: 'Current sample questions are shown as beginner level.', count: (n: number) => `${n} questions`,
  },
} as const;

interface Card extends CardText {
  id: string;
  reviewOf?: string;
  language: string;
  code: string;
  answer: number;
  ja: CardText;
}

@Component({
  selector: 'app-homepage',
  imports: [FormsModule, RouterLink, SyntaxHighlightPipe, UsernameSetup],
  templateUrl: './homepage.html',
  styleUrls: ['./homepage.css', './discover.css'],
})
export class Homepage {
  private readonly document = inject(DOCUMENT);
  protected readonly authSession = inject(AuthSession);
  protected readonly failedAvatarUrl = signal<string | null>(null);
  protected readonly signOutFailed = signal(false);
  private readonly progressKey = 'whylint-preview-progress-v1';
  private readonly savedKey = 'whylint-saved-cards-v1';
  protected readonly savedIds = signal<string[]>([]);
  protected readonly savedStorageAvailable = signal(true);
  protected readonly progressStorageAvailable = signal(true);
  protected readonly clearRequested = signal(false);
  protected readonly clearError = signal(false);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly systemTheme = this.document.defaultView?.matchMedia?.('(prefers-color-scheme: light)');
  private readonly storedTheme = this.readStoredTheme();
  private hasThemePreference = this.storedTheme !== null;
  protected readonly theme = signal<Theme>(this.storedTheme ?? (this.systemTheme?.matches ? 'light' : 'dark'));
  protected readonly tab = signal<Tab>('feed');
  protected readonly activeCardIndex = signal(0);
  protected readonly menuOpen = signal(false);
  protected readonly searchQuery = signal('');
  protected readonly selectedLanguage = signal('all');
  protected readonly selectedDifficulty = signal<Difficulty>('all');
  protected readonly selectedConcept = signal<string | null>(null);
  protected readonly appliedFilters = signal<{ language: string; difficulty: Difficulty; concept: string | null }>({ language: 'all', difficulty: 'all', concept: null });
  protected readonly languages = ['all', 'JavaScript', 'Python', 'SQL'];
  protected readonly difficulties: Difficulty[] = ['all', 'beginner', 'intermediate', 'advanced'];
  protected readonly language = signal<Language>(this.readStoredLanguage());
  protected get ui() { return COPY[this.language()]; }

  constructor() {
    this.applyTheme(this.theme());
    this.applyLanguage(this.language());
    this.restoreProgress();
    this.restoreSaved();
    const onSystemThemeChange = (event: MediaQueryListEvent) => {
      if (!this.hasThemePreference) {
        const theme = event.matches ? 'light' : 'dark';
        this.theme.set(theme);
        this.applyTheme(theme);
      }
    };
    this.systemTheme?.addEventListener?.('change', onSystemThemeChange);
    this.destroyRef.onDestroy(() => this.systemTheme?.removeEventListener?.('change', onSystemThemeChange));
  }

  protected async signOut(): Promise<void> {
    if (this.authSession.loggingOut()) return;
    this.signOutFailed.set(false);
    if (!await this.authSession.logout()) this.signOutFailed.set(true);
    else this.failedAvatarUrl.set(null);
  }

  protected toggleTheme(): void {
    const theme = this.theme() === 'dark' ? 'light' : 'dark';
    this.theme.set(theme);
    this.hasThemePreference = true;
    this.applyTheme(theme);
    try {
      this.document.defaultView?.localStorage.setItem('whylint-theme', theme);
    } catch {
      // The current session still works when storage is unavailable.
    }
  }

  private readStoredTheme(): Theme | null {
    try {
      const value = this.document.defaultView?.localStorage.getItem('whylint-theme');
      return value === 'light' || value === 'dark' ? value : null;
    } catch {
      return null;
    }
  }

  private applyTheme(theme: Theme): void {
    this.document.documentElement.dataset['theme'] = theme;
    this.document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f3f5f0' : '#080808');
  }

  protected toggleLanguage(): void {
    const next = this.language() === 'ja' ? 'en' : 'ja';
    this.language.set(next);
    this.applyLanguage(next);
    try { this.document.defaultView?.localStorage.setItem('whylint-language', next); } catch { /* Keep the session setting. */ }
  }

  private readStoredLanguage(): Language {
    try { return this.document.defaultView?.localStorage.getItem('whylint-language') === 'en' ? 'en' : 'ja'; } catch { return 'ja'; }
  }

  private applyLanguage(next: Language): void {
    this.document.documentElement.lang = next;
    this.document.title = next === 'ja' ? 'WhyLint — コードの「なぜ」を学ぼう' : 'WhyLint — Understand what you ship';
  }

  protected readonly cards: Card[] = [
    {
      id: 'closures', concept: 'Closures', language: 'JavaScript', title: 'A little closure',
      ja: {
        concept: 'クロージャ', title: 'クロージャの仕組み',
        question: 'なぜ count の値は次の呼び出しでも保持される？',
        options: ['返された関数が、外側のスコープを覚えているから。', '最初の呼び出し後、count がグローバル変数になるから。', '呼び出すたびに makeCounter が実行されるから。'],
        solution: 'increment はクロージャを通じて count を参照しています。makeCounter が終了した後も同じ変数にアクセスでき、呼び出すたびに値が更新されます。',
      },
      code: `function makeCounter() {\n  let count = 0;\n\n  return function increment() {\n    count += 1;\n    return count;\n  };\n}\n\nconst next = makeCounter();\nnext(); // 1\nnext(); // 2`,
      question: 'Why does count keep its value between calls?',
      options: [
        'The returned function remembers its outer scope.',
        'The count variable becomes global after the first call.',
        'JavaScript reruns makeCounter on every call.',
      ],
      answer: 0,
      solution: 'increment closes over count. The same variable stays accessible after makeCounter returns, so each call updates it.',
    },
    {
      id: 'async', concept: 'Async & promises', language: 'JavaScript', title: 'The order of things',
      ja: {
        concept: '非同期と Promise', title: '実行される順番',
        question: 'なぜ「second」より先に「third」が表示されるのでしょう？',
        options: ['Promise のコールバックは、現在の同期処理が終わるまで待つから。', 'Promise のコールバックは別のスレッドで実行されるから。', 'console.log は常に Promise の作成より先に実行されるから。'],
        solution: 'Promise のコールバックはマイクロタスクとしてキューに入り、現在の同期処理が終わった後に実行されます。',
      },
      code: `console.log('first');\n\nPromise.resolve().then(() => {\n  console.log('second');\n});\n\nconsole.log('third');`,
      question: 'Why does “third” appear before “second”?',
      options: [
        'Promise callbacks wait until the current synchronous code finishes.',
        'Promises run their callbacks on a separate thread.',
        'console.log always runs before a promise is created.',
      ],
      answer: 0,
      solution: 'The promise callback is queued as a microtask. It runs after the current synchronous code has finished.',
    },
    {
      id: 'arrays', concept: 'State & rendering', language: 'JavaScript', title: 'A fresh reference',
      ja: {
        concept: '状態とレンダリング', title: '新しい参照',
        question: 'なぜ、元の配列は変わらないのでしょう？',
        options: ['スプレッド構文で、要素を新しい配列にコピーしているから。', '配列は一度作ると変更できないから。', '両方の変数が、更新された同じ配列を参照しているから。'],
        solution: '配列リテラルが新しい配列を作り、スプレッド構文が元の要素をコピーします。元の配列は変更されません。',
      },
      code: `const original = [1, 2, 3];\nconst updated = [...original, 4];\n\nconsole.log(original); // [1, 2, 3]\nconsole.log(updated);  // [1, 2, 3, 4]`,
      question: 'Why does the original array stay unchanged?',
      options: [
        'The spread syntax copies the elements into a new array.',
        'Arrays cannot be changed after they are created.',
        'Both variables point to the same updated array.',
      ],
      answer: 0,
      solution: 'The array literal creates a new array and spread copies the existing elements into it. The original array is not mutated.',
    },
  ];

  private readonly reviewCards: Record<string, Card> = {
    closures: {
      id: 'closures-review', reviewOf: 'closures', concept: 'Closures', language: 'JavaScript', title: 'Remember the total',
      code: `function makeAdder() {\n  let total = 0;\n  return (amount) => {\n    total += amount;\n    return total;\n  };\n}\nconst add = makeAdder();\nadd(2); // 2\nadd(3); // 5`,
      question: 'Why does the second call return 5?',
      options: ['The returned function keeps access to the same total.', 'A new total is created on every call.', 'The value of total is stored globally.'],
      answer: 0, solution: 'The returned function closes over total, so both calls update the same variable.',
      ja: { concept: 'クロージャ', title: '合計を覚える', question: 'なぜ2回目の呼び出しは 5 を返す？',
        options: ['返された関数が同じ total にアクセスし続けるから。', '呼び出すたびに新しい total が作られるから。', 'total がグローバルに保存されるから。'],
        solution: '返された関数は total をクロージャを通じて参照するため、どちらの呼び出しも同じ変数を更新します。' },
    },
    async: {
      id: 'async-review', reviewOf: 'async', concept: 'Async & promises', language: 'JavaScript', title: 'After the current code',
      code: `const output = [];\nPromise.resolve().then(() => {\n  output.push('promise');\n});\noutput.push('sync');\n\n// After the microtask runs:\n// ['sync', 'promise']`,
      question: 'Why is “sync” added first?',
      options: ['The promise callback runs after the synchronous code.', 'The promise callback is executed in a new thread.', 'Array updates cannot happen inside promises.'],
      answer: 0, solution: 'The callback is queued as a microtask and runs after the current synchronous code.',
      ja: { concept: '非同期と Promise', title: '同期処理の後で', question: 'なぜ「sync」が先に追加される？',
        options: ['Promise のコールバックは同期処理の後に実行されるから。', 'Promise のコールバックは新しいスレッドで実行されるから。', 'Promise の中では配列を更新できないから。'],
        solution: 'コールバックはマイクロタスクとしてキューに入り、現在の同期処理が終わってから実行されます。' },
    },
    arrays: {
      id: 'arrays-review', reviewOf: 'arrays', concept: 'State & rendering', language: 'JavaScript', title: 'Copy before changing',
      code: `const original = ['a', 'b'];\nconst copy = original.slice();\ncopy.push('c');\n\nconsole.log(original); // ['a', 'b']\nconsole.log(copy); // ['a', 'b', 'c']`,
      question: 'Why does original still have two items?',
      options: ['slice creates a new array before the change.', 'push changes all arrays with the same contents.', 'Arrays become immutable after slice is called.'],
      answer: 0, solution: 'slice creates a shallow copy, so pushing to the new array does not change the original array.',
      ja: { concept: '状態とレンダリング', title: '変更する前にコピー', question: 'なぜ original は2要素のまま？',
        options: ['変更する前に slice で新しい配列を作っているから。', 'push は同じ内容の配列をすべて変更するから。', 'slice を呼ぶと配列が変更できなくなるから。'],
        solution: 'slice は浅いコピーを作るため、新しい配列への push は元の配列を変更しません。' },
    },
  };

  protected get feedCards(): { card: Card; index: number }[] {
    const filter = this.appliedFilters();
    return this.cards.map((card, index) => ({ card, index })).filter(({ card }) =>
      (filter.language === 'all' || card.language === filter.language) &&
      (filter.difficulty === 'all' || filter.difficulty === 'beginner') &&
      (!filter.concept || (card.reviewOf ?? card.id) === filter.concept));
  }

  protected get availableConcepts(): { card: Card; count: number }[] {
    const query = this.searchQuery().trim().toLocaleLowerCase();
    return this.cards.filter((card) => !card.reviewOf).filter((card) => {
      const text = this.language() === 'ja' ? card.ja : card;
      const matchesQuery = !query || [card.language, card.concept, card.ja.concept, text.title].some((value) => value.toLocaleLowerCase().includes(query));
      return matchesQuery && (this.selectedLanguage() === 'all' || card.language === this.selectedLanguage()) && (this.selectedDifficulty() === 'all' || this.selectedDifficulty() === 'beginner');
    }).map((card) => ({ card, count: this.cards.filter((item) => item.id === card.id || item.reviewOf === card.id).length }));
  }

  protected selectLanguage(value: string): void {
    this.selectedLanguage.set(value);
    this.selectedConcept.set(null);
  }

  protected selectDifficulty(value: Difficulty): void {
    this.selectedDifficulty.set(value);
    this.selectedConcept.set(null);
  }

  protected applyFilters(feed: HTMLElement): void {
    this.appliedFilters.set({ language: this.selectedLanguage(), difficulty: this.selectedDifficulty(), concept: this.selectedConcept() });
    this.openTab('feed', feed);
  }

  protected get savedCards(): Card[] {
    const available = [...this.cards.filter((card) => !card.reviewOf), ...Object.values(this.reviewCards)];
    return this.savedIds().flatMap((id) => {
      const card = available.find((item) => item.id === id);
      return card ? [card] : [];
    });
  }

  protected toggleSaved(id: string): void {
    this.savedIds.update((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]);
    try {
      const storage = this.document.defaultView?.localStorage;
      if (!storage) throw new Error('Storage unavailable');
      storage.setItem(this.savedKey, JSON.stringify(this.savedIds()));
      this.savedStorageAvailable.set(true);
    } catch {
      this.savedStorageAvailable.set(false);
    }
  }

  private restoreSaved(): void {
    try {
      const storage = this.document.defaultView?.localStorage;
      if (!storage) throw new Error('Storage unavailable');
      const raw = storage.getItem(this.savedKey);
      if (!raw) return;
      const ids: unknown = JSON.parse(raw);
      if (Array.isArray(ids)) {
        const known = [...this.cards, ...Object.values(this.reviewCards)].map((card) => card.id);
        this.savedIds.set([...new Set(ids.filter((id): id is string => typeof id === 'string' && known.includes(id)))]);
      }
    } catch {
      this.savedStorageAvailable.set(false);
    }
  }

  protected openSavedCard(card: Card, feed: HTMLElement): void {
    if (card.reviewOf) this.addReview(card.reviewOf);
    this.appliedFilters.set({ language: 'all', difficulty: 'all', concept: null });
    const index = this.cards.findIndex((item) => item.id === card.id);
    if (index < 0) return;
    this.tab.set('feed');
    this.activeCardIndex.set(index);
    afterNextRender(() => {
      const target = feed.querySelector<HTMLElement>(`#card-${index}`);
      if (target) feed.scrollTop += target.getBoundingClientRect().top - feed.getBoundingClientRect().top;
      this.document.querySelector<HTMLElement>('.feed-question')?.focus({ preventScroll: true });
    }, { injector: this.injector });
  }

  // Preview progress is local to this device and never implies mastery.
  protected readonly states = this.cards.map(() => this.emptyState());

  private emptyState() {
    return { selected: null as number | null, revealed: false, peeked: false, reason: '', view: 'choice' as AnswerView, rating: null as SelfRating | null };
  }

  protected selectAnswer(index: number, choice: number): void {
    this.states[index].selected = choice;
    this.saveProgress();
  }

  protected setReason(index: number, reason: string): void {
    this.states[index].reason = reason;
    this.saveProgress();
  }

  protected setRating(index: number, rating: SelfRating): void {
    this.states[index].rating = rating;
    this.saveProgress();
  }

  protected reveal(index: number): void {
    const state = this.states[index];
    state.peeked = state.selected === null && !state.reason.trim();
    state.revealed = true;
    if (state.peeked) this.addReview(this.cards[index].id);
    this.saveProgress();
  }

  private addReview(id: string): void {
    const review = this.reviewCards[id];
    if (review && !this.cards.some((card) => card.id === review.id)) {
      this.cards.push(review);
      this.states.push(this.emptyState());
    }
  }

  private saveProgress(): void {
    try {
      const storage = this.document.defaultView?.localStorage;
      if (!storage) throw new Error('Storage unavailable');
      const records = Object.fromEntries(this.cards.map((card, index) => [card.id, this.states[index]]));
      storage.setItem(this.progressKey, JSON.stringify(records));
      this.progressStorageAvailable.set(true);
    } catch {
      this.progressStorageAvailable.set(false);
    }
  }

  protected clearProgress(): void {
    try {
      this.document.defaultView?.localStorage.removeItem(this.progressKey);
      for (let index = this.cards.length - 1; index >= 0; index--) {
        if (this.cards[index].reviewOf) {
          this.cards.splice(index, 1);
          this.states.splice(index, 1);
        } else {
          Object.assign(this.states[index], this.emptyState());
        }
      }
      this.clearError.set(false);
      this.clearRequested.set(false);
    } catch {
      this.clearError.set(true);
    }
  }

  private restoreProgress(): void {
    try {
      const storage = this.document.defaultView?.localStorage;
      if (!storage) throw new Error('Storage unavailable');
      const raw = storage.getItem(this.progressKey);
      if (!raw) return;
      let records: unknown;
      try {
        records = JSON.parse(raw);
      } catch {
        return;
      }
      if (!records || typeof records !== 'object' || Array.isArray(records)) return;
      const entries = records as Record<string, unknown>;
      // Recreate review cards in the order they were originally added.
      for (const id of Object.keys(entries)) {
        const review = Object.values(this.reviewCards).find((card) => card.id === id);
        if (!review?.reviewOf) continue;
        const original = entries[review.reviewOf];
        if (original && typeof original === 'object' && (original as { revealed?: unknown }).revealed === true && (original as { peeked?: unknown }).peeked === true) this.addReview(review.reviewOf);
      }
      for (const card of [...this.cards]) {
        const saved = entries[card.id];
        if (saved && typeof saved === 'object' && (saved as { revealed?: unknown }).revealed === true && (saved as { peeked?: unknown }).peeked === true) this.addReview(card.id);
      }
      this.cards.forEach((card, index) => {
        const saved = entries[card.id];
        if (!saved || typeof saved !== 'object') return;
        const record = saved as Record<string, unknown>;
        const state = this.states[index];
        if (typeof record['selected'] === 'number' && Number.isInteger(record['selected']) && record['selected'] >= 0 && record['selected'] < card.options.length) state.selected = record['selected'];
        if (typeof record['reason'] === 'string') state.reason = record['reason'];
        state.revealed = record['revealed'] === true;
        state.peeked = state.revealed && record['peeked'] === true;
        if (record['view'] === 'choice' || record['view'] === 'reason') state.view = record['view'];
        if (record['rating'] === 'got-it' || record['rating'] === 'almost' || record['rating'] === 'no') state.rating = record['rating'];
      });
    } catch {
      this.progressStorageAvailable.set(false);
    }
  }

  protected openTab(tab: Tab, feed: HTMLElement): void {
    this.menuOpen.set(false);
    if (this.tab() === tab) return;
    feed.scrollTop = 0;
    this.tab.set(tab);
    if (tab === 'feed') this.activeCardIndex.set(0);
  }

  protected onFeedScroll(feed: HTMLElement): void {
    if (this.tab() !== 'feed') return;
    const top = feed.getBoundingClientRect().top + 2;
    const slides = feed.querySelectorAll<HTMLElement>('.feed-slide');
    let current = 0;
    slides.forEach((slide, index) => {
      if (slide.getBoundingClientRect().top <= top) current = index;
    });
    this.activeCardIndex.set(current);
  }

  protected goToCard(index: number, feed: HTMLElement, event: MouseEvent): void {
    const target = feed.querySelectorAll<HTMLElement>('.feed-slide')[index];
    if (!target) return;
    const top = target.getBoundingClientRect().top - feed.getBoundingClientRect().top + feed.scrollTop;
    const reduceMotion = this.document.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const keyboardOrAssistive = event.detail === 0;
    feed.scrollTo({ top, behavior: reduceMotion || keyboardOrAssistive ? 'instant' : 'smooth' });
    if (keyboardOrAssistive) {
      this.activeCardIndex.set(index);
      afterNextRender(() => this.document.querySelector<HTMLElement>('.feed-question')?.focus({ preventScroll: true }), { injector: this.injector });
    }
  }
}
