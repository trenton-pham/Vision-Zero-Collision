from __future__ import annotations

import io
import json
import tarfile
from pathlib import Path
from threading import Barrier, Lock
from types import SimpleNamespace
from urllib.error import HTTPError
from urllib.parse import urlparse
from unittest.mock import MagicMock

import pytest

from backend.scripts.static_release import (
    MAX_FILE_SIZE, assemble, canonical, check, digest, extract_archive, preflight, upload_result,
)


def export(tmp_path: Path, version: str, *, include_series: bool = False) -> Path:
    root = tmp_path / f"export-{version}"
    payloads = {
        "meta.json": canonical({"datasetVersion": version}),
        "resolver.json": b'{"projection":"test","features":[]}',
        "provenance.json": b'{"python":"3.11"}',
        "neighborhoods.geojson": b'{"type":"FeatureCollection","features":[]}',
        "citywide/2015-2016/0.json": b'{"summary":{}}',
        "explorer/2015-2016.json": b'{"summary":{}}',
        "neighborhoods/test.json": b'{"contexts":{}}',
    }
    if include_series:
        payloads["neighborhood-series.json"] = b'{"neighborhoods":{}}'
    manifest = {"schemaVersion": 1, "datasetVersion": version, "codeRevision": "abc", "dependencyFingerprint": "def", "meta": {"datasetVersion": version}, "files": {name: digest(content) for name, content in payloads.items()}}
    manifest["releaseId"] = digest(canonical(manifest))["sha256"]
    release = root / "data/releases" / manifest["releaseId"]
    for name, content in payloads.items():
        target = release / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
    (release / "manifest.json").write_bytes(canonical(manifest))
    (root / "data/current.json").write_bytes(canonical(manifest))
    return root


def frontend(tmp_path: Path, version: str) -> Path:
    root = tmp_path / f"frontend-{version}"
    (root / "assets").mkdir(parents=True)
    (root / "index.html").write_text(f'<script src="/assets/app-{version}.js"></script>')
    (root / "assets" / f"app-{version}.js").write_text(f'console.log("{version}")')
    return root


def release(tmp_path: Path, version: str, previous: Path | None = None) -> tuple[Path, Path]:
    site, archive = tmp_path / f"site-{version}", tmp_path / f"archive-{version}.tar.gz"
    assemble(export(tmp_path, version), frontend(tmp_path, version), site, archive, previous)
    return site, archive


def test_assembly_keeps_only_current_and_previous_and_archives_only_current(tmp_path):
    _, first = release(tmp_path, "one")
    _, second = release(tmp_path, "two", first)
    site, third = release(tmp_path, "three", second)
    manifests = [json.loads(path.read_bytes()) for path in (site / "data/releases").glob("*/manifest.json")]
    assert {m["datasetVersion"] for m in manifests} == {"two", "three"}
    assert {path.name for path in (site / "assets").iterdir()} == {"app-two.js", "app-three.js"}
    extracted = tmp_path / "extracted"
    extract_archive(third, extracted)
    assert check(extracted)["datasetVersion"] == "three"
    assert len(list((extracted / "data/releases").iterdir())) == 1
    assert {path.name for path in (extracted / "assets").iterdir()} == {"app-three.js"}


def test_assembly_and_recovery_accept_combined_neighborhood_data(tmp_path):
    site, archive = tmp_path / "site", tmp_path / "current.tar.gz"
    manifest = assemble(export(tmp_path, "combined", include_series=True), frontend(tmp_path, "combined"), site, archive)
    series = f"data/releases/{manifest['releaseId']}/neighborhood-series.json"
    assert json.loads((site / series).read_bytes()) == {"neighborhoods": {}}
    restored = tmp_path / "restored"
    extract_archive(archive, restored)
    assert check(restored) == manifest
    assert (restored / series).read_bytes() == (site / series).read_bytes()


def test_manifest_tamper_fails_without_replacing_existing_site(tmp_path):
    site, _ = release(tmp_path, "one")
    before = (site / "data/current.json").read_bytes()
    damaged = export(tmp_path, "two")
    payload = next(damaged.glob("data/releases/*/meta.json"))
    payload.write_text("{}")
    with pytest.raises(ValueError, match="corrupt"):
        assemble(damaged, frontend(tmp_path, "two"), tmp_path / "failed", tmp_path / "failed.tar.gz")
    assert not (tmp_path / "failed").exists()
    assert not (tmp_path / "failed.tar.gz").exists()
    assert (site / "data/current.json").read_bytes() == before


