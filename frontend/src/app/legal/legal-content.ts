import type { Language } from '../learning/learning.types';

export type LegalKind = 'terms' | 'privacy';

export interface LegalSection {
  heading: string;
  /** Plain paragraphs; a paragraph starting with "• " is rendered as a list item. */
  body: string[];
}

export interface LegalDocument {
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
}

/**
 * The text of the Terms of Service and the Privacy Policy. It describes what WhyLint does today
 * (see the backend: sessions, Gemini grading, account deletion) and must be updated together
 * with those behaviours. It is a plain-language draft for the owner to review with counsel before
 * a public launch; it names no company, address or contact because none is configured here.
 */
export const LEGAL_UPDATED = '2026-11-09';

const termsEn: LegalDocument = {
  title: 'Terms of Service',
  updated: 'Last updated: November 9, 2026',
  intro:
    'These terms are the agreement between you and WhyLint ("we", "us"). By using WhyLint, with or without an account, you agree to them. If you do not agree, please do not use the service.',
  sections: [
    {
      heading: '1. What WhyLint is',
      body: [
        'WhyLint helps people understand technology by answering short code and concept questions and reading explanations. Some questions and explanations are written or checked by AI (Google Gemini), and some are posted by other learners.',
        'WhyLint is for learning. It is not professional, security, legal or engineering advice. Do not rely on an answer or explanation for a decision where a mistake could cause harm.',
      ],
    },
    {
      heading: '2. Using WhyLint',
      body: [
        'You can try questions as a guest. Guest progress is kept only in your browser tab and may disappear. Creating an account lets you keep progress, earn XP, save questions, post and comment.',
        'You must be old enough to agree to these terms where you live. If you are under 18, you need a parent or guardian to agree on your behalf. We do not knowingly offer accounts to children under 13.',
      ],
    },
    {
      heading: '3. Your account',
      body: [
        'You can sign up with an email address and password, or with Google. Keep your password private and tell us if you think someone else has used your account. You are responsible for what happens under your account.',
        'Give accurate information. Choose a username that is not offensive, does not impersonate anyone and does not contain personal information. Your username (or display name) can appear on rankings and next to your questions and comments.',
      ],
    },
    {
      heading: '4. AI-generated content',
      body: [
        'Questions, explanations, grading and follow-up answers may be produced by AI. AI can be wrong. We try to make results fair and useful, but we do not guarantee that any question, answer key, grade or explanation is correct or complete.',
        'If something looks wrong, use "Report a problem" on the question. Grades and XP can change if a question is corrected or removed.',
      ],
    },
    {
      heading: '5. Content you post',
      body: [
        'You keep the rights to the questions, explanations and comments you post ("your content"). You give us a free, worldwide licence to store, display, adapt for formatting, review with AI and distribute your content inside WhyLint, including to other learners, for as long as it is published.',
        "You promise that you have the right to post it and that it does not break the law or anyone's rights. Do not post answers that reveal other questions' solutions in comments before a learner has tried, copyrighted code you have no right to share, malware, secrets or personal information.",
        'Published questions are reviewed by AI before publication. If you delete your account, questions you published may stay available without your name.',
      ],
    },
    {
      heading: '6. Acceptable use',
      body: [
        'Do not:',
        '• harass, threaten, or discriminate against others, or post hateful, sexual, violent or illegal content;',
        '• spam, advertise, or post misleading content;',
        '• try to break, probe or overload WhyLint, bypass limits, scrape it, or use bots to answer, vote or gain XP;',
        '• use multiple accounts to farm XP or rankings, or share an account;',
        "• try to access other people's accounts or data.",
      ],
    },
    {
      heading: '7. Reports, blocking and enforcement',
      body: [
        'You can report questions and comments, and block other learners. We may remove content, hide it, reset XP gained unfairly, limit features, or suspend or close accounts that break these terms or put others at risk, with or without notice.',
      ],
    },
    {
      heading: '8. XP, levels and rankings',
      body: [
        'XP, streaks, levels, badges and rankings are for motivation only. They have no cash value and cannot be transferred. Weekly rankings reset on Mondays (Japan time) and may be recalculated.',
      ],
    },
    {
      heading: '9. Changes and ending',
      body: [
        'We may change, pause or stop any part of WhyLint, and we may change these terms. If a change is important we will tell you in the app. Using WhyLint after a change means you accept it.',
        'You can stop using WhyLint at any time and delete your account in Settings. Sections that by nature should continue (such as content licences already granted for published questions, disclaimers and limits of liability) continue after you leave.',
      ],
    },
    {
      heading: '10. No warranty',
      body: [
        'WhyLint is provided "as is" and "as available". To the extent allowed by law, we do not promise that it will be uninterrupted, error-free or fit for a particular purpose.',
      ],
    },
    {
      heading: '11. Limit of liability',
      body: [
        'To the extent allowed by law, we are not liable for indirect or consequential loss, lost data or lost profits arising from your use of WhyLint. Nothing in these terms limits liability that cannot be limited by law, including for our intentional or grossly negligent acts or for consumer rights you have under applicable law.',
      ],
    },
    {
      heading: '12. Governing law',
      body: [
        'These terms are governed by the laws of Japan, and Japanese courts have jurisdiction over disputes, except where mandatory consumer protection law in your country says otherwise.',
      ],
    },
    {
      heading: '13. Contact',
      body: [
        'Questions about these terms: use the support contact shown below or "Report a problem" inside the app.',
      ],
    },
  ],
};

