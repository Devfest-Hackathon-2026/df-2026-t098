import argparse
from pathlib import Path
import re

parser = argparse.ArgumentParser()
parser.add_argument('client_id', help='Public iOS OAuth client ID for app.whylint.native')
args = parser.parse_args()

client_id = args.client_id.strip()
if not re.fullmatch(r'[0-9]+-[a-zA-Z0-9-]+\.apps\.googleusercontent\.com', client_id):
    parser.error('Enter a public Google OAuth client ID ending in .apps.googleusercontent.com')

callback_scheme = '.'.join(reversed(client_id.split('.')))
config = Path(__file__).resolve().parents[1] / 'GoogleSignIn.local.xcconfig'
config.write_text(
    f'WHYLINT_GOOGLE_IOS_CLIENT_ID = {client_id}\n'
    f'WHYLINT_GOOGLE_REVERSED_CLIENT_ID = {callback_scheme}\n'
)
print('Saved the iOS client ID and its callback scheme. Rebuild WhyLint to load them.')
