from __future__ import annotations

from html import escape
import os
from pathlib import Path
import subprocess
import sys
from textwrap import dedent
from urllib.parse import quote

import pytest

from backend.scripts.publication_diagnostics import report, sanitize


@pytest.fixture
def credentials():
    password = 'Atlas/p@ss#word'
    return {
        'MONGODB_URI': f'mongodb+srv://reader:{quote(password, safe="")}@cluster.example/test',
        'ATLAS_PRIVATE_KEY': 'atlas-private-key-example',
    }


def test_sanitization_removes_uris_credentials_and_encoded_variants(credentials):
    password = 'Atlas/p@ss#word'
    text = '\n'.join([
        credentials['MONGODB_URI'], quote(credentials['MONGODB_URI'], safe=''),
        password, quote(password, safe=''), credentials['ATLAS_PRIVATE_KEY'],
        'mongodb://other:unknown@another.example/db?authSource=admin',
        'Authentication failed; retry the export',
    ])
    sanitized = sanitize(text, credentials)
    for secret in [password, quote(password, safe=''), 'reader', 'unknown', credentials['ATLAS_PRIVATE_KEY']]:
        assert secret not in sanitized
    assert 'mongodb' not in sanitized.lower().replace('mongodb uri', '')
    assert 'Authentication failed; retry the export' in sanitized


def test_failure_report_preserves_diagnostics_without_secrets_or_workflow_commands(tmp_path, credentials, capsys):
    log, summary = tmp_path / 'export.log', tmp_path / 'summary.md'
    log.write_text(f'::error::untrusted command\nTraceback:\n{credentials["MONGODB_URI"]}\nValueError: <bad dataset>\n')
    result = report(log, 'Static export', 17, {**credentials, 'GITHUB_STEP_SUMMARY': str(summary)})
    output = capsys.readouterr().out
    assert output.startswith('::stop-commands::')
    assert 'Static export failed (exit 17)' in result
    assert 'ValueError: <bad dataset>' in result
    assert credentials['MONGODB_URI'] not in output + summary.read_text()
    assert escape('<bad dataset>') in summary.read_text()
    assert '<bad dataset>' not in summary.read_text()
    assert log.read_text().count(credentials['MONGODB_URI']) == 1


def test_failure_report_redacts_before_truncating_and_bounds_output(tmp_path, credentials):
    log = tmp_path / 'large.log'
    log.write_text(('noise\n' * 300) + credentials['MONGODB_URI'] + '\n' + 'x' * 9000 + '\nFinal error')
    result = report(log, 'Atlas ingestion', 1, credentials)
    assert len(result.split('\n', 1)[1].encode()) <= 8192
    assert result.endswith('Final error')
    assert credentials['MONGODB_URI'] not in result


def test_success_reports_lock_warning_even_before_a_long_manifest(tmp_path, capsys):
    log = tmp_path / 'sync.log'
    warning = 'RuntimeWarning: Could not release publication lock owned by abc; confirm the writer has stopped'
    log.write_text(warning + '\n' + '{}\n' * 300)
    result = report(log, 'Atlas ingestion', 0, {})
    assert warning in result
    assert 'publication lock warning' in capsys.readouterr().out


def test_ordinary_success_is_quiet(tmp_path, capsys):
    log = tmp_path / 'sync.log'
    log.write_text('{"status":"published"}\n')
    assert report(log, 'Atlas ingestion', 0, {}) == ''
    assert capsys.readouterr().out == ''


def test_empty_failure_log_has_a_visible_message(tmp_path):
    log = tmp_path / 'empty.log'
    log.touch()
    assert 'No diagnostic output was captured.' in report(log, 'Static export', 1, {})


@pytest.mark.parametrize("step", ["Refresh Atlas from ArcGIS", "Export the published Atlas dataset"])
def test_workflow_reports_failures_and_preserves_exit_status(tmp_path, credentials, step):
    workflow = Path('.github/workflows/monthly-collision-sync.yml').read_text()
    block = workflow.split(f'      - name: {step}\n', 1)[1].split('      - name:', 1)[0]
    script = dedent(block.split('        run: |\n', 1)[1])
    summary = tmp_path / 'summary.md'
    environment = {
        **os.environ, **credentials, 'RUNNER_TEMP': str(tmp_path), 'DRY_RUN': 'false',
        'ALLOW_ROW_DECREASE': 'false', 'SYNC_DATASET_VERSION': '',
        'GITHUB_STEP_SUMMARY': str(summary), 'PATH': str(Path(sys.executable).parent) + os.pathsep + os.environ['PATH'],
    }
    fake_command = "uv() { printf '%s\\n' \"$MONGODB_URI\" 'Validation failed'; return 17; }\n"
    result = subprocess.run(
        ['bash', '-e', '-o', 'pipefail', '-c', fake_command + script],
        env=environment, text=True, capture_output=True,
    )
    assert result.returncode == 17, result.stderr
    assert 'Validation failed' in result.stdout
    assert credentials['MONGODB_URI'] not in result.stdout + result.stderr + summary.read_text()
    assert 'failed (exit 17)' in summary.read_text()


def test_secret_replacement_cannot_break_uri_redaction():
    text = "mongodb://unknown:unlisted-password@another.example/db"
    assert 'unlisted-password' not in sanitize(text, {'ATLAS_PRIVATE_KEY': 'db'})
