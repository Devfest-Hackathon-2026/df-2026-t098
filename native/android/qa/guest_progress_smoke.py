"""Verify guest progress on a disposable Android emulator and the fixture backend."""

import json
import sys
import time
from pathlib import Path
from urllib.request import Request, urlopen
from uuid import uuid4
from zipfile import ZipFile

from ui_capture import adb, field, labels, nodes, scroll_to, tap

BASE = "http://127.0.0.1:3130/api/v1"
PACKAGE = "app.whylint.nativeapp"


def api(path, body=None):
    request = Request(BASE + path)
    if body is not None:
        request.add_header("Content-Type", "application/json")
        request.data = json.dumps(body).encode()
    with urlopen(request, timeout=10) as response:
        return json.load(response)


def wait_for(check, description):
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        try:
            if check():
                return
        except AssertionError:
            pass
        time.sleep(0.5)
    raise AssertionError(description)


apk = Path(sys.argv[1])
with ZipFile(apk) as archive:
    assert any(
        b"http://10.0.2.2:3130" in archive.read(name)
        for name in archive.namelist()
        if name.endswith(".dex")
    ), "The APK must point at the disposable backend."
assert api("/learning/catalog")
adb("install", "-r", str(apk))
adb("shell", "pm", "clear", PACKAGE)
adb("shell", "input", "keyevent", "82")
adb("shell", "am", "start", "-n", PACKAGE + "/.MainActivity")
wait_for(lambda: "English" in labels(), "Onboarding did not open")
tap("日本語")
tap("フロントエンド", True)
scroll_to("次へ")
tap("次へ")
scroll_to("学習を始める")
tap("学習を始める")

question = api("/learning/daily?language=ja")["question"]
choice = api("/learning/questions/" + question["id"] + "/taps", {"choice": 0})["correctOption"]
if question["format"] == "spot_bug":
    target = f"{choice + 1}行目:"
    wait_for(
        lambda: any(target in n.get("content-desc", "") for n in nodes()),
        "The guest quiz did not load",
    )
    tap(target, True)
else:
    tap(question["options"][choice], True)
wait_for(lambda: "正解！" in labels(), "The guest's correct answer was not shown")

tap("プロフィール")
tap("ログイン")
suffix = uuid4().hex[:12]
email = f"android-guest-{suffix}@example.test"
username = f"guest_{suffix}"
password = "FixtureOnly-Password-7130"
existing = "--existing-account" in sys.argv[2:]
if existing:
    account = api("/auth/mobile/signup", {"email": email, "username": username, "password": password})
    assert account.get("token"), "Could not create the fixture account"
    field(0, email)
    field(1, password)
else:
    tap("アカウントを作成")
    field(0, email)
    field(1, username)
    field(2, password)
adb("shell", "input", "keyevent", "4")
tap("ログイン" if existing else "アカウントを作成")
wait_for(lambda: "プロフィール" in labels(), "Authentication did not return to the app")
tap("プロフィール")
scroll_to("正解した問題")
wait_for(
    lambda: any(n.get("resource-id") == "profile-correctTaps" and n.get("text") == "1 / 1" for n in nodes()),
    "Profile did not show one correct answer",
)
assert any(
    n.get("resource-id") == "profile-totalXp" and n.get("text") == "5" for n in nodes()
), "Profile did not show 5 XP"
flow = "password sign-in" if existing else "signup"
print(f"PASS: Android Profile shows 1 / 1 correct and 5 XP after {flow}")
