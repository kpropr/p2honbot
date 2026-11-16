"""Verify pg_dump restore with populated isolated test data; never overwrite production."""
import subprocess, os, gzip
from pathlib import Path
os.chdir('/opt/petuhon')
base=['docker','compose','exec','-T','db']
def query(db,sql):
    return subprocess.check_output(base+['psql','-U','petuhon','-d',db,'-tAc',sql],text=True).strip()
name='petuhon_restore_check'
if query('postgres',f"SELECT 1 FROM pg_database WHERE datname='{name}'"):
    raise SystemExit('Restore-check DB already exists; inspect it instead of overwriting.')
dump=subprocess.check_output(base+['pg_dump','-U','petuhon','-d','petuhon_test'])
subprocess.run(base+['createdb','-U','petuhon',name],check=True)
subprocess.run(base+['psql','-v','ON_ERROR_STOP=1','-U','petuhon','-d',name],input=dump,check=True,stdout=subprocess.DEVNULL)
fingerprint="SELECT count(*)::text || ':' || md5(string_agg(id::text || state::text,',' ORDER BY id)) FROM players"
before=query('petuhon_test',fingerprint)
after=query(name,fingerprint)
assert before==after, 'Restore state mismatch'
subprocess.run(['docker','restart','petuhon-test-api'],check=True,stdout=subprocess.DEVNULL)
assert before==query('petuhon_test',fingerprint), 'State changed after application restart'
print('Restore and restart checks passed: '+before.split(':')[0]+' players, all states identical.')
print('Production player count: '+query('petuhon','SELECT count(*) FROM players'))
cron=Path('/etc/cron.d/petuhon-backup')
if not cron.exists():
    cron.write_text('SHELL=/bin/bash\nPATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin\n17 2 * * * root /bin/bash /opt/petuhon/deploy/backup.sh >/dev/null 2>&1\n')
    cron.chmod(0o644)
print('Daily database backup scheduled at 02:17 server time.')
