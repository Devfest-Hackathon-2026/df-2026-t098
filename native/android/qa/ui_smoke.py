"""Native UI smoke against the disposable stack on host3130, fixture APK only.
Run: python3 qa/ui_smoke.py
Requires the APK copied to qa/builds/whylint-fixture-debug.apk by the documented build.
Resets ONLY app.whylint.nativeapp on WHYLINT_EMULATOR (an emulator serial).
"""
from ui_capture import *
from urllib.request import Request, urlopen
import time
import json
from zipfile import ZipFile

apk=OUT/'builds/whylint-fixture-debug.apk'
assert apk.is_file(), 'Build and copy the fixture APK first.'
with ZipFile(apk) as archive:
    assert any(b'http://10.0.2.2:3130' in archive.read(name) for name in archive.namelist() if name.endswith('.dex')), 'This is not a fixture-targeting APK.'
with urlopen('http://127.0.0.1:3130/api/v1/learning/catalog',timeout=4) as response:
    assert response.status==200
base='http://127.0.0.1:3130/api/v1/learning'
with urlopen(base+'/daily?language=ja',timeout=4) as response:
    daily=json.load(response)['question']
with urlopen(Request(
    f"{base}/questions/{daily['id']}/taps",
    data=b'{"choice":0}',
    headers={'Content-Type':'application/json'},
    method='POST',
),timeout=4) as response:
    correct=daily['options'][json.load(response)['correctOption']]
adb('install','-r',str(apk))
adb('shell','pm','clear','app.whylint.nativeapp')
subprocess.run(
    [ADB,'-s',SERIAL,'shell',
     "run-as app.whylint.nativeapp sh -c 'mkdir -p shared_prefs && cat > shared_prefs/display.xml'"],
    input=b'<?xml version="1.0" encoding="utf-8" standalone="yes" ?><map><string name="language">ja</string></map>',
    check=True,
)
adb('shell','cmd','uimode','night','yes')
adb('shell','am','start','-n','app.whylint.nativeapp/.MainActivity')
time.sleep(2)
shot('android-onboarding-dark')
tap('スキップしてすぐ始める →')
time.sleep(2)
shot('android-feed-dark')
tap(f'{correct}行目:' if daily['format']=='spot_bug' else correct, daily['format']=='spot_bug')
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
# Keep the Keystore session and simulate a build missing its local completion flag.
display_prefs='shared_prefs/display.xml'
adb('shell',f"""run-as app.whylint.nativeapp sed -i '/name="onboarded"/d' {display_prefs}""")
assert b'name="onboarded"' not in adb('exec-out','run-as','app.whylint.nativeapp','cat',display_prefs)
adb('shell','am','start','-n','app.whylint.nativeapp/.MainActivity')
time.sleep(2)
tap('プロフィール')
assert email in labels()
assert b'name="onboarded" value="true"' in adb('exec-out','run-as','app.whylint.nativeapp','cat',display_prefs)
print('PASS: returning Keystore session restores account onboarding without reopening it',flush=True)
tap('設定');tap('アカウント設定');scroll_to('ログアウト');tap('ログアウト')
time.sleep(1)
tap('プロフィールに戻る')
assert 'ログイン' in labels() and email not in labels()
tap('ログイン')
field(0,username);field(1,password);adb('shell','input','keyevent','4');tap('ログイン')
time.sleep(2)
tap('プロフィール');assert email in labels()
print('PASS: logout and password re-login',flush=True)
tap('設定');tap('アカウント設定');scroll_to('ログアウト');tap('ログアウト');time.sleep(1)
tap('プロフィールに戻る')
assert 'ログイン' in labels() and email not in labels()
shot('android-logout-light')
print('PASS: no account data after logout',flush=True)
