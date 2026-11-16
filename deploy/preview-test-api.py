"""Reconfigure the isolated test API for a localhost UI preview."""
import os, subprocess
from pathlib import Path
os.chdir('/opt/petuhon')
values=dict(line.split('=',1) for line in Path('.env').read_text().splitlines() if '=' in line and not line.startswith('#'))
env=dict(os.environ,DATABASE_URL=values['DATABASE_URL'].rsplit('/',1)[0]+'/petuhon_test')
subprocess.run(['docker','rm','-f','petuhon-test-api'],check=True)
subprocess.run(['docker','compose','run','-d','--no-deps','--name','petuhon-test-api','-p','127.0.0.1:8082:8081','-e','DATABASE_URL','-e','BOT_TOKEN=load-test-only','-e','NODE_ENV=development','-e','PUBLIC_URL=http://localhost:5173/play/','app'],env=env,check=True)
