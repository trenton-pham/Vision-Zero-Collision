from __future__ import annotations

import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys
from types import SimpleNamespace

import pytest
import yaml


WORKFLOW = Path('.github/workflows/monthly-collision-sync.yml')


def job(name):
    return yaml.safe_load(WORKFLOW.read_text())['jobs'][name]


def script(job_name, step_name):
    return next(step['run'] for step in job(job_name)['steps'] if step.get('name') == step_name)


def run(script_text, tmp_path, **environment):
    return subprocess.run(
        ['bash', '-e', '-o', 'pipefail', '-c', script_text], cwd=tmp_path,
        env={**os.environ, 'PATH': str(Path(sys.executable).parent) + os.pathsep + os.environ['PATH'],
             'RUNNER_TEMP': str(tmp_path), 'GITHUB_OUTPUT': str(tmp_path / 'output'), **environment},
        text=True, capture_output=True,
    )


@pytest.mark.parametrize('action,status,expected', [
    ('publish-only', '', True), ('refresh-and-publish', 'published', True),
    ('refresh-and-publish', 'no_change', True), ('refresh-and-publish', 'dry_run', False),
    ('website-rollback', '', False),
])
def test_preparation_only_exports_a_published_dataset(tmp_path, action, status, expected):
    fake_uv = '''uv() { printf '%s\\n' '{"datasetVersion":"pinned-version"}'; }
python() { command "''' + sys.executable + '''" "$@"; }
'''
    result = run(fake_uv + script('prepare_publication', 'Pin the published dataset for every shard'), tmp_path,
                 ACTION=action, SYNC_STATUS=status, SYNC_DATASET_VERSION='', GITHUB_STEP_SUMMARY=str(tmp_path / 'summary'))
    assert result.returncode == 0, result.stderr
    output = (tmp_path / 'output').read_text()
    assert f'export_needed={str(expected).lower()}\n' in output
    assert ('dataset_version=pinned-version\n' in output) is expected


@pytest.mark.parametrize('failed_result', ['failure', 'skipped', 'cancelled'])
def test_verification_gate_rejects_any_incomplete_check(tmp_path, failed_result):
    command = shlex.split(script('verify', 'Require every verification job'))[2]
    results = {name: {'result': 'success'} for name in ['artifacts', 'backend', 'frontend', 'export', 'assemble', 'browser']}
    good = subprocess.run([sys.executable, '-c', command], env={**os.environ, 'RESULTS': json.dumps(results)}, capture_output=True)
    assert good.returncode == 0
    for name in results:
        failed = {**results, name: {'result': failed_result}}
        result = subprocess.run([sys.executable, '-c', command], env={**os.environ, 'RESULTS': json.dumps(failed)}, capture_output=True)
        assert result.returncode != 0, name


@pytest.mark.parametrize('verified,prepared,exported,needed,cancelled,allowed', [
    ('success', 'success', 'success', 'true', False, True),
    ('success', 'success', 'skipped', 'false', False, True),
    ('success', 'success', 'skipped', 'true', False, False),
    ('success', 'success', 'failure', 'true', False, False),
    ('failure', 'success', 'success', 'true', False, False),
    ('success', 'failure', 'skipped', 'false', False, False),
    ('success', 'success', 'success', 'true', True, False),
])
def test_publication_gate_handles_rollback_and_failed_exports(verified, prepared, exported, needed, cancelled, allowed):
    condition = job('publish')['if']
    condition = re.sub(r'!(?!=)', 'not ', condition.replace('&&', 'and').replace('||', 'or'))
    needs = SimpleNamespace(
        verify=SimpleNamespace(result=verified), production_export=SimpleNamespace(result=exported),
        prepare_publication=SimpleNamespace(result=prepared, outputs=SimpleNamespace(export_needed=needed)),
    )
    assert eval(condition.replace('\n', ' '), {'__builtins__': {}}, {'needs': needs, 'always': lambda: True, 'cancelled': lambda: cancelled}) is allowed


