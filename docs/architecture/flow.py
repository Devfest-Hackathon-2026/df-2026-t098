"""Builds the layered architecture and the user-journey flow diagrams (ja + en SVG).

    python3 flow.py            # writes whylint-layers-{ja,en}.svg and whylint-journey-{ja,en}.svg
    node render.mjs            # renders every whylint-*.svg to a PNG

Every box is described in plain data below; the layout (wrapping, heights, arrows) is computed.
"""
FONT = "'Hiragino Sans','Noto Sans JP','Helvetica Neue',Arial,sans-serif"


def tw(s, fs):
    return sum(fs * 0.58 if ord(c) < 0x250 else fs for c in s)


def wrap(s, maxw, fs):
    toks, cur = [], ''
    for c in s:
        if ord(c) > 0x2e80:
            if cur:
                toks.append(cur)
                cur = ''
            toks.append(c)
        elif c == ' ':
            if cur:
                toks.append(cur)
                cur = ''
            toks.append(' ')
        else:
            cur += c
    if cur:
        toks.append(cur)
    out, line = [], ''
    for t in toks:
        if tw(line + t, fs) > maxw and line.strip():
            out.append(line.strip())
            line = '' if t == ' ' else t
        else:
            line += t
    if line.strip():
        out.append(line.strip())
    return out


def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


class Card:
    """A titled box with wrapped bullet lines. measure() then draw()."""

    def __init__(self, title, lines, color, fs=14, ts=17, bullet=True):
        self.title, self.lines, self.color, self.fs, self.ts, self.bullet = title, lines, color, fs, ts, bullet

    def measure(self, w):
        self.w = w
        inner = w - 28
        self.tl = wrap(self.title, inner, self.ts)
        self.wl = []
        for ln in self.lines:
            ws = wrap(ln, inner - (14 if self.bullet else 0), self.fs)
            self.wl.append(ws)
        h = 16 + len(self.tl) * (self.ts + 5) + 6
        for ws in self.wl:
            h += len(ws) * (self.fs + 6) + 3
        self.h = h + 10
        return self.h

    def draw(self, x, y, h=None):
        h = h or self.h
        fill, stroke, ink = self.color
        o = f'<rect x="{x}" y="{y}" width="{self.w}" height="{h}" rx="12" fill="#fff" stroke="{stroke}" stroke-width="2"/>'
        o += f'<rect x="{x}" y="{y}" width="{self.w}" height="{16 + len(self.tl) * (self.ts + 5)}" rx="12" fill="{fill}"/>'
        o += f'<rect x="{x}" y="{y + 12}" width="{self.w}" height="{len(self.tl) * (self.ts + 5) + 4}" fill="{fill}"/>'
        o += f'<rect x="{x}" y="{y}" width="{self.w}" height="{h}" rx="12" fill="none" stroke="{stroke}" stroke-width="2"/>'
        ty = y + 12 + self.ts
        for t in self.tl:
            o += f'<text x="{x + 14}" y="{ty}" font-size="{self.ts}" font-weight="700" fill="{ink}">{esc(t)}</text>'
            ty += self.ts + 5
        ty += 14
        for ws in self.wl:
            for i, t in enumerate(ws):
                if self.bullet and i == 0:
                    o += f'<circle cx="{x + 19}" cy="{ty - 5}" r="2.5" fill="{stroke}"/>'
                dx = 28 if self.bullet else 14
                o += f'<text x="{x + dx}" y="{ty}" font-size="{self.fs}" fill="#374151">{esc(t)}</text>'
                ty += self.fs + 6
            ty += 3
        return o


BLUE = ('#e8f0fe', '#4285f4', '#1d4ed8')
GREEN = ('#e6f4ea', '#34a853', '#15803d')
YELLOW = ('#fef7e0', '#f9ab00', '#a16207')
RED = ('#fce8e6', '#ea4335', '#b91c1c')
GRAY = ('#f1f3f4', '#9aa0a6', '#374151')
PURPLE = ('#f3e8fd', '#9334e6', '#6b21a8')
TEAL = ('#e0f7f6', '#12a4a0', '#0f766e')