@pytest.mark.parametrize("name,kind", [("../escape", "file"), ("/absolute", "file"), ("assets/link", "link"), ("assets/large", "large"), ("assets/repeat", "duplicate")])
def test_unsafe_archive_is_rejected(tmp_path, name, kind):
    archive = tmp_path / "bad.tar.gz"
    with tarfile.open(archive, "w:gz") as tar:
        content = canonical({name: digest(b"")})
        index = tarfile.TarInfo("archive-index.json")
        index.size = len(content)
        tar.addfile(index, io.BytesIO(content))
        entry = tarfile.TarInfo(name)
        if kind == "link":
            entry.type, entry.linkname = tarfile.SYMTYPE, "/tmp/escape"
        elif kind == "large":
            entry.size = MAX_FILE_SIZE + 1
        if kind != "large":
            tar.addfile(entry, io.BytesIO())
            if kind == "duplicate":
                tar.addfile(entry, io.BytesIO())
        else:
            # A declared huge member is enough; extraction must reject before reading.
            tar.fileobj.write(entry.tobuf())
    reason = "Unsafe asset path" if name.startswith(("/", "..")) else "Unsafe, duplicate, or oversized archive member"
    with pytest.raises(ValueError, match=reason):
        extract_archive(archive, tmp_path / "unpacked")
    assert not (tmp_path / "escape").exists()


def test_corrupt_previous_archive_fails_closed(tmp_path):
    bad = tmp_path / "bad.tar.gz"
    bad.write_bytes(b"corrupt")
    with pytest.raises(tarfile.ReadError):
        assemble(export(tmp_path, "one"), frontend(tmp_path, "one"), tmp_path / "failed", tmp_path / "current.tar.gz", bad)
    assert not (tmp_path / "failed").exists()
    assert not (tmp_path / "current.tar.gz").exists()


@pytest.mark.parametrize("name,content", [("data/raw.json", b"{}"), ("assets/secret.js", b'mongodb+srv://user:password@example'), ("assets/raw.js", b'{"COLDETKEY":1}'), ("assets/source.map", b"{}")])
def test_unexpected_public_files_fail(tmp_path, name, content):
    site, _ = release(tmp_path, "one")
    target = site / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content)
    with pytest.raises(ValueError):
        check(site)


def test_modified_manifest_identity_fails(tmp_path):
    site, _ = release(tmp_path, "one")
    pointer = site / "data/current.json"
    manifest = json.loads(pointer.read_bytes())
    manifest["datasetVersion"] = "forged"
    pointer.write_bytes(canonical(manifest))
    with pytest.raises(ValueError, match="manifest checksum"):
        check(site)


def test_archive_inventory_detects_tampered_frontend(tmp_path):
    _, archive = release(tmp_path, "one")
    bad = tmp_path / "tampered.tar.gz"
    with tarfile.open(archive, "r:gz") as source, tarfile.open(bad, "w:gz") as target:
        for member in source.getmembers():
            content = source.extractfile(member).read()
            if member.name == "index.html":
                content = b"changed"
                member.size = len(content)
            target.addfile(member, io.BytesIO(content))
    with pytest.raises(ValueError, match="checksum"):
        extract_archive(bad, tmp_path / "unpacked")


def test_uploaded_version_is_read_from_structured_output(tmp_path):
    output = tmp_path / "upload.ndjson"
    entry = {"type": "version-upload", "version_id": "095f00a7-23a7-43b7-a227-e4c97cab5f22", "preview_url": "https://095f00a7-vision-zero-collision.example.workers.dev"}
    output.write_text(json.dumps({"type": "wrangler-session"}) + "\n" + json.dumps(entry))
    assert upload_result(output) == {key: entry[key] for key in ("version_id", "preview_url")}
    entry["preview_url"] = "https://evil.example"
    output.write_text(json.dumps(entry))
    with pytest.raises(ValueError, match="preview URL"):
        upload_result(output)


def test_assembler_ignores_orphaned_export_releases(tmp_path):
    source = export(tmp_path, "one")
    orphan = source / "data/releases/orphan"
    orphan.mkdir()
    (orphan / "raw.json").write_text('{}')
    site = tmp_path / "site"
    assemble(source, frontend(tmp_path, "one"), site, tmp_path / "current.tar.gz")
    assert len(list((site / "data/releases").iterdir())) == 1
    assert (site / "neighborhoods.html").read_bytes() == (site / "index.html").read_bytes()
    assert (site / "citywide.html").read_bytes() == (site / "index.html").read_bytes()


def test_preflight_distinguishes_first_deployment_and_missing_archive(tmp_path, monkeypatch):
    import backend.scripts.static_release as module
    def missing(*args, **kwargs):
        raise HTTPError('https://example.workers.dev/data/current.json', 404, 'Missing', {}, None)
    monkeypatch.setattr(module, 'urlopen', missing)
    preflight('https://example.workers.dev')
    site, _ = release(tmp_path, 'one')
    with pytest.raises(ValueError, match='unavailable'):
        preflight('https://example.workers.dev', site)
    response = MagicMock()
    response.__enter__.return_value.read.return_value = (site / 'data/current.json').read_bytes()
    monkeypatch.setattr(module, 'urlopen', lambda *a, **kw: response)
    with pytest.raises(ValueError, match='archive is missing'):
        preflight('https://example.workers.dev')
    preflight('https://example.workers.dev', site)
    with pytest.raises(ValueError, match='actual production'):
        preflight('https://evil.example')