const privacyEn: LegalDocument = {
  title: 'Privacy Policy',
  updated: 'Last updated: November 9, 2026',
  intro:
    'This policy explains what personal information WhyLint collects, why, who receives it, and the choices you have. It applies to the WhyLint website and the WhyLint iOS and Android apps.',
  sections: [
    {
      heading: '1. Information we collect',
      body: [
        'Account information. If you sign up with email: your email address, username, display name and a salted hash of your password (we never store the password itself). If you sign in with Google: your Google account ID, name, email address and profile picture URL, as provided by Google.',
        'Learning information. Your answers and whether they were correct, written explanations you submit for grading, follow-up questions you ask, XP, level, streak and badges, saved questions, and your preferences (language, topics, starting level, text size and theme).',
        'Content you post. Questions, explanations, comments, likes, helpful votes, reports and blocks.',
        'Technical information. Your IP address and request details for security and rate limiting, the session cookie described below, and basic server logs. We do not log the text of your answers in routine logs.',
        'Guest use. If you do not sign in, answers are counted for aggregate statistics (for example "Bug of the Day" counts) without your name, and your guest progress is kept only in your browser tab.',
      ],
    },
    {
      heading: '2. How we use it',
      body: [
        '• to run WhyLint: sign you in, grade answers, choose questions, keep your progress, and show rankings;',
        '• to generate and review questions and explanations with AI;',
        '• to keep WhyLint safe: prevent abuse, enforce our terms, handle reports;',
        '• to fix problems and improve the service;',
        '• to respond when you contact us.',
        'We do not sell your personal information and we do not use it for advertising.',
      ],
    },
    {
      heading: '3. AI processing (Google Gemini)',
      body: [
        "To grade your written explanations, answer follow-up questions and generate or review questions, we send the relevant question, your text and the learning context to Google's Gemini API. We do not send your email address or password. Google processes this data under its own terms for the Gemini API service we use. Do not put secrets or personal information into explanations or follow-up questions.",
      ],
    },
    {
      heading: '4. Who can see or receive your information',
      body: [
        'Other learners. Your username (or display name), XP and the questions or comments you publish can be seen by other learners, including on rankings. Your email address is not shown publicly.',
        'Service providers. Google (sign-in, the Gemini API, Google Fonts for the website, and Google Cloud hosting and database services) processes data for us. We share only what is needed to provide the service.',
        'Legal and safety. We may disclose information if required by law, or to protect people, WhyLint or others.',
      ],
    },
    {
      heading: '5. Cookies and local storage',
      body: [
        'We use one essential, HttpOnly session cookie ("access_token") to keep you signed in. It lasts up to 7 days or until you sign out. We do not use advertising or analytics cookies.',
        'Your browser stores your language, theme, text size and onboarding choices (localStorage), and your guest progress for the current tab (sessionStorage). The apps store your session securely on the device (iOS Keychain, Android Keystore). Loading the website fonts makes your browser contact Google Fonts.',
      ],
    },
    {
      heading: '6. Where information is stored',
      body: [
        'WhyLint is hosted on Google Cloud, with its application servers in Tokyo, Japan. Google may process some data (for example Gemini requests) in other countries. By using WhyLint you understand that your information may be transferred and processed outside your country, with the protections we describe here.',
      ],
    },
    {
      heading: '7. How long we keep it',
      body: [
        'We keep your account and learning information until you delete your account. Session records expire after 7 days. Technical logs are kept only as long as needed for security and troubleshooting.',
        'When you delete your account in Settings, we permanently delete your account, sessions, progress, answers, XP, saved questions, comments, reactions, reports and blocks. Questions you published may remain available without your name. Backups are overwritten on their normal schedule.',
      ],
    },
    {
      heading: '8. Your choices and rights',
      body: [
        'You can view and edit your username and preferences in the app, sign out at any time, and delete your account in Settings.',
        "You can ask us to disclose, correct, stop using or delete personal information we hold about you, subject to applicable law (including Japan's Act on the Protection of Personal Information). Use the contact below. We may need to verify your identity first.",
      ],
    },
    {
      heading: '9. Security',
      body: [
        'We protect information with measures such as encrypted connections, salted password hashing, HttpOnly cookies, session revocation and rate limiting. No system is perfectly secure, so please use a strong, unique password.',
      ],
    },
    {
      heading: '10. Children',
      body: [
        "WhyLint is not directed to children under 13 and we do not knowingly collect their information. If you think a child has given us personal information, contact us and we will delete it. Learners under 18 should use WhyLint with a parent or guardian's permission.",
      ],
    },
    {
      heading: '11. Changes to this policy',
      body: [
        'We may update this policy. We will change the date above and, for important changes, tell you in the app.',
      ],
    },
    {
      heading: '12. Contact',
      body: [
        'Privacy questions and requests: use the support contact shown below or "Report a problem" inside the app.',
      ],
    },
  ],
};