ARROW = '<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0L10 5L0 10z" fill="#475569"/></marker></defs>'


def row(cards, x0, x1, gap=16):
    n = len(cards)
    w = (x1 - x0 - gap * (n - 1)) / n
    h = max(c.measure(w) for c in cards)
    return w, h


# --------------------------------------------------------------------------------------
# Diagram 1: layers
# --------------------------------------------------------------------------------------
def layers(L):
    T = lambda ja, en: ja if L == 'ja' else en
    W = 2000
    X0, X1 = 236, 1970
    bands = []

    def band(key, label, sub, color, groups):
        bands.append((key, label, sub, color, groups))

    band('clients', T('1 · クライアント', '1 · Clients'), T('ユーザーが触る画面', 'What people touch'), BLUE, [[
        Card(T('Web（Angular 22）', 'Web (Angular 22)'), [
            T('ページ：フィード / オンボーディング / ログイン / 新規登録', 'Pages: feed, onboarding, login, signup'),
            T('共有リンク：/questions/:id・/creators/:id・利用規約・プライバシー', 'Share links: /questions/:id, /creators/:id, terms, privacy'),
            T('タブ：フィード・復習・ランキング・投稿・プロフィール・設定', 'Tabs: Feed, Practice, Rank, Post, Profile, Settings'),
            T('Cookieセッション（HttpOnly）', 'Cookie session (HttpOnly)'),
        ], BLUE),
        Card(T('iOSアプリ（SwiftUI）', 'iOS app (SwiftUI)'), [
            T('Webと同じ機能とタブ', 'Same features and tabs as the web'),
            T('Google Sign-In SDK', 'Google Sign-In SDK'),
            T('トークンはKeychainに保存', 'Token kept in the Keychain'),
            T('日本語/英語・ライト/ダーク', 'ja / en, light / dark'),
        ], BLUE),
        Card(T('Androidアプリ（Compose）', 'Android app (Compose)'), [
            T('Webと同じ機能とタブ', 'Same features and tabs as the web'),
            T('Credential ManagerでGoogleログイン', 'Google sign-in via Credential Manager'),
            T('トークンはKeystoreで暗号化', 'Token encrypted with the Keystore'),
            T('日本語/英語・ライト/ダーク', 'ja / en, light / dark'),
        ], BLUE),
        Card(T('ゲストとログイン済み', 'Guest vs signed in'), [
            T('ゲスト：問題プールの閲覧、タップ回答（保存なし）、共有リンク', 'Guest: pool feed, tap answers (not saved), shared links'),
            T('ログイン：AI出題、説明の採点、XP、ソーシャル、投稿', 'Signed in: AI batches, Explain why, XP, social, Post'),
            T('ログイン時にゲストの回答を引き継ぐ', 'Guest answers carry into the new account'),
        ], GRAY),
    ]])
    band('edge', T('2 · 入口と防御', '2 · Edge & guards'), T('すべてのAPIリクエストが通る', 'Every request passes here'), RED, [[
        Card(T('配信とヘルスチェック', 'Serving & probes'), [
            T('Angularのビルドを同じオリジンで配信', 'Serves the Angular build on the same origin'),
            T('ハッシュ付きファイルは1年キャッシュ', 'Hashed files cached for a year'),
            T('/health と /health/ready（DB確認）', '/health and /health/ready (DB check)'),
        ], RED),
        Card(T('リクエストの強化', 'Request hardening'), [
            T('セキュリティヘッダー・HSTS', 'Security headers, HSTS'),
            T('JSONの__proto__キーを拒否', 'Rejects __proto__ keys in JSON'),
            T('DTOで入力を検証（未知の項目は拒否）', 'DTO validation, unknown fields refused'),
        ], RED),
        Card(T('本人確認', 'Identity'), [
            T('JwtGuard + 保存済みセッション', 'JwtGuard + stored sessions'),
            T('Web：Origin確認（CSRF対策）', 'Web: Origin check (CSRF)'),
            T('ネイティブ：Bearerトークン + クライアント確認', 'Native: Bearer token + client check'),
        ], RED),
        Card(T('レート制限', 'Rate limits'), [
            T('読み取り 120回/分（ユーザーまたはIP）', 'Reads 120/min per user or IP'),
            T('書き込み 10〜30回/分、退会 3回/分', 'Writes 10–30/min, delete account 3/min'),
            T('Cloud RunではTRUST_PROXY=1', 'TRUST_PROXY=1 on Cloud Run'),
        ], RED),
        Card(T('最初の言語', 'First language'), [
            T('GET /config/locale：IPから国を判定', 'GET /config/locale: country from client IP'),
            T('日本ならja、それ以外はen', 'Japan → ja, anywhere else → en'),
            T('判定できない時はAccept-Language、最後はja', 'Fallback: Accept-Language, then ja'),
        ], RED),
    ]])
    band('api', T('3 · API（NestJS /api/v1）', '3 · API (NestJS /api/v1)'), T('コントローラー', 'Controllers'), GREEN, [[
        Card(T('認証 /auth・/auth/mobile', 'Auth /auth, /auth/mobile'), [
            T('新規登録・パスワードログイン・ログアウト', 'signup, password login, logout'),
            T('Googleログイン（IDトークン）', 'Google login (ID token)'),
            T('GET・PATCH・DELETE /auth/me（ユーザー名変更・退会）', 'GET, PATCH, DELETE /auth/me (rename, delete account)'),
        ], GREEN),
        Card(T('学習：出題', 'Learning: feed'), [
            T('GET catalog・preferences、PUT/PATCH', 'GET catalog, preferences; PUT/PATCH'),
            T('GET feed/pool（ゲストOK）', 'GET feed/pool (guests allowed)'),
            T('POST feed/batches（AI 5問）', 'POST feed/batches (5 AI questions)'),
            T('GET daily（今日のバグ）', 'GET daily (Bug of the Day)'),
        ], GREEN),
        Card(T('学習：回答', 'Learning: answering'), [
            T('POST questions/:id/taps（タップ回答）', 'POST questions/:id/taps (tap answer)'),
            T('POST questions/:id/attempts（説明を採点）', 'POST questions/:id/attempts (graded explanation)'),
            T('POST follow-ups・guest-answers', 'POST follow-ups, guest-answers'),
        ], GREEN),
        Card(T('学習：投稿とソーシャル', 'Learning: content & social'), [
            T('POST questions、GET questions/:id、community', 'POST questions, GET questions/:id, community'),
            T('PUT like・save・helpful', 'PUT like, save, helpful'),
            T('コメントの取得・投稿・削除', 'comments: list, post, delete'),
            T('GET creators/:userId', 'GET creators/:userId'),
        ], GREEN),
        Card(T('安全と進捗', 'Safety & progress'), [
            T('通報（問題・コメント）、ブロック', 'Reports (question, comment), blocks'),
            T('GET reviews・saved・progress', 'GET reviews, saved, progress'),
            T('GET leaderboard（週間）', 'GET leaderboard (weekly)'),
            T('GET /config（サポート連絡先）', 'GET /config (support contact)'),
        ], GREEN),
    ]])
    band('domain', T('4 · ドメインロジック', '4 · Domain services'), T('ルールはここにある', 'Where the rules live'), YELLOW, [[
        Card(T('冪等な操作', 'Idempotent operations'), [
            T('requestId + 所有者 + 内容で重複を防止', 'requestId + owner + payload stop duplicates'),
            T('実行中は409、再送は同じ結果を返す', 'Pending → 409; a retry replays the result'),
            T('期限付きリース', 'Time-limited lease'),
        ], YELLOW),
        Card(T('問題サービス', 'Questions'), [
            T('問題プール・復習の挿入・コミュニティ問題', 'Pool, due reviews, community question'),
            T('重複防止：概念キー + 言い換え検出', 'No repeats: concept key + paraphrase check'),
            T('コードを読みやすく整形（バグ探しは除く）', 'Code formatting (not spot-the-bug)'),
        ], YELLOW),
        Card(T('タップ回答', 'Tap answers'), [
            T('保存済みの正解で採点、AI呼び出しなし', 'Graded from stored answer, no AI call'),
            T('初回5XP・コンボ・難易度の自動調整', '5 XP first tap, combo, adaptive level'),
            T('間違いは翌朝9:00（JST）に復習', 'A miss returns at 09:00 JST'),
            T('ゲスト回答の取り込み（最大200件）', 'Guest answer import (max 200)'),
        ], YELLOW),
        Card(T('説明の採点と進捗', 'Explanations & progress'), [
            T('Geminiが0〜10点で採点、8点以上で合格', 'Gemini grades 0–10; 8+ passes'),
            T('1問あたりXPは最大20', 'Max 20 XP per question'),
            T('レベル = 1 + XP/100、連続日数、バッジ', 'Level = 1 + XP/100, streak, badges'),
            T('週間ランキング（月曜開始、東京時間）', 'Weekly rank (Monday start, Tokyo time)'),
        ], YELLOW),
        Card(T('コミュニティ', 'Community'), [
            T('コメント、役に立った、投稿者ページ', 'Comments, helpful votes, creator page'),
            T('通報すると本人には非表示', 'Reporting hides the item for the reporter'),
            T('ブロックした相手の内容を非表示', 'Blocking hides that person everywhere'),
        ], YELLOW),
        Card(T('Geminiサービス', 'Gemini service'), [
            T('5問の生成・説明の採点', 'Generate 5 questions, grade an explanation'),
            T('追加質問への回答・投稿のレビュー', 'Answer follow-ups, review a posted question'),
            T('失敗しても点数にしない', 'A failure is never turned into a score'),
        ], YELLOW),
    ]])
    band('data', T('5 · データと外部サービス', '5 · Data & external'), T('保存先と連携先', 'Storage and partners'), PURPLE, [[
        Card(T('アカウント', 'Identity'), ['users', 'sessions'], PURPLE),
        Card(T('問題と設定', 'Content'), ['learning_questions', 'learning_preferences', 'learning_daily_challenges'], PURPLE),
        Card(T('学習の記録', 'Learner state'), ['learning_taps', 'learning_attempts', 'learning_question_progress', 'learning_operations'], PURPLE),
        Card(T('ソーシャルと安全', 'Social & safety'), [
            'learning_reactions · learning_comments', 'learning_comment_helpful', 'learning_question_reports', 'learning_comment_reports · learning_user_blocks'], PURPLE),
        Card(T('Gemini API', 'Gemini API'), [
            T('問題生成・採点・追加質問・レビュー', 'Generation, grading, follow-ups, review'),
            T('APIキーはSecret Managerから', 'API key comes from Secret Manager'),
        ], RED),
        Card(T('Google ログイン', 'Sign in with Google'), [
            T('Web / iOS / AndroidでIDトークンを取得', 'ID token from web, iOS and Android'),
            T('サーバーがgoogle-auth-libraryで検証', 'Server verifies it with google-auth-library'),
        ], RED),
        Card(T('DB-IP / Google Fonts', 'DB-IP / Google Fonts'), [
            T('DB-IP：国判定用ファイルを同梱（通信なし）', 'DB-IP: bundled country file, no network call'),
            T('Google Fonts：Webのフォント', 'Google Fonts: web fonts'),
        ], GRAY),
    ]])
    band('ops', T('0 · ビルドと配信', '0 · Build & delivery'), T('コードが本番に届くまで', 'From code to production'), TEAL, [[
        Card(T('GitHub と CI', 'GitHub & CI'), [
            T('バックエンド・フロントの型検査とテスト', 'Type-check and tests, backend + web'),
            T('PostgreSQLでの結合テスト', 'Integration tests on PostgreSQL'),
            T('Playwright（モバイル/デスクトップ）', 'Playwright (mobile + desktop)'),
            T('npm audit・コンテナの動作確認', 'npm audit, container smoke test'),
        ], TEAL),
        Card(T('Dockerイメージ', 'Docker image'), [
            T('4段階ビルド（node:24-slim）', 'Four stages on node:24-slim'),
            T('Angularをビルドして同梱', 'Angular build baked in'),
            T('非rootユーザー、ポート8080', 'Unprivileged user, port 8080'),
        ], TEAL),
        Card(T('リリースジョブ', 'Release job'), [
            T('マイグレーションを1トランザクションで実行', 'Migrations in one transaction'),
            T('問題プール179問を投入', 'Seeds the 179-question pool'),
            T('何度実行しても安全', 'Safe to repeat'),
        ], TEAL),
        Card(T('Cloud Run（東京）', 'Cloud Run (Tokyo)'), [
            T('1コンテナでWebとAPIを提供', 'One container: web + API'),
            T('SIGTERMで安全に停止', 'Graceful shutdown on SIGTERM'),
            T('whylint.com', 'whylint.com'),
        ], TEAL),
        Card(T('Cloud SQL と Secret Manager', 'Cloud SQL & Secret Manager'), [
            T('PostgreSQLにUnixソケットで接続', 'PostgreSQL over a Unix socket'),
            T('DB_URL・JWT_SECRET・GOOGLE_CLIENT_*・GEMINI_API_KEY', 'DB_URL, JWT_SECRET, GOOGLE_CLIENT_*, GEMINI_API_KEY'),
        ], TEAL),
        Card(T('ネイティブのビルド', 'Native builds'), [
            T('iOS：Xcode、Android：Gradle', 'iOS: Xcode, Android: Gradle'),
            T('API接続先はビルド設定で指定', 'API URL set in the build config'),
            T('ストア申請は別作業', 'Store submission is separate'),
        ], TEAL),
    ]])

    arrows = {
        'clients': T('HTTPS · 同じオリジンの /api/v1', 'HTTPS · same-origin /api/v1'),
        'edge': T('検証済み・認証済みのリクエスト', 'validated, authenticated requests'),
        'api': T('サービスを呼び出す', 'controllers call services'),
        'domain': T('SQL（TypeORM・短いトランザクション） / 外部API', 'SQL (TypeORM, short transactions) / partner APIs'),
    }

    body, y = '', 96
    for key, label, sub, color, groups in bands:
        cards = groups[0]
        w, h = row(cards, X0, X1)
        bh = h + 36
        fill, stroke, ink = color
        body += f'<rect x="24" y="{y}" width="{W - 48}" height="{bh}" rx="18" fill="{fill}" fill-opacity="0.55" stroke="{stroke}" stroke-width="2"/>'
        for i, t in enumerate(wrap(label, 180, 20)):
            body += f'<text x="44" y="{y + 40 + i * 25}" font-size="20" font-weight="800" fill="{ink}">{esc(t)}</text>'
        ly = y + 40 + len(wrap(label, 180, 20)) * 25 + 4
        for i, t in enumerate(wrap(sub, 170, 14)):
            body += f'<text x="44" y="{ly + i * 19}" font-size="14" fill="#4b5563">{esc(t)}</text>'
        x = X0
        for c in cards:
            body += c.draw(x, y + 18, h)
            x += w + 16
        y += bh
        if key in arrows:
            body += f'<path d="M{W // 2} {y + 2} V{y + 32}" stroke="#475569" stroke-width="3" fill="none" marker-end="url(#a)"/>'
            body += f'<text x="{W // 2 + 16}" y="{y + 24}" font-size="15" font-weight="600" fill="#374151">{esc(arrows[key])}</text>'
            y += 34
        elif key == 'data':
            body += f'<path d="M{W // 2} {y + 2} V{y + 32}" stroke="#475569" stroke-width="3" fill="none" marker-end="url(#a)" stroke-dasharray="6 5"/>'
            body += f'<text x="{W // 2 + 16}" y="{y + 24}" font-size="15" font-weight="600" fill="#374151">{esc(T("デプロイで反映", "deployed to"))}</text>'
            y += 34
    H = y + 24
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" font-family="{FONT}">{ARROW}<rect width="{W}" height="{H}" fill="#fff"/>'
    svg += f'<text x="{W // 2}" y="60" text-anchor="middle" font-size="34" font-weight="800" fill="#111827">{T("WhyLint レイヤー構成図", "WhyLint layer map")}</text>'
    svg += f'<text x="{W // 2}" y="84" text-anchor="middle" font-size="15" fill="#6b7280">{T("上から下へ：画面 → 入口 → API → ルール → データ。いちばん下が、本番に届くまでの流れ", "Top to bottom: screens, edge, API, rules, data. The bottom band shows how the code reaches production")}</text>'
    return svg + body + '</svg>'


