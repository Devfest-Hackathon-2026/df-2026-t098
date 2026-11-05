# WhyLint

**Doomscroll, but every swipe makes you a better developer.**

[日本語](#日本語) · [English](#english)

> 提出用リポジトリには、現時点では README と運営の初期ファイルのみが含まれています。アプリのソースコードはまだ含まれていません。
>
> This submission repository currently contains the README and the organizers’ starter files. The application source code has not been added yet.

---

## 日本語

### WhyLint とは

WhyLint は、短いコード問題をスワイプしながら、コードが「なぜ動くのか」を自分の言葉で説明する練習アプリです。

AI が書いたコードは動いていても、その仕組みを説明できるとは限りません。WhyLint は、バグを探すだけでなく、**正しいコードを理解し、説明する力**を鍛えることを目指しています。

GDGoC Japan Devfest 2026 Hackathon の「教育」カテゴリ向けプロジェクトです。テーマは **Own the Why, Build with Intent.**

### 目指す体験

1. フロントエンドまたはバックエンドを選び、自分のスタックに合った問題に挑戦する。
2. コードを読み、正しい説明を選び、自分の言葉で理由を書く。
3. いつでも解答を確認する。回答前に解答を見た場合は記録し、後で同じ概念の類題に挑戦する。
4. プロフィールで概念ごとの学習状況や弱点を確認する。

フィードは TikTok のように続きます。最初に **5 問**を生成し、**4 問目**に到達したら次の 5 問をバックグラウンドで準備する構想です。生成や検証に時間がかかる場合に備え、検証済みの問題バンクもフォールバックとして用意する予定です。

> 学習時間やスワイプ数ではなく、解答を見ずに自分の言葉で説明できることを重視します。

### 現在の状態

**初期プロトタイプを開発中です。**

| 利用できるもの | 状態 |
| --- | --- |
| 縦スクロールのフィード | サンプル問題で動作 |
| 選択肢・理由の入力・解答表示 | 動作。理由の自動採点は未対応 |
| 解答を見た後の類題 | 手書きのサンプルを表示 |
| 学習履歴 | この端末のブラウザ内に保存。プロフィールから消去可能 |
| 表示 | 日本語・英語、ライト・ダークテーマ |

Gemini による問題生成、無限フィード、検証パイプライン、理由の採点、アカウント間の同期、概念別の習熟度マップは **未実装**です。プロフィールはサンプルの学習履歴であり、習熟度を判定しません。バックエンドも現時点では初期構成です。

### 技術スタック

| レイヤー | 技術 | 状態 |
| --- | --- | --- |
| フロントエンド | Angular | 開発中 |
| モバイルアプリ化 | Capacitor | 計画中 |
| バックエンド | NestJS | 初期構成 |
| データベース / ORM | PostgreSQL / TypeORM | 計画中 |
| AI | Gemini | 問題生成・採点補助を計画中 |
| 実行基盤 | Google Cloud Run | NestJS のデプロイ先として計画中。デプロイは未確認 |
| 必要に応じて | Redis / RabbitMQ | キャッシュ / メッセージングの候補 |

### ローカルで動かす

現在、この README は `~/code/hackathon` にあり、アプリのコードは別の `~/code/whylint` にあります。

```text
~/code/
├── hackathon/
│   └── README.md
└── whylint/
    ├── frontend/           # Angular
    ├── backend/            # NestJS
    ├── whylint-prd-ja.md
    └── whylint-prd-en.md
```

必要なもの：Node.js と npm。この環境では Node.js 24 / npm 11 を使用しています。

フロントエンド：

```bash
cd ~/code/whylint/frontend
npm ci
npm start
```

ブラウザで [http://localhost:4200](http://localhost:4200) を開きます。現在の UI プレビューはバックエンドを起動しなくても確認できます。

バックエンドを起動する場合は、別のターミナルで：

```bash
cd ~/code/whylint/backend
npm ci
npm run start:dev
```

バックエンドはデフォルトで `http://localhost:3000` を使用します。フロントエンドとの連携はまだ実装されていません。

フロントエンドのテスト：

```bash
cd ~/code/whylint/frontend
npm test -- --watch=false
```

### PRD

- [日本語 PRD](../whylint/whylint-prd-ja.md)
- [English PRD](../whylint/whylint-prd-en.md)

上記リンクは、この端末の `hackathon` と `whylint` が同じ親ディレクトリにある構成に対応しています。問題の補充枚数は、この README に記載した最新の「5 問ずつ」を優先してください。PRD の該当箇所はまだ更新されていません。

---

## English

### What is WhyLint?

WhyLint is a swipeable feed of short code problems that helps developers practice explaining **why code works** in their own words.

AI can help us ship code quickly, but working code isn't always understood code. WhyLint is designed to build the habit of understanding and explaining what we ship.

Built for the **GDGoC Japan Devfest 2026 Hackathon**, in the Education category. The theme is **Own the Why, Build with Intent.**

### The experience we're building

1. Choose frontend or backend and practice with examples suited to your stack.
2. Read the code, choose an explanation, and write the reason in your own words.
3. Open the solution whenever you want. If you peek before answering, the concept comes back later in a different example.
4. See your learning progress and concept gaps in your profile.

The feed is intended to keep going, TikTok-style. The plan is to generate **5 questions** initially, then start preparing the next **5 in the background when the user reaches question 4**. A bank of validated questions can act as a fallback when generation or validation takes longer than expected.

> The goal is understanding you can explain without help—not time spent or cards swiped.

### Current status

**Early prototype.**

| What you can try | Status |
| --- | --- |
| Vertical scrolling feed | Working with sample questions |
| Multiple choice, a reasoning field, and solution reveal | Working; free-text explanations are not graded |
| Follow-up after a peek | Uses hand-written sample review cards |
| Practice history | Saved locally in the browser on this device; can be cleared from Profile |
| Display | Japanese and English, with light and dark themes |

Gemini question generation, the endless feed, validation pipeline, explanation grading, account sync, and the concept mastery map are **not implemented yet**. The profile currently shows sample practice history, not assessed mastery. The backend is also still a starter.

### Tech stack

| Layer | Technology | Status |
| --- | --- | --- |
| Frontend | Angular | In development |
| Mobile packaging | Capacitor | Planned |
| Backend | NestJS | Starter |
| Database / ORM | PostgreSQL / TypeORM | Planned |
| AI | Gemini | Planned for question generation and grading assistance |
| Runtime | Google Cloud Run | Planned for the NestJS service; deployment not yet verified |
| When needed | Redis / RabbitMQ | Candidates for caching / messaging |

### Run locally

This README currently lives in `~/code/hackathon`; the application code lives in the separate `~/code/whylint` directory shown above.

You need Node.js and npm. This environment uses Node.js 24 and npm 11.

Start the frontend:

```bash
cd ~/code/whylint/frontend
npm ci
npm start
```

Open [http://localhost:4200](http://localhost:4200). The current UI preview runs without starting the backend.

To start the backend, use a separate terminal:

```bash
cd ~/code/whylint/backend
npm ci
npm run start:dev
```

The backend listens on `http://localhost:3000` by default. Frontend-to-backend integration is not implemented yet.

Run the frontend tests:

```bash
cd ~/code/whylint/frontend
npm test -- --watch=false
```

### PRD

- [English PRD](../whylint/whylint-prd-en.md)
- [日本語 PRD](../whylint/whylint-prd-ja.md)

These links assume `hackathon` and `whylint` are sibling directories on this machine. The five-question refill described in this README is the latest direction; the PRDs have not yet been updated to match it.

## Submission guide / 提出ガイド

- [運営が用意した提出ガイド / Original organizer guide](docs/organizer-guide.md)
