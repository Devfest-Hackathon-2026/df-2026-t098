"""Store-policy smoke on the emulator against the disposable stack on host 3130 (fixture APK only).
Covers legal links and the support contact, reporting a comment, blocking and unblocking its
author, and deleting an account. Run: python3 qa/safety_smoke.py
Requires qa/builds/whylint-fixture-debug.apk built with -PWHYLINT_API_URL=http://10.0.2.2:3130.
Resets ONLY app.whylint.nativeapp on WHYLINT_EMULATOR. Accounts are synthetic and local.
"""
from ui_capture import *
import json
import time
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from zipfile import ZipFile

API = 'http://127.0.0.1:3130/api/v1'
PASSWORD = 'WhyLint-fixture-password-26'

apk = OUT/'builds/whylint-fixture-debug.apk'
assert apk.is_file(), 'Build and copy the fixture APK first.'
with ZipFile(apk) as archive:
    assert any(b'http://10.0.2.2:3130' in archive.read(name) for name in archive.namelist() if name.endswith('.dex')), 'This is not a fixture-targeting APK.'

def call(path, method='GET', token=None, body=None):
    request = Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None)
    if body is not None: request.add_header('Content-Type', 'application/json')
    if token: request.add_header('Authorization', 'Bearer ' + token)
    try:
        with urlopen(request, timeout=10) as response:
            raw = response.read()
            return response.status, (json.loads(raw) if raw else {})
    except HTTPError as error:
        return error.code, {}

def signup(label):
    tag = label + str(int(time.time() * 1000) % 10**9)
    email, username = tag + '@example.test', tag
    status, created = call('/auth/mobile/signup', 'POST', body={'email': email, 'username': username, 'password': PASSWORD})
    assert status == 201, status
    token = created['token']
    assert call('/learning/preferences', 'PUT', token, {'interests': ['frontend'], 'technologies': ['JavaScript'], 'difficulty': 'beginner', 'language': 'ja'})[0] == 200
    return {'email': email, 'username': username, 'token': token, 'id': call('/auth/me', token=token)[1]['id']}

assert call('/learning/catalog')[0] == 200
adb('install', '-r', str(apk))
adb('shell', 'pm', 'clear', 'app.whylint.nativeapp')
adb('shell', 'cmd', 'uimode', 'night', 'yes')
adb('shell', 'am', 'start', '-n', 'app.whylint.nativeapp/.MainActivity')
time.sleep(2)
tap('スキップしてすぐ始める →')
time.sleep(2)

# Legal links and the support contact: Settings and the sign-in screen.
tap('プロフィール')
tap('設定')
scroll_to('プライバシーポリシー')
assert '利用規約' in labels() and 'サポート:' in ' '.join(labels()).replace('サポート: ', 'サポート:')
assert 'support@example.test' in labels()
shot('android-profile-legal-links')
print('PASS: Settings shows privacy policy, terms and support contact', flush=True)
for _ in range(4):
    adb('shell', 'input', 'swipe', '1000', '700', '1000', '1900', '300')
tap('ログイン')
scroll_to('プライバシーポリシー')
assert '利用規約' in labels()
shot('android-signin-legal-links')
adb('shell', 'input', 'keyevent', '4')
print('PASS: sign-in screen shows privacy policy and terms', flush=True)

# Report a comment, block its author, unblock.
author, reader = signup('author'), signup('reader')
daily = call('/learning/daily?language=ja', token=reader['token'])[1]['question']['id']
tag = str(int(time.time()))[-6:]
first, second = 'fixture-first-' + tag, 'fixture-second-' + tag
for text in (first, second):
    assert call(f'/learning/questions/{daily}/comments', 'POST', author['token'], {'text': text})[0] == 201
tap('ログイン')
field(0, reader['username']); field(1, PASSWORD)
adb('shell', 'input', 'keyevent', '4')
tap('ログイン')
time.sleep(2.5)
tap('フィード')
time.sleep(1.5)
tap('コメント', True)
time.sleep(1.5)
assert first in labels() and second in labels()
tap('報告')
tap('嫌がらせ・攻撃的')
shot('android-report-comment')
tap('報告を送信')
time.sleep(1.5)
current = labels()
assert first not in current and second in current, 'The reported comment must disappear for the reporter'
assert any('報告を受け付けました' in label for label in current)
print('PASS: reported comment is hidden from the reporter', flush=True)
tap('ブロック')
shot('android-block-confirmation')
tap('ブロック')
time.sleep(1.5)
assert second not in labels(), 'Blocking must hide the author comments'
assert call('/learning/blocks', token=reader['token'])[1]['users'][0]['id'] == author['id']
print('PASS: blocked author comments disappear', flush=True)
adb('shell', 'input', 'keyevent', '4')
tap('プロフィール')
tap('設定')
tap('アカウント設定')
scroll_to('ブロックを解除', )
shot('android-blocked-list')
tap('ブロックを解除', True)
time.sleep(1.5)
scroll_to('ブロックしているユーザーはいません。')
assert call('/learning/blocks', token=reader['token'])[1]['users'] == []
print('PASS: unblock from Account settings', flush=True)

# Delete the account: cancel keeps it, confirm removes it.
scroll_to('アカウントを削除')
tap('アカウントを削除')
shot('android-delete-confirmation')
tap('キャンセル')
assert call('/auth/me', token=reader['token'])[0] == 200
tap('アカウントを削除')
tap('完全に削除')
time.sleep(2)
assert any('アカウントを削除しました' in label for label in labels())
assert call('/auth/me', token=reader['token'])[0] == 401
assert call('/auth/mobile/password/login', 'POST', body={'identifier': reader['email'], 'password': PASSWORD})[0] == 401
shot('android-account-deleted')
adb('shell', 'am', 'force-stop', 'app.whylint.nativeapp')
adb('shell', 'am', 'start', '-n', 'app.whylint.nativeapp/.MainActivity')
time.sleep(2)
tap('プロフィール')
assert 'ログイン' in labels() and reader['email'] not in labels()
print('PASS: account deleted on the server and on the device', flush=True)