@pytest.fixture
def atlas_stub(tmp_path):
    state = tmp_path / 'atlas.json'
    state.write_text(json.dumps({'entries': {}, 'requests': []}))
    stub = tmp_path / 'curl_stub.py'
    stub.write_text('''import json, os, sys
from pathlib import Path
args = sys.argv[1:]
state = Path(os.environ['ATLAS_STUB_STATE'])
data = json.loads(state.read_text())
url = args[-1]
method = args[args.index('--request') + 1] if '--request' in args else 'GET'
ip = url.rsplit('/', 1)[1]
if ip == 'status':
    sequence = data.get('statuses', ['ACTIVE'])
    value = sequence.pop(0) if len(sequence) > 1 else sequence[0]
    data['requests'].append(['STATUS', value])
    state.write_text(json.dumps(data))
    if value == 'HTTP_ERROR':
        raise SystemExit(22)
    print(json.dumps({'STATUS': value}))
    raise SystemExit
if 'api.ipify.org' in url:
    print('198.51.100.7', end='')
    raise SystemExit
entry = data['entries'].get(ip)
data['requests'].append([method, ip])
if method == 'POST':
    record = json.loads(args[args.index('--data') + 1])[0]
    data['entries'][record['ipAddress']] = record
elif method == 'DELETE':
    data['entries'].pop(ip, None)
else:
    Path(args[args.index('--output') + 1]).write_text(json.dumps(entry or {}))
    print('200' if entry else '404', end='')
state.write_text(json.dumps(data))
if method == 'POST' and data.get('post_race'):
    raise SystemExit(22)
''')
    functions = '''curl() { "$TEST_PYTHON" "$CURL_STUB" "$@"; }
date() { printf '%s\\n' '2026-11-06T22:00:00Z'; }
sleep() { echo "$1" >> "$RUNNER_TEMP/sleeps"; SECONDS=$((SECONDS + $1)); }
'''
    environment = {'TEST_PYTHON': sys.executable, 'CURL_STUB': str(stub), 'ATLAS_STUB_STATE': str(state),
                   'GITHUB_RUN_ID': '123', 'ATLAS_PUBLIC_KEY': 'public', 'ATLAS_PRIVATE_KEY': 'private',
                   'ATLAS_PROJECT_ID': 'project', 'ACTION': 'publish-only'}
    return state, functions, environment


def test_shared_ip_is_removed_once_after_all_readers_finish(tmp_path, atlas_stub):
    state, functions, environment = atlas_stub
    allow = script('production_export', 'Temporarily allow this runner in Atlas')
    for index in range(2):
        result = run(functions + allow, tmp_path, **environment)
        assert result.returncode == 0, result.stderr
        target = tmp_path / 'atlas-readers' / str(index)
        target.mkdir(parents=True)
        (target / 'atlas-runner-ip.txt').write_text((tmp_path / 'atlas-runner-ip.txt').read_text())
        assert '198.51.100.7' in json.loads(state.read_text())['entries']
    assert not (tmp_path / 'sleeps').exists()
    assert all(step.get('name') != 'Remove temporary Atlas access even after failure' for step in job('production_export')['steps'])
    cleanup = script('cleanup_atlas', 'Remove matrix readers only after all exports finish')
    result = run(functions + cleanup, tmp_path, **environment)
    assert result.returncode == 0, result.stderr
    data = json.loads(state.read_text())
    assert data['entries'] == {}
    assert data['requests'].count(['DELETE', '198.51.100.7']) == 1


