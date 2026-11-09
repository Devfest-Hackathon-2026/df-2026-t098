"""Continuation after ui_smoke, using an existing fixture account only.
Set WHYLINT_FIXTURE_USERNAME to the synthetic account to exercise.
Creates a separate synthetic commenter via local API for Helpful ownership testing.
"""
from ui_capture import *
from urllib.request import Request,urlopen
import json,os,time

def request(path,body=None,token=None,method='POST'):
    headers={'Content-Type':'application/json'}
    if token:headers['Authorization']='Bearer '+token
    req=Request('http://127.0.0.1:3130/api/v1'+path,data=None if body is None else json.dumps(body).encode(),headers=headers,method=method)
    with urlopen(req,timeout=10)as r:return json.load(r)

def fill(label,value):
    for _ in range(5):
        for n in nodes():
            if n.get('content-desc','')==label:
                x1,y1,x2,y2=map(int,re.findall(r'\d+',n.get('bounds')))
                adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2));adb('shell','input','text',value.replace(' ','%s'));return
        adb('shell','input','swipe','1000','1850','1000','650','300');time.sleep(.4)
    raise AssertionError('Missing input '+label)

account_file=OUT/'builds/ui-test-account.json'
account=json.loads(account_file.read_text()) if account_file.exists() else {}
username=os.environ.get('WHYLINT_FIXTURE_USERNAME',account.get('username','android_native_qa'))
password=account.get('password','WhyLint-fixture-password-26')
actor=request('/auth/mobile/signup',{'email':'helper'+str(int(time.time()))+'@example.test','username':'helper'+str(int(time.time())),'password':password})
q=request('/learning/daily?language=ja',method='GET')['question']
request('/learning/questions/'+q['id']+'/comments',{'text':'Helpful native fixture answer','kind':'comment'},actor['token'])
del actor
adb('install','-r',str(OUT/'builds/whylint-fixture-debug.apk'));adb('shell','am','force-stop','app.whylint.nativeapp');adb('shell','am','start','-n','app.whylint.nativeapp/.MainActivity');time.sleep(2)
tap('プロフィール')
if 'ログアウト' in labels():tap('ログアウト');time.sleep(.5)
tap('ログイン');field(0,username);field(1,password);adb('shell','input','keyevent','4');tap('ログイン');time.sleep(1)
tap('フィード');tap('保存');time.sleep(.4);tap('コメント');time.sleep(1)
reader=request('/auth/mobile/password/login',{'identifier':username,'password':password})['token']
def votes():return {c['id'] for c in request('/learning/questions/'+q['id']+'/comments',token=reader,method='GET')['comments'] if c['helpful']}
before=votes();tap('役に立った');time.sleep(.8);assert votes()!=before, 'Helpful vote did not change server state'

tap('返信');fill('コメントを書く','Native Android fixture reply');adb('shell','input','keyevent','4');tap('投稿する');time.sleep(1);assert any(c['text']=='Native Android fixture reply' and c.get('parentId') for c in request('/learning/questions/'+q['id']+'/comments',token=reader,method='GET')['comments']);shot('android-reply-helpful-light');print('PASS: reply and helpful',flush=True)
close_sheet();tap('プロフィール');scroll_to('保存した問題');tap('保存した問題');time.sleep(1);assert q['title'] in labels();shot('android-saved-list-light');print('PASS: saved question list',flush=True)
tap('投稿');fill('タイトル','Why does HTTP caching need validation?');fill('質問','Explain why a browser validates an expired cache entry before reusing a response.');adb('shell','input','keyevent','4');fill('お手本の説明','HTTP validators let the server confirm the cached representation is current before it is reused.');adb('shell','input','keyevent','4');scroll_to('質問を投稿');shot('android-publication-filled-light');tap('質問を投稿');time.sleep(3);assert 'Why does HTTP caching need validation?' in labels() or any('Explain why a browser validates' in t for t in labels());shot('android-publication-success-light');print('PASS: native community publication',flush=True)
