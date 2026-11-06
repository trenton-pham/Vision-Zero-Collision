from __future__ import annotations

import io
import json
import tarfile
from pathlib import Path

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
    from urllib.error import HTTPError
    from unittest.mock import MagicMock
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