const termsJa: LegalDocument = {
  title: '利用規約',
  updated: '最終更新日: 2026年11月9日',
  intro:
    'この規約は、あなたとWhyLint（以下「当サービス」）との間の合意です。アカウントの有無にかかわらず、当サービスを利用することで、この規約に同意したものとみなします。同意できない場合は、利用をお控えください。',
  sections: [
    {
      heading: '1. 当サービスについて',
      body: [
        'WhyLintは、短いコード問題や概念問題に答え、解説を読むことで、技術の「なぜ」を理解するためのサービスです。問題や解説の一部はAI（Google Gemini）が作成・確認し、一部は他の学習者が投稿します。',
        '当サービスは学習のためのものであり、専門的な助言（セキュリティ、法律、エンジニアリング等）ではありません。誤りが損害につながるような判断を、回答や解説だけに頼って行わないでください。',
      ],
    },
    {
      heading: '2. 利用について',
      body: [
        'ゲストとして問題を試すことができます。ゲストの進捗はブラウザのタブ内にのみ保存され、消える場合があります。アカウントを作成すると、進捗の保存、XPの獲得、問題の保存、投稿やコメントができます。',
        'お住まいの地域で規約に同意できる年齢である必要があります。18歳未満の方は、保護者の同意が必要です。13歳未満の方にアカウントを提供することは想定していません。',
      ],
    },
    {
      heading: '3. アカウント',
      body: [
        'メールアドレスとパスワード、またはGoogleでサインアップできます。パスワードを秘密にし、第三者による不正利用の疑いがある場合はお知らせください。アカウントで行われた行為はあなたの責任となります。',
        '正確な情報を登録してください。不快、なりすまし、個人情報を含むユーザー名は使用できません。ユーザー名（または表示名）は、ランキングや投稿した問題・コメントの横に表示されることがあります。',
      ],
    },
    {
      heading: '4. AIが生成するコンテンツ',
      body: [
        '問題、解説、採点、フォローアップの回答はAIが生成する場合があります。AIは間違えることがあります。公正で役立つ結果になるよう努めますが、問題・正解・採点・解説の正確性や完全性を保証するものではありません。',
        '問題に誤りがあると思ったら、問題の「問題を報告」から知らせてください。問題が修正・削除された場合、採点やXPが変更されることがあります。',
      ],
    },
    {
      heading: '5. 投稿するコンテンツ',
      body: [
        '投稿した問題、解説、コメント（以下「投稿」）の権利はあなたに残ります。公開されている間、当サービス内で他の学習者に対して投稿を保存・表示・書式のための加工・AIによる確認・配信するための、無償かつ世界的な使用許諾を当サービスに与えるものとします。',
        '投稿する権利があり、法令や他者の権利を侵害しないことを約束してください。他の問題の答えを明かすコメント、共有する権利のない著作物のコード、マルウェア、秘密情報、個人情報は投稿しないでください。',
        '公開される問題は、公開前にAIが確認します。アカウントを削除しても、投稿した問題はあなたの名前なしで残ることがあります。',
      ],
    },
    {
      heading: '6. 禁止事項',
      body: [
        '次の行為は禁止します。',
        '• 他者への嫌がらせ、脅迫、差別、憎悪・性的・暴力的・違法な内容の投稿',
        '• スパム、宣伝、誤解を招く内容の投稿',
        '• 当サービスの破壊・探索・過負荷、制限の回避、スクレイピング、ボットによる回答・投票・XP獲得',
        '• 複数アカウントによるXPやランキングの不正獲得、アカウントの共有',
        '• 他者のアカウントやデータへの不正アクセス',
      ],
    },
    {
      heading: '7. 報告、ブロック、対応',
      body: [
        '問題やコメントを報告したり、他の学習者をブロックしたりできます。規約に違反する、または他者を危険にさらすコンテンツやアカウントに対して、通知なく、コンテンツの削除・非表示、不正に得たXPのリセット、機能の制限、アカウントの停止・削除を行うことがあります。',
      ],
    },
    {
      heading: '8. XP、レベル、ランキング',
      body: [
        'XP、連続記録、レベル、バッジ、ランキングは学習の励みのためのものです。金銭的価値はなく、譲渡できません。週間ランキングは毎週月曜（日本時間）にリセットされ、再計算されることがあります。',
      ],
    },
    {
      heading: '9. 変更と終了',
      body: [
        '当サービスの一部を変更・休止・終了したり、この規約を変更したりすることがあります。重要な変更はアプリ内でお知らせします。変更後に利用を続けた場合、変更に同意したものとみなします。',
        'いつでも利用をやめ、設定からアカウントを削除できます。公開済みの問題に与えた使用許諾、免責、責任制限など、性質上存続すべき条項は、退会後も有効です。',
      ],
    },
    {
      heading: '10. 保証の否認',
      body: [
        '当サービスは「現状有姿」「提供可能な範囲」で提供されます。法令で許される範囲で、中断のないこと、誤りのないこと、特定の目的への適合性を保証しません。',
      ],
    },
    {
      heading: '11. 責任の制限',
      body: [
        '法令で許される範囲で、当サービスの利用から生じる間接損害、結果的損害、データの損失、逸失利益について責任を負いません。ただし、故意または重大な過失による場合や、消費者契約法その他の法令により制限できない責任は、この規約によって制限されません。',
      ],
    },
    {
      heading: '12. 準拠法',
      body: [
        'この規約は日本法に準拠し、紛争は日本の裁判所が管轄します。ただし、お住まいの国の強行法規である消費者保護法が別に定める場合を除きます。',
      ],
    },
    {
      heading: '13. お問い合わせ',
      body: [
        'この規約に関するお問い合わせは、下記のサポート連絡先、またはアプリ内の「問題を報告」をご利用ください。',
      ],
    },
  ],
};