@pytest.fixture
def smoke_remote(tmp_path, monkeypatch):
    import backend.scripts.static_release as module

    site, _ = release(tmp_path, 'one')
    remote = SimpleNamespace(site=site, failures={}, bodies={}, headers={}, requests=[], delays=[])

    def get(request, timeout):
        assert timeout == 60
        name = urlparse(request.full_url).path.lstrip('/')
        remote.requests.append(name)
        failures = remote.failures.get(name, [])
        if failures:
            raise HTTPError(request.full_url, failures.pop(0), 'Unavailable', {'CF-Ray': 'test-ray'}, io.BytesIO())
        path = site / ('index.html' if name in {'neighborhoods', 'citywide'} else name)
        if not path.is_file():
            raise HTTPError(request.full_url, 404, 'Not found', {}, None)
        response = MagicMock()
        response.__enter__.return_value.status = 200
        response.__enter__.return_value.read.return_value = remote.bodies.get(name, path.read_bytes())
        cache = 'no-store' if name == 'data/current.json' else 'public, max-age=31536000, immutable'
        response.__enter__.return_value.headers = remote.headers.get(name, {'Cache-Control': cache})
        return response

    monkeypatch.setattr(module, 'urlopen', get)
    monkeypatch.setattr(module, 'sleep', remote.delays.append)
    return remote


@pytest.mark.parametrize('status', [500, 502, 503, 504])
@pytest.mark.parametrize('name', ['data/current.json', 'assets/app-one.js'])
def test_smoke_recovers_from_temporary_server_errors(smoke_remote, status, name, capsys):
    from backend.scripts.static_release import smoke

    smoke_remote.failures[name] = [status]
    smoke('https://preview.example.workers.dev', smoke_remote.site)
    assert smoke_remote.requests.count(name) == 2
    assert smoke_remote.delays == [2]
    assert smoke_remote.requests.count('data/releases/missing/not-found.json') == 1
    assert f'HTTP {status}, attempt 1/5, CF-Ray test-ray' in capsys.readouterr().err


def test_smoke_stops_after_five_server_errors(smoke_remote):
    from backend.scripts.static_release import smoke

    smoke_remote.failures['data/current.json'] = [500] * 5
    with pytest.raises(HTTPError) as error:
        smoke('https://preview.example.workers.dev', smoke_remote.site)
    assert error.value.code == 500
    assert smoke_remote.requests == ['data/current.json'] * 5
    assert smoke_remote.delays == [2, 4, 8, 16]


@pytest.mark.parametrize('status', [403, 404])
def test_smoke_does_not_retry_client_errors(smoke_remote, status):
    from backend.scripts.static_release import smoke

    smoke_remote.failures['data/current.json'] = [status]
    with pytest.raises(HTTPError) as error:
        smoke('https://preview.example.workers.dev', smoke_remote.site)
    assert error.value.code == status
    assert smoke_remote.requests == ['data/current.json']
    assert smoke_remote.delays == []


@pytest.mark.parametrize('failure', ['pointer', 'cache', 'checksum'])
def test_smoke_still_rejects_invalid_published_content(smoke_remote, failure):
    from backend.scripts.static_release import smoke

    if failure == 'pointer':
        smoke_remote.bodies['data/current.json'] = b'{}'
    elif failure == 'cache':
        smoke_remote.headers['data/current.json'] = {'Cache-Control': 'public'}
    else:
        smoke_remote.bodies['assets/app-one.js'] = b'changed'
    with pytest.raises(ValueError, match='pointer|checksum'):
        smoke('https://preview.example.workers.dev', smoke_remote.site)
    assert smoke_remote.delays == []


def test_smoke_checks_assets_concurrently_without_skipping_any(smoke_remote, monkeypatch):
    import backend.scripts.static_release as module

    original = module.urlopen
    ready = Barrier(2, timeout=5)
    lock = Lock()
    active = 0
    maximum = 0
    names = {'assets/app-one.js', 'index.html'}

    def get(request, timeout):
        nonlocal active, maximum
        name = urlparse(request.full_url).path.lstrip('/')
        if name not in names:
            return original(request, timeout)
        with lock:
            active += 1
            maximum = max(maximum, active)
        try:
            ready.wait()
            return original(request, timeout)
        finally:
            with lock:
                active -= 1

    monkeypatch.setattr(module, 'urlopen', get)
    module.smoke('https://preview.example.workers.dev', smoke_remote.site)
    assert maximum == 2
    assert all(smoke_remote.requests.count(name) == 1 for name in names)
    assert smoke_remote.requests.count('data/releases/missing/not-found.json') == 1
