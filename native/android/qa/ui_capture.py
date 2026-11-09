"""ADB helpers for the owned Android emulator. Never targets a physical device."""
import os
from pathlib import Path
import re
import subprocess
import time
import xml.etree.ElementTree as ET

ADB = os.environ.get('ANDROID_HOME', str(Path.home()/'Library/Android/sdk'))+'/platform-tools/adb'
SERIAL = os.environ.get('WHYLINT_EMULATOR', 'emulator-5554')
assert SERIAL.startswith('emulator-'), 'Use a disposable emulator.'
OUT = Path(__file__).resolve().parent

def adb(*args):
    return subprocess.check_output([ADB, '-s', SERIAL, *args])

def nodes():
    for attempt in range(5):
        dump=subprocess.run([ADB,'-s',SERIAL,'shell','uiautomator','dump','/sdcard/whylint-ui.xml'],capture_output=True)
        if b'dumped' in dump.stdout:
            try:
                result=list(ET.fromstring(adb('exec-out','cat','/sdcard/whylint-ui.xml')).iter('node'))
                if any(n.get('package')=='app.whylint.nativeapp' for n in result): return result
            except ET.ParseError: pass
        time.sleep(.4)
    raise AssertionError('UI automation snapshot temporarily unavailable')

def labels():
    return [n.get('text','').strip() for n in nodes()]

def tap(label, contains=False):
    for n in reversed(nodes()):
        if n.get("enabled")=="false": continue
        values=[n.get('text','').strip(),n.get('content-desc','').strip()]
        if label in values or (contains and any(label in v for v in values)):
            x1,y1,x2,y2=map(int,re.findall(r'\d+',n.get('bounds')))
            adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2))
            time.sleep(.5)
            return
    raise AssertionError('UI control unavailable: '+label)

def shot(name):
    time.sleep(.4)
    (OUT/(name+'.png')).write_bytes(adb('exec-out','screencap','-p'))

def field(index,value):
    fields=[n for n in nodes() if n.get('class')=='android.widget.EditText']
    x1,y1,x2,y2=map(int,re.findall(r'\d+',fields[index].get('bounds')))
    adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2))
    adb('shell','input','text',value.replace(' ','%s'))
    time.sleep(.2)

def scroll_to(label):
    for _ in range(7):
        if label in labels():return
        adb('shell','input','swipe','1000','1900','1000','650','300')
        time.sleep(.3)
    raise AssertionError('UI control unreachable: '+label)

def close_sheet():
    for _ in range(4):
        if any(label in labels() for label in ('プロフィール','Profile')): return
        adb('shell','input','keyevent','4')
        time.sleep(.5)