# --------------------------------------------------------------------------------------
# Diagram 2: user journey, from first open to every feature
# --------------------------------------------------------------------------------------
def journey(L):
    T = lambda ja, en: ja if L == 'ja' else en
    cols = [
        (T('0 · はじめて開く', '0 · First open'), GRAY, [
            (T('whylint.com またはアプリを開く', 'Open whylint.com or the app'), 'Web · iOS · Android'),
            (T('サーバーが最初の言語を決める', 'Server picks the first language'), T('IPから国を判定。日本=日本語、それ以外=英語', 'Country from IP: Japan = ja, elsewhere = en')),
            (T('オンボーディング', 'Onboarding'), T('興味・技術・難易度を選ぶ（スキップも可）', 'Pick interests, technologies, level (or skip)')),
            (T('設定をこの端末に保存', 'Saved on this device'), T('ログイン後にアカウントへ同期', 'Synced to the account after sign-in')),
        ]),
        (T('1 · ゲストで学ぶ', '1 · Learn as a guest'), BLUE, [
            (T('問題フィード', 'Question feed'), T('同梱の問題プール179問（日英）から出題', 'Served from the 179-question pool (ja/en)')),
            (T('今日のバグ', 'Bug of the Day'), 'GET /daily'),
            (T('タップで回答', 'Tap an answer'), T('選択式・○×・出力予想・バグの行をタップ', 'Choice, true/false, predict output, tap the buggy line')),
            (T('サーバーが採点', 'Server grades it'), T('保存済みの正解と比較。AIなし・保存なし', 'Stored answer, no AI, nothing saved')),
            (T('すぐに解説', 'Instant explanation'), T('短い解説を表示。共有リンクも使える', 'Short explanation; share links work too')),
            (T('3問でログイン案内', 'After 3 taps: sign-in card'), T('進捗を残すには登録が必要', 'Sign in to keep progress')),
        ]),
        (T('2 · アカウント', '2 · Account'), GREEN, [
            (T('登録またはログイン', 'Sign up or sign in'), T('メール+パスワード、またはGoogle', 'Email + password, or Google')),
            (T('セッション作成', 'Session created'), T('Web：Cookie、ネイティブ：Bearerトークン', 'Web: cookie, native: Bearer token')),
            (T('ゲストの回答を取り込む', 'Guest answers imported'), T('POST guest-answers（最大200件、XPの二重付与なし）', 'POST guest-answers (max 200, never double XP)')),
            (T('設定を復元', 'Preferences restored'), T('別の端末でも同じ設定', 'Same setup on any device')),
        ]),
        (T('3 · あなた向けの出題', '3 · Personal feed'), YELLOW, [
            (T('バッチを開始', 'Start a batch'), T('POST feed/batches + requestId（再送しても重複なし）', 'POST feed/batches + requestId (retries never duplicate)')),
            (T('Geminiが5問を作る', 'Gemini writes 5 questions'), T('興味・難易度・苦手・最近の概念を考慮', 'Uses interests, level, weak topics, recent concepts')),
            (T('品質チェック', 'Quality checks'), T('無効な問題は除外、似た問題は出さない', 'Drops invalid questions and repeats')),
            (T('プールで補う', 'Pool tops up'), T('足りない分と復習（最大3問）、コミュニティ問題は1問まで', 'Fills gaps, adds due reviews (max 3), at most 1 community question')),
            (T('3枚目で次のバッチ', 'Next batch at card 3'), T('スクロールを止めずに先読み', 'Prefetched without blocking scrolling')),
            (T('Gemini障害でも続行', 'Gemini down? Keep going'), T('プールだけで出題を継続', 'The pool keeps the feed alive')),
        ]),
        (T('4 · 答えて伸びる', '4 · Answer & grow'), RED, [
            (T('タップで回答', 'Tap an answer'), T('初回は+5XP、連続正解でコンボ', '+5 XP on the first tap, combo on streaks')),
            (T('正解／不正解', 'Right or wrong'), T('正解で復習から外れ、間違いは翌朝9:00（東京）に再出題', 'Correct clears it; a miss returns at 09:00 JST')),
            (T('難易度の自動調整', 'Adaptive level'), T('直近6回で5回正解なら上げ、2回以下なら下げる', '5 of the last 6 correct → up; 2 or fewer → down')),
            (T('「なぜ？」を説明', 'Explain why'), T('文章で説明するとGeminiが0〜10点で採点', 'Write an explanation; Gemini scores 0–10')),
            (T('8点以上で合格', '8+ passes'), T('合計20XPまで。足りなければ改善点と再挑戦', 'Up to 20 XP total; otherwise feedback and a retry')),
            (T('追加質問', 'Follow-up question'), T('問題に沿って1日5回まで質問', 'Ask up to 5 a day, grounded in the question')),
        ]),
        (T('5 · コミュニティ', '5 · Community'), PURPLE, [
            (T('いいね・保存・共有', 'Like, save, share'), T('/questions/:id の共有リンク', 'Stable /questions/:id link')),
            (T('コメント', 'Comments'), T('投稿・削除・「役に立った」', 'Post, delete, mark helpful')),
            (T('問題を投稿', 'Post a question'), T('模範解答つき。Geminiが検証・修正して公開', 'With a reference answer; Gemini reviews and corrects it')),
            (T('他の人のフィードへ', 'Reaches other feeds'), T('投稿者名つきで表示', 'Shown with the author')),
            (T('投稿者ページ', 'Creator page'), 'GET creators/:userId'),
            (T('通報とブロック', 'Report & block'), T('通報・ブロックした内容は自分には非表示', 'Reported or blocked content is hidden for you')),
        ]),
        (T('6 · 進捗とアカウント', '6 · Progress & account'), TEAL, [
            (T('ホーム画面の指標', 'Header stats'), T('連続日数・今日の目標5問・レベル・コンボ', 'Streak, daily goal of 5, level, combo')),
            (T('実績', 'Achievements'), T('バッジ、習熟度レーダー、週間ランキング', 'Badges, mastery radar, weekly leaderboard')),
            (T('復習と保存', 'Practice & saved'), T('復習待ちの問題と保存した問題', 'Questions to retry and saved ones')),
            (T('履歴と設定', 'History & settings'), T('学習履歴、言語、テーマ、ユーザー名', 'History, language, theme, username')),
            (T('ログアウト／退会', 'Sign out / delete'), T('退会で個人データは削除、投稿した問題は匿名で残る', 'Deleting removes personal data; posted questions stay, unnamed')),
        ]),
    ]
    CW, GAP, X0, TOP = 252, 50, 40, 170
    W = X0 * 2 + CW * len(cols) + GAP * (len(cols) - 1)
    fs, ts = 14, 16
    layout = []  # per column: list of (y, h, wrapped title, wrapped sub)
    maxy = 0
    for _, _, nodes in cols:
        y, items = TOP, []
        for title, sub in nodes:
            tl = wrap(title, CW - 44, ts)
            sl = wrap(sub, CW - 28, fs)
            h = 14 + len(tl) * (ts + 4) + 4 + len(sl) * (fs + 5) + 12
            items.append((y, h, tl, sl))
            y += h + 34
        layout.append(items)
        maxy = max(maxy, y - 34)
    H = maxy + 130
    s = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" font-family="{FONT}">{ARROW}<rect width="{W}" height="{H}" fill="#fff"/>'
    s += f'<text x="{W // 2}" y="58" text-anchor="middle" font-size="34" font-weight="800" fill="#111827">{T("WhyLint ユーザーフロー（初回から全機能まで）", "WhyLint user flow (first open to every feature)")}</text>'
    s += f'<text x="{W // 2}" y="86" text-anchor="middle" font-size="15" fill="#6b7280">{T("左から右へ進みます。各列は1つの段階です", "Read left to right. Each column is one stage")}</text>'
    for ci, ((name, color, nodes), items) in enumerate(zip(cols, layout)):
        fill, stroke, ink = color
        x = X0 + ci * (CW + GAP)
        colh = items[-1][0] + items[-1][1] - TOP + 24
        s += f'<rect x="{x - 10}" y="{TOP - 54}" width="{CW + 20}" height="{colh + 66}" rx="16" fill="{fill}" fill-opacity="0.45"/>'
        s += f'<rect x="{x - 10}" y="{TOP - 54}" width="{CW + 20}" height="40" rx="16" fill="{stroke}"/><rect x="{x - 10}" y="{TOP - 34}" width="{CW + 20}" height="20" fill="{stroke}"/>'
        s += f'<text x="{x + CW / 2}" y="{TOP - 28}" text-anchor="middle" font-size="17" font-weight="800" fill="#fff">{esc(name)}</text>'
        for ni, (y, h, tl, sl) in enumerate(items):
            s += f'<rect x="{x}" y="{y}" width="{CW}" height="{h}" rx="12" fill="#fff" stroke="{stroke}" stroke-width="2"/>'
            ty = y + 12 + ts
            for t in tl:
                s += f'<text x="{x + 14}" y="{ty}" font-size="{ts}" font-weight="700" fill="{ink}">{esc(t)}</text>'
                ty += ts + 4
            ty += 2
            for t in sl:
                s += f'<text x="{x + 14}" y="{ty}" font-size="{fs}" fill="#4b5563">{esc(t)}</text>'
                ty += fs + 5
            if ni < len(items) - 1:
                s += f'<path d="M{x + CW / 2} {y + h + 2} V{y + h + 32}" stroke="#475569" stroke-width="2.5" fill="none" marker-end="url(#a)"/>'
        # hand-off to the next stage
        if ci < len(cols) - 1:
            nxt = layout[ci + 1]
            hand = {0: (3, 0), 1: (5, 0), 2: (3, 0), 3: (5, 0), 4: (5, 0), 5: (5, 0)}[ci]
            ya = items[hand[0]][0] + items[hand[0]][1] / 2
            yb = nxt[hand[1]][0] + nxt[hand[1]][1] / 2
            x1, x2 = x + CW, x + CW + GAP
            xm = x1 + GAP / 2
            s += f'<path d="M{x1} {ya} H{xm} V{yb} H{x2 - 2}" stroke="{stroke}" stroke-width="3" fill="none" marker-end="url(#a)"/>'
    # legend of what runs where
    ly = maxy + 60
    notes = [
        T('AIを使うのは4か所だけ：出題の生成（3）、説明の採点・追加質問（4）、投稿のレビュー（5）。タップの採点はAIを使わず、サーバーが保存済みの正解と比べます。',
          'AI is used in only four places: generating questions (3), grading explanations and follow-ups (4), reviewing posts (5). Tap grading uses no AI; the server compares with the stored answer.'),
        T('日付・連続日数・週間ランキングはすべて東京時間（月曜開始）です。', 'Dates, streaks and the weekly leaderboard all use Tokyo time (weeks start on Monday).'),
    ]
    for i, n in enumerate(notes):
        for j, t in enumerate(wrap(n, W - 120, 15)):
            s += f'<text x="{X0}" y="{ly + i * 52 + j * 21}" font-size="15" fill="#374151">{"• " if j == 0 else "   "}{esc(t)}</text>'
    return s + '</svg>'


for lang in ('ja', 'en'):
    open(f'whylint-layers-{lang}.svg', 'w').write(layers(lang))
    open(f'whylint-journey-{lang}.svg', 'w').write(journey(lang))
