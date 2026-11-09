"""Native UI smoke against the disposable stack on host3130, fixture APK only.
Run: python3 qa/ui_smoke.py
Requires the APK copied to qa/builds/whylint-fixture-debug.apk by the documented build.
Resets ONLY app.whylint.nativeapp on WHYLINT_EMULATOR (an emulator serial).
"""
from ui_capture import *
from urllib.request import urlopen
import time
import json
from zipfile import ZipFile

apk=OUT/'builds/whylint-fixture-debug.apk'
assert apk.is_file(), 'Build and copy the fixture APK first.'
with ZipFile(apk) as archive:
    assert any(b'http://10.0.2.2:3130' in archive.read(name) for name in archive.namelist() if name.endswith('.dex')), 'This is not a fixture-targeting APK.'
with urlopen('http://127.0.0.1:3130/api/v1/learning/catalog',timeout=4) as response:
    assert response.status==200
adb('install','-r',str(apk))
adb('shell','pm','clear','app.whylint.nativeapp')
adb('shell','cmd','uimode','night','yes')
adb('shell','am','start','-n','app.whylint.nativeapp/.MainActivity')
time.sleep(2)
shot('android-onboarding-dark')
tap('スキップしてすぐ始める →')
time.sleep(2)
shot('android-feed-dark')
tap('3行目:',True)
time.sleep(.7)
assert '正解！' in labels()
shot('android-feed-answered-dark')
print('PASS: guest feed and grading',flush=True)
tap('プロフィール')
tap('設定')
shot('android-settings-dark')
tap('ライト')
shot('android-settings-light')
tap('さらに大きい')
shot('android-settings-larger-light')
tap('標準')
tap('フィード')
shot('android-feed-light')
tap('プロフィール')
tap('ログイン')
shot('android-login-light')
tap('アカウントを作成')
shot('android-signup-light')
suffix=str(int(time.time()))
email='android'+suffix+'@example.test'
username='android'+suffix
password='WhyLint-fixture-password-26'
(OUT/'builds/ui-test-account.json').write_text(json.dumps({'username':username,'email':email,'password':password}))
field(0,email);field(1,username);field(2,password)
adb('shell','input','keyevent','4')
tap('アカウントを作成')
time.sleep(2)
assert '何を学びたいですか？' in labels()
shot('android-onboarding-light')
tap('フロントエンド')
scroll_to('次へ');tap('次へ')
shot('android-onboarding-step2-light')
scroll_to('学習を始める');tap('学習を始める')
time.sleep(2)
shot('android-feed-account-light')
print('PASS: real signup and preference persistence',flush=True)
tap('プロフィール')
assert email in labels()
shot('android-profile-account-light')
adb('shell','am','force-stop','app.whylint.nativeapp')
adb('shell','am','start','-n','app.whylint.nativeapp/.MainActivity')
time.sleep(2)
tap('プロフィール')
assert email in labels()
print('PASS: Keystore session restored after process restart',flush=True)
tap('設定');tap('アカウント設定');scroll_to('ログアウト');tap('ログアウト')
time.sleep(1)
assert 'ログイン' in labels() and email not in labels()
tap('ログイン')
field(0,username);field(1,password);adb('shell','input','keyevent','4');tap('ログイン')
time.sleep(2)
tap('プロフィール');assert email in labels()
print('PASS: logout and password re-login',flush=True)
tap('設定');tap('アカウント設定');scroll_to('ログアウト');tap('ログアウト');time.sleep(.5)
shot('android-logout-light')
print('PASS: no account data after logout',flush=True)
