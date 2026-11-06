from pathlib import Path

import pytest

from backend.output_files import staged_outputs


def test_publication_failure_restores_old_files_and_removes_new_files(tmp_path, monkeypatch):
    output = tmp_path / 'outputs'
    output.mkdir()
    for name in ['a.json', 'c.json', 'manifest.json', 'unrelated.txt']:
        (output / name).write_text(f'old {name}')
    before = {path.name: path.read_bytes() for path in output.iterdir()}
    replace = Path.replace

    def fail_late(source, target):
        if source.parent.name == 'new' and source.name == 'c.json':
            raise OSError('Publication failed')
        return replace(source, target)

    monkeypatch.setattr(Path, 'replace', fail_late)
    with pytest.raises(OSError, match='Publication failed'):
        with staged_outputs(output) as staged:
            for name in ['a.json', 'b.json', 'c.json', 'manifest.json']:
                (staged / name).write_text('new')
    assert {path.name: path.read_bytes() for path in output.iterdir()} == before
    assert list(tmp_path.iterdir()) == [output]


def test_failed_restore_keeps_recovery_files(tmp_path, monkeypatch):
    output = tmp_path / 'outputs'
    output.mkdir()
    (output / 'a.json').write_text('old')
    replace = Path.replace

    def fail_publication_and_restore(source, target):
        if source.name == 'b.json' or source.parent.name == 'old':
            raise OSError('Disk unavailable')
        return replace(source, target)

    monkeypatch.setattr(Path, 'replace', fail_publication_and_restore)
    with pytest.raises(BaseExceptionGroup, match='recovery files retained'):
        with staged_outputs(output) as staged:
            (staged / 'a.json').write_text('new')
            (staged / 'b.json').write_text('new')
    recovery = next(tmp_path.glob('.output-stage-outputs-*'))
    assert (recovery / 'old/a.json').read_text() == 'old'