def test_unrelated_atlas_access_is_never_modified_or_deleted(tmp_path, atlas_stub):
    state, functions, environment = atlas_stub
    original = {'ipAddress': '198.51.100.7', 'comment': 'managed outside this run'}
    state.write_text(json.dumps({'entries': {'198.51.100.7': original}, 'requests': []}))
    result = run(functions + script('production_export', 'Temporarily allow this runner in Atlas'), tmp_path, **environment)
    assert result.returncode == 0, result.stderr
    assert not (tmp_path / 'atlas-runner-ip.txt').exists()
    stale = tmp_path / 'atlas-readers' / 'stale'
    stale.mkdir(parents=True)
    (stale / 'atlas-runner-ip.txt').write_text('198.51.100.7\n')
    result = run(functions + script('cleanup_atlas', 'Remove matrix readers only after all exports finish'), tmp_path, **environment)
    assert result.returncode == 0, result.stderr
    data = json.loads(state.read_text())
    assert data['entries']['198.51.100.7'] == original
    assert not any(method in {'POST', 'DELETE'} for method, _ in data['requests'])


def test_reader_recovers_when_another_reader_creates_shared_access_first(tmp_path, atlas_stub):
    state, functions, environment = atlas_stub
    state.write_text(json.dumps({'entries': {}, 'requests': [], 'post_race': True}))
    result = run(functions + script('production_export', 'Temporarily allow this runner in Atlas'), tmp_path, **environment)
    assert result.returncode == 0, result.stderr
    data = json.loads(state.read_text())
    assert [method for method, _ in data['requests']] == ['GET', 'POST', 'GET', 'STATUS']
    assert data['entries']['198.51.100.7']['comment'] == 'collision-publication-123'
    assert not (tmp_path / 'sleeps').exists()


@pytest.mark.parametrize('job_name', ['prepare_publication', 'production_export'])
def test_atlas_admission_waits_past_twenty_seconds_until_active(tmp_path, atlas_stub, job_name):
    state, functions, environment = atlas_stub
    state.write_text(json.dumps({'entries': {}, 'requests': [], 'statuses': ['PENDING'] * 5 + ['ACTIVE']}))
    result = run(functions + script(job_name, 'Temporarily allow this runner in Atlas'), tmp_path, **environment)
    assert result.returncode == 0, result.stderr
    requests = json.loads(state.read_text())['requests']
    assert [value for method, value in requests if method == 'STATUS'] == ['PENDING'] * 5 + ['ACTIVE']
    assert (tmp_path / 'sleeps').read_text().splitlines() == ['5'] * 5


@pytest.mark.parametrize('status', ['FAILED', 'unexpected', 'HTTP_ERROR', 'PENDING'])
@pytest.mark.parametrize('job_name', ['prepare_publication', 'production_export'])
def test_atlas_admission_fails_without_active_access(tmp_path, atlas_stub, status, job_name):
    state, functions, environment = atlas_stub
    state.write_text(json.dumps({'entries': {}, 'requests': [], 'statuses': [status]}))
    result = run(functions + script(job_name, 'Temporarily allow this runner in Atlas'), tmp_path, **environment)
    assert result.returncode != 0
    assert (tmp_path / 'atlas-runner-ip.txt').read_text().strip() == '198.51.100.7'
    if status == 'PENDING':
        assert 'Timed out waiting' in result.stdout
        assert len((tmp_path / 'sleeps').read_text().splitlines()) <= 24
    else:
        assert not (tmp_path / 'sleeps').exists()


def test_existing_foreign_access_must_also_be_active(tmp_path, atlas_stub):
    state, functions, environment = atlas_stub
    state.write_text(json.dumps({
        'entries': {'198.51.100.7': {'comment': 'managed outside this run'}},
        'requests': [], 'statuses': ['PENDING', 'ACTIVE'],
    }))
    result = run(functions + script('production_export', 'Temporarily allow this runner in Atlas'), tmp_path, **environment)
    assert result.returncode == 0, result.stderr
    requests = json.loads(state.read_text())['requests']
    assert [value for method, value in requests if method == 'STATUS'] == ['PENDING', 'ACTIVE']
    assert not (tmp_path / 'atlas-runner-ip.txt').exists()
    assert not any(method in {'POST', 'DELETE'} for method, _ in requests)
