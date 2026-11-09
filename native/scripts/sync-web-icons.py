"""Export the web's vector icon paths into native platform asset formats."""
from pathlib import Path
import json
import re
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parents[2]
source = (ROOT / 'frontend/src/app/learning/icon.ts').read_text()
paths = re.findall(r"(?:^|\n)\s*(?:'([^']+)'|(\w+)):\s*'([^']+)'", source.split('@Component', 1)[0])
assert len(paths) >= 30, 'The web icon source format changed; review the exporter.'
android = ROOT / 'native/android/app/src/main/res/drawable'
ios = ROOT / 'native/ios/WhyLint/Assets.xcassets'
android.mkdir(parents=True, exist_ok=True)
ios.mkdir(parents=True, exist_ok=True)
for quoted, plain, data in paths:
    name = quoted or plain
    for filled in ([False, True] if name in ('like', 'save') else [False]):
        suffix = '-filled' if filled else ''
        stem = f'web-{name}{suffix}'
        svg = (
            '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">'
            f'<path d="{escape(data)}" fill="{"black" if filled else "none"}" '
            'stroke="black" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>\n'
        )
        folder = ios / (stem + '.imageset')
        folder.mkdir(exist_ok=True)
        (folder / (stem + '.svg')).write_text(svg)
        (folder / 'Contents.json').write_text(json.dumps({
            'images': [{'filename': stem + '.svg', 'idiom': 'universal'}],
            'info': {'author': 'xcode', 'version': 1},
            'properties': {'preserves-vector-representation': True, 'template-rendering-intent': 'template'},
        }, indent=2) + '\n')
        (android / (stem.replace('-', '_') + '.xml')).write_text(
            '<vector xmlns:android="http://schemas.android.com/apk/res/android" '
            'android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">\n'
            f'    <path android:pathData="{escape(data)}" '
            f'android:fillColor="{"#FF000000" if filled else "#00000000"}" '
            'android:strokeColor="#FF000000" android:strokeWidth="1.7" '
            'android:strokeLineCap="round" android:strokeLineJoin="round"/>\n</vector>\n'
        )
print(f'Exported {len(paths)} web icons (plus selected-state variants) for both native apps.')
