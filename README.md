# WhyLint

**Doomscroll, but every swipe teaches you something.**

[日本語](#日本語) · [English](#english)

## 日本語

WhyLint は、技術について「なぜ」「どうして」を説明する力を育てる学習フィードです。
プログラミング言語やフレームワークに加え、JWT、HTTP、マイクロサービスなどの
共通の技術概念も扱います。GDGoC Japan DevFest 2026 Hackathon の教育カテゴリ向けに開発しています。

### 学習の流れ

1. 興味のある分野を選ぶか、スキップしてすぐ始めます。ログインなしでも答えられます。
2. 1枚ごとに数秒で答えるタップクイズです。4択・○×・出力予想・バグのある行をタップの4形式があります。
   正誤と一言解説がすぐに表示されます。最初のカードは事前生成した問題プールから即座に表示されます。
3. その間に Gemini があなた向けの5問を作成し、フィードに追加します。
   Gemini が混み合っているときは、問題プールで学習を続けられます。
4. 「なぜ？を説明する」で自分の言葉で説明すると、Gemini が0〜10点で採点します（8点以上で合格、+15 XP）。
   「まだモヤモヤ？」から Gemini に追加質問もできます。
5. 間違えた問題は数枚後にもう一度出題されます。その場で解き直さなかった問題は「復習」に保存され、
   正解するまで毎朝9時（日本時間）にフィードへ戻ってきます。同じ考え方の問題が続けて出ないよう、
   出題済みの問題と概念（concept）が重ならない問題を選びます。
   正答率に合わせて難易度が自動で上下し、各カードには出題理由が表示されます。
6. XP、レベル、連続日数、今日の目標、コンボを画面上部に表示します。
   毎日全員共通の「今日のバグ」、分野ごとの理解度レーダー、実績、週間ランキングがあります。

ユーザーも問題と参考解説を投稿できます。AIによる確認を通った問題は公開され、
他のユーザーのフィードにも表示されます。いいね、コメント、保存、共有に対応します。
プロフィールには目標や実績、保存した問題、復習する問題を表示します。

### 共有して学ぶ

- 採点後の「自分の説明を共有」で文章を見直し、「説明を公開」で公開できます。
  公開した説明は元の問題のコメント欄と公開プロフィールに表示されます。
- コメント・説明・質問・訂正の投稿、1階層の返信、「参考になった」に対応します。
  投稿者は自分の投稿を削除できます。返信がある親投稿には削除済みの表示を残します。
- 投稿者名から公開プロフィールを開き、公開した質問・説明と受け取った「参考になった」を確認できます。
  自分の公開プロフィールはプロフィール画面からも開けます。
- 「参考資料」には、用意された公式ドキュメントへのリンクを表示します。
  ログインすると「問題を報告」から誤り、不明瞭な表現、古い情報を報告できます。
  報告はチームが確認するための非公開キューに保存します。

公開プロフィールには表示名・画像と公開した投稿・集計を表示します。
採点用の回答、AIフィードバック、点数、復習一覧は本人向けの学習情報です。
共有の対象は、編集して「説明を公開」で送信した文章です。

### 現在の開発範囲

このリポジトリにはAngular、NestJS、PostgreSQL/TypeORMの実装とテストが含まれます。
Googleログイン、メール・ユーザー名での認証、取り消し可能なセッションを使用します。
学習エンジンの仕様は [specs.md](specs.md) に記載しています。

Geminiの実接続はAPIキーとモデルの設定後に検証します。自動テストでは外部AIの応答を
テスト用フィクスチャに置き換え、実際のバックエンドと一時的なPostgreSQLを使用します。
Capacitor実機とGoogle Cloud Runへのデプロイは別途検証が必要です。
コンテナ（アプリとAPIを同一オリジンで配信）の手順は [docs/deployment.md](docs/deployment.md) を参照してください。
iOS/AndroidアプリはCapacitorで動作します。手順と検証状況は [docs/mobile.md](docs/mobile.md) を参照してください。

### ローカル起動

Node.js 24.15以降、npm、PostgreSQLを使用します。環境設定とマイグレーションは
[backend/README.md](backend/README.md) を参照してください。

バックエンド用のターミナルで実行します。

```sh
cd backend
npm ci
npm run migration:run
npm run start:dev
```

フロントエンド用の別ターミナルで実行します。

```sh
cd frontend
npm ci
npm run start:auth
```

ブラウザは http://localhost:4200、APIは http://localhost:3000/api/v1 です。
実際の認証情報はローカル環境で管理してください。

## English

WhyLint is a scrolling technology education feed built around explaining **why and how things work**.
Learners choose interests, languages, frameworks, and a starting difficulty. General concepts such
as JWT, HTTP, networking, and microservices are available across technology preferences.

### The learning loop

- Every scroll is a tap quiz answered in seconds: multiple choice, true/false, predict the output, or tap the buggy line. The right answer and a one-line explanation appear instantly.
- Start without an account. The first cards come instantly from a pre-generated question pool, and Gemini writes personalized batches in the background. If Gemini is busy, the pool keeps the feed going.
- Go deeper with **Explain why**: write an explanation in your own words and Gemini scores it from 0 to 10 (8 passes, +15 XP). Use **Still confused? Ask Gemini** for a short tutor answer.
- Missed cards come back a few cards later. Anything not solved then is kept in Practice and returns to the feed every morning at 9:00 (Japan time) until it is answered correctly. Questions are tagged with a canonical concept, so the feed avoids serving reworded repeats of ideas the learner has already seen. Difficulty adapts to recent accuracy, and each card says why it was chosen.
- A HUD shows streak, daily goal, level and combo. There is a shared daily Bug of the Day and a mastery radar by area.
- Work toward five questions a day, earn XP and levels, keep a learning streak, unlock achievements, and join a weekly leaderboard.
- Publish technical questions with a reference explanation. Reviewed community questions can reach other learners.
- Like, comment on, save, and share questions through stable links.

Ranked XP is capped per question. Goals, streaks, and weekly ranking use Asia/Tokyo calendar dates.
The current API, persistence, retry behavior, and acceptance criteria are defined in [specs.md](specs.md).

### Learn together

- After grading, use **Share my explanation** to revise your own text, then explicitly
  **Publish explanation**. It appears in the original question's discussion and your public profile.
- Contribute a comment, explanation, question, or correction. Add one-level replies and mark
  contributions **Helpful**. Authors can delete their posts; parents with replies show a deleted placeholder.
- Open a creator's public profile from their name to see published questions, shared explanations,
  and Helpful counts. Your signed-in Profile also links to your public contributions.
- Cards show **Further reading** when curated official references are available. Signed-in users
  can report incorrect answers, unclear wording, or outdated information. Reports enter a private
  queue for team review.

Public profiles show display identity and published contributions. Private learning data includes
original attempts, AI feedback, scores, and the practice collection. The sharing action publishes
the revised text you explicitly submit.

### Stack and setup

Angular, Capacitor, NestJS, PostgreSQL, and TypeORM. Cloud Run is the intended backend deployment
platform. Deployment and actual Capacitor device behavior require separate verification.
The repository root `Dockerfile` builds one image that serves the Angular app and the API from the same
origin; see [docs/deployment.md](docs/deployment.md) for its environment, release job, and probes.
The iOS and Android apps are the same Angular code in a Capacitor shell; see [docs/mobile.md](docs/mobile.md).

Both applications live in this repository. Use the backend and frontend commands above.
Backend environment setup is in [backend/README.md](backend/README.md). Gemini generation,
assessment, and publication review require server-side `GEMINI_API_KEY` and `GEMINI_MODEL`.
An unavailable AI provider produces a retryable error. Provider failures do not create failing grades.

### Verification

```sh
npm run build --prefix backend
npm test --prefix backend -- --runInBand
npm run build --prefix frontend
npm test --prefix frontend -- --watch=false
npm run typecheck --prefix e2e
npm run test:backend --prefix e2e
npm test --prefix e2e
```

The browser suite owns port4200 while running. Its real NestJS backend uses port3101 and a disposable
PostgreSQL cluster. Google and Gemini external calls are isolated with test fixtures. Real provider
verification follows configuration of credentials. See [e2e/README.md](e2e/README.md) for setup.

[Organizer repository guidance](docs/organizer-guide.md) · [MIT license](LICENSE)
