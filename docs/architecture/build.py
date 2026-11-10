"""Builds whylint-architecture-{ja,en}.svg. PNGs are rendered from the SVGs with a headless browser."""
T={
'ja':dict(title='WhyLint アーキテクチャ', users='ユーザー', web='Webブラウザ', web2='Angular', ios='iOSアプリ', ios2='SwiftUI', android='Androidアプリ', android2='Jetpack Compose',
  gcp='Google Cloud（東京 asia-northeast1）', run='Cloud Run', run2='1コンテナ：Angular配信 + NestJS API', sql='Cloud SQL', sql2='PostgreSQL（学習データ）', sec='Secret Manager', sec2='APIキー・JWT秘密鍵・DB接続', job='リリースジョブ', job2='マイグレーション + 問題プール投入',
  gem='Gemini API', gem2='問題生成・採点・追加質問', gid='Google ログイン', gid2='Google Identity / OAuth 2.0', fonts='Google Fonts', fonts2='Webのフォント配信',
  https='HTTPS', sock='Unixソケット', verify='IDトークン検証', api='API', secret='取得'),
'en':dict(title='WhyLint architecture', users='Users', web='Web browser', web2='Angular', ios='iOS app', ios2='SwiftUI', android='Android app', android2='Jetpack Compose',
  gcp='Google Cloud (Tokyo, asia-northeast1)', run='Cloud Run', run2='One container: Angular + NestJS API', sql='Cloud SQL', sql2='PostgreSQL (learning data)', sec='Secret Manager', sec2='API keys, JWT secret, DB URL', job='Release job', job2='Migrations + question pool seed',
  gem='Gemini API', gem2='Question generation, grading, follow-ups', gid='Sign in with Google', gid2='Google Identity / OAuth 2.0', fonts='Google Fonts', fonts2='Web fonts',
  https='HTTPS', sock='Unix socket', verify='ID token check', api='API', secret='Read'),
}
def box(x,y,w,h,fill,stroke,title,sub,tc='#1f2937',ts=22,ss=15):
    out=f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="14" fill="{fill}" stroke="{stroke}" stroke-width="2"/>'
    out+=f'<text x="{x+w/2}" y="{y+h/2-(6 if sub else -8)}" text-anchor="middle" font-size="{ts}" font-weight="700" fill="{tc}">{title}</text>'
    if sub: out+=f'<text x="{x+w/2}" y="{y+h/2+22}" text-anchor="middle" font-size="{ss}" fill="#4b5563">{sub}</text>'
    return out
for lang,t in T.items():
    s=f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900" font-family="'Hiragino Sans','Noto Sans JP','Helvetica Neue',Arial,sans-serif">
<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto"><path d="M0 0L10 5L0 10z" fill="#475569"/></marker></defs>
<rect width="1600" height="900" fill="#fff"/>
<text x="800" y="58" text-anchor="middle" font-size="34" font-weight="800" fill="#111827">{t['title']}</text>
<text x="70" y="140" font-size="20" font-weight="700" fill="#6b7280">{t['users']}</text>
{box(60,170,280,120,'#f3f4f6','#9ca3af',t['web'],t['web2'])}
{box(60,390,280,120,'#f3f4f6','#9ca3af',t['ios'],t['ios2'])}
{box(60,610,280,120,'#f3f4f6','#9ca3af',t['android'],t['android2'])}
<rect x="520" y="110" width="660" height="720" rx="24" fill="#eff6ff" stroke="#4285f4" stroke-width="3"/>
<text x="550" y="150" font-size="22" font-weight="800" fill="#1d4ed8">{t['gcp']}</text>
{box(580,200,540,170,'#fff','#4285f4',t['run'],t['run2'],tc='#1d4ed8',ts=30,ss=17)}
{box(580,470,250,130,'#fff','#34a853',t['sql'],t['sql2'],tc='#15803d',ts=24,ss=15)}
{box(870,470,250,130,'#fff','#fbbc04',t['sec'],t['sec2'],tc='#a16207',ts=24,ss=15)}
{box(580,680,540,100,'#fff','#9ca3af',t['job'],t['job2'],ts=22,ss=15)}
{box(1300,180,250,120,'#fef2f2','#ea4335',t['gem'],t['gem2'],tc='#b91c1c',ts=26,ss=14)}
{box(1300,330,250,120,'#fef2f2','#ea4335',t['gid'],t['gid2'],tc='#b91c1c',ts=24,ss=15)}
{box(1300,480,250,100,'#f9fafb','#9ca3af',t['fonts'],t['fonts2'],ts=22,ss=15)}
<g stroke="#475569" stroke-width="3" fill="none">
<path d="M340 230 H450 V285"/><path d="M340 450 H450 V285"/><path d="M340 670 H450 V285"/>
<path d="M450 285 H578" marker-end="url(#a)"/>
<path d="M700 370 V468" marker-end="url(#a)"/><path d="M1000 370 V468" marker-end="url(#a)"/>
<path d="M700 678 V602" marker-end="url(#a)"/>
<path d="M1120 240 H1298" marker-end="url(#a)"/><path d="M1120 340 H1298" marker-end="url(#a)"/>
</g>
<g font-size="17" fill="#374151" font-weight="600">
<text x="395" y="272" text-anchor="middle">{t['https']}</text>
<text x="715" y="425">{t['sock']}</text>
<text x="1012" y="425">{t['secret']}</text>
<text x="1210" y="228" text-anchor="middle">{t['api']}</text>
<text x="1240" y="326" text-anchor="middle" font-size="15">{t['verify']}</text>
</g>
</svg>'''
    open(f'whylint-architecture-{lang}.svg','w').write(s)
