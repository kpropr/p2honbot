"""Run on the VPS; never prints secrets. Existing environment is preserved."""
from pathlib import Path
import secrets
import os
public_url = os.environ.get("PUBLIC_URL")
if not public_url or not public_url.startswith("https://"):
    raise SystemExit("Set PUBLIC_URL to the HTTPS Mini App URL.")
path = Path('/opt/petuhon/.env')
if not path.exists():
    password = secrets.token_hex(32)
    path.write_text(f'POSTGRES_PASSWORD={password}\nDATABASE_URL=postgres://petuhon:{password}@db:5432/petuhon\nBOT_TOKEN=\nPUBLIC_URL={public_url}\nNODE_ENV=production\nHOST=0.0.0.0\nPORT=8081\n')
    path.chmod(0o600)
print('Environment file ready; secrets not displayed.')
