"""Read a bot token from stdin, validate it and activate an existing deployment.

Never include the token in command-line arguments or print it to logs.
An existing webhook is reported without its URL; remove it explicitly before
switching a bot that is already managed by another service to long polling.
"""
import json
import os
import re
import subprocess
import sys
import urllib.request
from pathlib import Path


def telegram(token, method):
    try:
        request = urllib.request.Request(
            f'https://api.telegram.org/bot{token}/{method}',
            data=b'{}', headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(request, timeout=20) as response:
            result = json.load(response)
        if not result.get('ok'):
            raise ValueError('Telegram rejected request')
        return result['result']
    except Exception:
        raise SystemExit(f'Telegram {method} failed; token and URL are not logged.')


token = sys.stdin.read().strip().lstrip('\ufeff')
if not re.fullmatch(r'\d+:[A-Za-z0-9_-]{30,}', token):
    raise SystemExit('Token file has an invalid format.')
me = telegram(token, 'getMe')
print('Validated bot: @' + me['username'], flush=True)
if telegram(token, 'getWebhookInfo').get('url'):
    raise SystemExit('Existing webhook detected. Resolve it before enabling long polling; no changes made.')

os.chdir('/opt/petuhon')
path = Path('.env')
lines = path.read_text().splitlines()
lines = [line for line in lines if not line.startswith('BOT_TOKEN=')]
lines.append('BOT_TOKEN=' + token)
path.write_text('\n'.join(lines) + '\n')
path.chmod(0o600)
subprocess.run(['docker', 'compose', '--profile', 'bot', 'up', '-d', 'app', 'bot'], check=True)
print('Bot and application configured. Token is stored only in the server environment file.')