const privacyJa: LegalDocument = {
  title: 'プライバシーポリシー',
  updated: '最終更新日: 2026年11月9日',
  intro:
    'このポリシーは、WhyLintが収集する個人情報、その目的、提供先、そしてあなたの選択肢を説明します。WhyLintのウェブサイトおよびiOS・Androidアプリに適用されます。',
  sections: [
    {
      heading: '1. 収集する情報',
      body: [
        'アカウント情報: メールで登録する場合は、メールアドレス、ユーザー名、表示名、パスワードのソルト付きハッシュ（パスワードそのものは保存しません）。Googleでログインする場合は、Googleが提供するアカウントID、名前、メールアドレス、プロフィール画像のURL。',
        '学習情報: 回答と正誤、採点のために送信した説明文、フォローアップの質問、XP、レベル、連続記録、バッジ、保存した問題、設定（言語、分野、開始レベル、文字サイズ、テーマ）。',
        '投稿情報: 問題、解説、コメント、いいね、役に立った投票、報告、ブロック。',
        '技術情報: セキュリティとレート制限のためのIPアドレスやリクエストの詳細、下記のセッションCookie、基本的なサーバーログ。通常のログに回答の本文は記録しません。',
        'ゲスト利用: ログインしない場合、回答は名前なしで集計（「今日のバグ」の人数など）に使われ、ゲストの進捗はブラウザのタブ内にのみ保存されます。',
      ],
    },
    {
      heading: '2. 利用目的',
      body: [
        '• 当サービスの提供（ログイン、採点、出題、進捗の保存、ランキングの表示）',
        '• AIによる問題・解説の生成と確認',
        '• 安全の確保（不正利用の防止、規約の執行、報告への対応）',
        '• 不具合の修正とサービスの改善',
        '• お問い合わせへの対応',
        '個人情報を販売することはなく、広告目的で利用することもありません。',
      ],
    },
    {
      heading: '3. AI処理（Google Gemini）',
      body: [
        '説明文の採点、フォローアップへの回答、問題の生成・確認のため、該当する問題、あなたの文章、学習の文脈をGoogleのGemini APIに送信します。メールアドレスやパスワードは送信しません。Googleは、当サービスが利用するGemini APIサービスの規約に基づいてこのデータを処理します。説明文やフォローアップの質問に、秘密情報や個人情報を入力しないでください。',
      ],
    },
    {
      heading: '4. 情報を見られる人・受け取る人',
      body: [
        '他の学習者: ユーザー名（または表示名）、XP、公開した問題やコメントは、ランキングを含め他の学習者に表示されます。メールアドレスは公開されません。',
        '委託先: Google（ログイン、Gemini API、ウェブサイトのGoogle Fonts、Google Cloudのホスティングとデータベース）が当サービスのためにデータを処理します。提供に必要な範囲のみを共有します。',
        '法令・安全: 法令で求められる場合、または人、WhyLint、第三者を守るために必要な場合に、情報を開示することがあります。',
      ],
    },
    {
      heading: '5. Cookieとローカルストレージ',
      body: [
        'ログイン状態を保つため、HttpOnlyの必須セッションCookie（「access_token」）を1つ使用します。有効期間は最長7日、またはログアウトまでです。広告用・分析用のCookieは使用しません。',
        'ブラウザには、言語、テーマ、文字サイズ、初期設定（localStorage）と、現在のタブのゲスト進捗（sessionStorage）が保存されます。アプリはセッションを端末に安全に保存します（iOS Keychain、Android Keystore）。ウェブサイトのフォント読み込みにより、ブラウザはGoogle Fontsに接続します。',
      ],
    },
    {
      heading: '6. 保存場所',
      body: [
        'WhyLintはGoogle Cloudでホストされ、アプリケーションサーバーは日本（東京）にあります。Googleは一部のデータ（例: Geminiへのリクエスト）を他の国で処理することがあります。WhyLintを利用することで、ここに記載した保護のもと、情報があなたの国の外に移転・処理される場合があることを理解したものとします。',
      ],
    },
    {
      heading: '7. 保管期間',
      body: [
        'アカウントと学習情報は、アカウントを削除するまで保管します。セッション記録は7日で失効します。技術ログは、セキュリティとトラブル対応に必要な期間のみ保管します。',
        '設定からアカウントを削除すると、アカウント、セッション、進捗、回答、XP、保存した問題、コメント、リアクション、報告、ブロックを完全に削除します。公開した問題は、あなたの名前なしで残ることがあります。バックアップは通常のスケジュールで上書きされます。',
      ],
    },
    {
      heading: '8. あなたの選択と権利',
      body: [
        'ユーザー名や設定はアプリ内で確認・変更でき、いつでもログアウトや設定からのアカウント削除ができます。',
        '個人情報保護法その他の法令に基づき、保有する個人情報の開示、訂正、利用停止、削除を求めることができます。下記の連絡先をご利用ください。本人確認をお願いする場合があります。',
      ],
    },
    {
      heading: '9. 安全管理',
      body: [
        '暗号化通信、ソルト付きパスワードハッシュ、HttpOnly Cookie、セッションの失効、レート制限などの対策で情報を保護しています。完全に安全なシステムはないため、強力で固有のパスワードをお使いください。',
      ],
    },
    {
      heading: '10. 子どもについて',
      body: [
        'WhyLintは13歳未満の子どもを対象としておらず、その情報を意図して収集しません。お子さまが個人情報を提供したと思われる場合はご連絡ください。削除します。18歳未満の方は、保護者の許可のもとでご利用ください。',
      ],
    },
    {
      heading: '11. ポリシーの変更',
      body: [
        'このポリシーを更新することがあります。上記の日付を変更し、重要な変更はアプリ内でお知らせします。',
      ],
    },
    {
      heading: '12. お問い合わせ',
      body: [
        'プライバシーに関するご質問・ご請求は、下記のサポート連絡先、またはアプリ内の「問題を報告」をご利用ください。',
      ],
    },
  ],
};

export const LEGAL_DOCUMENTS: Record<LegalKind, Record<Language, LegalDocument>> = {
  terms: { en: termsEn, ja: termsJa },
  privacy: { en: privacyEn, ja: privacyJa },
};
