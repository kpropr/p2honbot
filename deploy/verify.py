"""Isolated database integration and load test. Does not modify production players."""
import os
import subprocess
from pathlib import Path
os.chdir('/opt/petuhon')
values = dict(line.split('=', 1) for line in Path('.env').read_text().splitlines() if '=' in line and not line.startswith('#'))
env = dict(os.environ, DATABASE_URL=values['DATABASE_URL'].rsplit('/', 1)[0] + '/petuhon_test')
def run(args, **kwargs):
    return subprocess.run(args, check=True, env=env, **kwargs)
existing = run(['docker','compose','exec','-T','db','psql','-U','petuhon','-d','postgres','-tAc',"SELECT 1 FROM pg_database WHERE datname='petuhon_test'"],capture_output=True,text=True).stdout
if not existing.strip():
    run(['docker','compose','exec','-T','db','createdb','-U','petuhon','petuhon_test'])
run(['docker','compose','run','--rm','--no-deps','-e','DATABASE_URL','-e','NODE_ENV=test','-e','RUN_DB_TESTS=1','-v','/opt/petuhon/artifacts/test-build/tests:/app/build/tests:ro','app','node','--test','build/tests/integration.test.js'])
run(['docker','compose','run','-d','--no-deps','--name','petuhon-test-api','-p','127.0.0.1:8082:8081','-e','DATABASE_URL','-e','BOT_TOKEN=load-test-only','app'])
print('Isolated test API started on localhost:8082. Production database untouched.')
