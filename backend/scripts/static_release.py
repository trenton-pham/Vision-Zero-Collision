"""Assemble and verify the public assets; never contact Atlas or promote a Worker."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import sys
import tarfile
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path, PurePosixPath
from time import sleep
from urllib.error import HTTPError
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from uuid import UUID

MAX_FILES = 20_000
MAX_FILE_SIZE = 25 * 1024 * 1024
MAX_ARCHIVE_SIZE = 100 * 1024 * 1024
MAX_EXPANDED_SIZE = 2 * 1024 * 1024 * 1024
RELEASE_PATH = re.compile(r"(?:meta|resolver|provenance|neighborhood-series)\.json|neighborhoods\.geojson|citywide/\d{4}-\d{4}/(?:[0-9]|[12][0-9]|3[01])\.json|explorer/\d{4}-\d{4}\.json|neighborhoods/[^/.]+\.json")
SECRET = re.compile(rb"mongodb(?:\+srv)?://|(?:ATLAS_PRIVATE_KEY|MONGODB_(?:URI|INGEST_URI|EXPORT_URI)|CLOUDFLARE_API_TOKEN)\s*[=:]|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\"(?:COLDETKEY|INCKEY|OBJECTID)\"", re.I)
HEADERS = """/data/current.json
  Cache-Control: no-store
/data/releases/*
  Cache-Control: public, max-age=31536000, immutable
/assets/*
  Cache-Control: public, max-age=31536000, immutable
/
  Cache-Control: no-cache
/index.html
  Cache-Control: no-cache
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
"""


def canonical(value: dict) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False).encode("ascii")


def digest(content: bytes) -> dict:
    return {"sha256": hashlib.sha256(content).hexdigest(), "size": len(content)}


def safe_path(name: str) -> str:
    path = PurePosixPath(name)
    if not name or path.is_absolute() or any(part in (".", "..") for part in name.split("/")) or "\\" in name or str(path) != name:
        raise ValueError("Unsafe asset path")
    return name


def inventory(root: Path) -> dict[str, dict]:
    files = {}
    for path in sorted(root.rglob("*")):
        if path.is_symlink() or not (path.is_file() or path.is_dir()):
            raise ValueError("Assets cannot contain links or special files")
        if path.is_file():
            name = safe_path(path.relative_to(root).as_posix())
            if any(part.startswith(".") for part in PurePosixPath(name).parts) or path.suffix in {".map", ".parquet", ".csv", ".py", ".pem", ".gz", ".zip"}:
                raise ValueError("Unexpected private or source asset")
            if path.stat().st_size > MAX_FILE_SIZE:
                raise ValueError("Asset exceeds the 25 MiB free limit")
            content = path.read_bytes()
            if SECRET.search(content):
                raise ValueError("Credential or raw collision field detected in public assets")
            files[name] = digest(content)
    if not files or len(files) > MAX_FILES:
        raise ValueError("Asset count exceeds the free limit or is empty")
    return files


def validate_manifest(manifest: dict) -> str:
    required = {"schemaVersion", "releaseId", "datasetVersion", "codeRevision", "dependencyFingerprint", "meta", "files"}
    if set(manifest) != required or manifest["schemaVersion"] != 1:
        raise ValueError("Unsupported release manifest")
    release_id = manifest["releaseId"]
    if not isinstance(release_id, str) or not re.fullmatch("[a-f0-9]{64}", release_id):
        raise ValueError("Invalid release ID")
    if hashlib.sha256(canonical({k: v for k, v in manifest.items() if k != "releaseId"})).hexdigest() != release_id:
        raise ValueError("Release manifest checksum mismatch")
    if not isinstance(manifest["files"], dict) or not {"meta.json", "resolver.json", "neighborhoods.geojson", "provenance.json"}.issubset(manifest["files"]):
        raise ValueError("Release is missing required data files")
    for name, expected in manifest["files"].items():
        if not RELEASE_PATH.fullmatch(safe_path(name)) or not isinstance(expected, dict) or set(expected) != {"sha256", "size"}:
            raise ValueError("Unexpected release data file")
        if not re.fullmatch("[a-f0-9]{64}", str(expected["sha256"])) or type(expected["size"]) is not int or not 0 <= expected["size"] <= MAX_FILE_SIZE:
            raise ValueError("Invalid file checksum or size")
    return release_id


def check(root: Path) -> dict:
    return _check_inventory(root, inventory(root))


def _check_inventory(root: Path, files: dict[str, dict]) -> dict:
    current = json.loads((root / "data/current.json").read_bytes())
    release_id = validate_manifest(current)
    releases = root / "data/releases"
    ids = [p.name for p in releases.iterdir()]
    if release_id not in ids or not 1 <= len(ids) <= 2:
        raise ValueError("Site must retain exactly the current and at most one previous release")
    allowed = {"data/current.json"}
    for retained_id in ids:
        folder = releases / retained_id
        manifest = json.loads((folder / "manifest.json").read_bytes())
        if validate_manifest(manifest) != retained_id:
            raise ValueError("Release directory does not match its manifest")
        if retained_id == release_id and manifest != current:
            raise ValueError("Current pointer differs from the immutable manifest")
        for name, expected in manifest["files"].items():
            public_name = f"data/releases/{retained_id}/{name}"
            if files.get(public_name) != expected:
                raise ValueError(f"Missing or corrupt release file: {name}")
            allowed.add(public_name)
        allowed.add(f"data/releases/{retained_id}/manifest.json")
        if json.loads((folder / "meta.json").read_bytes()) != manifest["meta"]:
            raise ValueError("Release metadata differs from the manifest")
    if {name for name in files if name.startswith("data/")} != allowed:
        raise ValueError("Unlisted public data file")
    if not (root / "index.html").is_file():
        raise ValueError("Missing frontend index")
    return current


def write_archive(root: Path, target: Path) -> None:
    files = inventory(root)
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=target.parent) as temp:
        index = Path(temp) / "archive-index.json"
        index.write_bytes(canonical(files))
        archive_path = Path(temp) / "current.tar.gz"
        with tarfile.open(archive_path, "w:gz", compresslevel=6) as archive:
            archive.add(index, arcname="archive-index.json")
            for name in files:
                archive.add(root / name, arcname=name, recursive=False)
        if archive_path.stat().st_size > MAX_ARCHIVE_SIZE:
            raise ValueError("Current archive exceeds 100 MiB; two archives must fit 200 MiB")
        shutil.copyfile(archive_path, target)


def extract_archive(archive_path: Path, root: Path) -> None:
    if archive_path.stat().st_size > MAX_ARCHIVE_SIZE:
        raise ValueError("Previous archive exceeds compressed size limit")
    with tarfile.open(archive_path, "r|gz") as archive:
        members = iter(archive)
        first = next(members, None)
        if first is None or first.name != "archive-index.json" or not first.isfile() or first.size > MAX_FILE_SIZE:
            raise ValueError("Previous archive must begin with its checksum inventory")
        expected = json.load(archive.extractfile(first))
        if not isinstance(expected, dict) or len(expected) > MAX_FILES:
            raise ValueError("Invalid archive inventory")
        seen = set()
        expanded = first.size
        for member in members:
            name = safe_path(member.name)
            expanded += member.size
            if name in seen or name not in expected or not member.isfile() or member.size > MAX_FILE_SIZE or expanded > MAX_EXPANDED_SIZE:
                raise ValueError("Unsafe, duplicate, or oversized archive member")
            seen.add(name)
            content = archive.extractfile(member).read()
            if digest(content) != expected[name]:
                raise ValueError("Previous archive checksum mismatch")
            target = root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
        if seen != set(expected):
            raise ValueError("Archive inventory mismatch")
    check(root)
    if len(list((root / "data/releases").iterdir())) != 1:
        raise ValueError("Archive must contain only its current release")


def assemble(export_dir: Path, frontend_dir: Path, output: Path, archive_output: Path, previous_archive: Path | None = None) -> dict:
    if output.exists():
        raise ValueError("Output must not exist; failed assembly must not replace a release")
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=output.parent) as temp:
        staged = Path(temp) / "site"
        shutil.copytree(frontend_dir, staged, symlinks=True)
        if (staged / "data").exists():
            raise ValueError("Frontend must not embed data")
        current = json.loads((export_dir / "data/current.json").read_bytes())
        release_id = validate_manifest(current)
        release = staged / "data/releases" / release_id
        shutil.copytree(export_dir / "data/releases" / release_id, release, symlinks=True)
        (staged / "data/current.json").write_bytes(canonical(current))
        for route in ("neighborhoods", "citywide"):
            shutil.copyfile(staged / "index.html", staged / f"{route}.html")
        (staged / "_headers").write_text(HEADERS)
        current = check(staged)
        if len(list((staged / "data/releases").iterdir())) != 1:
            raise ValueError("Exporter must produce one current release")
        current_archive = Path(temp) / "current.tar.gz"
        write_archive(staged, current_archive)
        if previous_archive is not None:
            previous = Path(temp) / "previous"
            previous.mkdir()
            extract_archive(previous_archive, previous)
            old = json.loads((previous / "data/current.json").read_bytes())
            if old["releaseId"] != current["releaseId"]:
                shutil.copytree(previous / "data/releases" / old["releaseId"], staged / "data/releases" / old["releaseId"])
            for asset in (previous / "assets").rglob("*"):
                if asset.is_file():
                    destination = staged / "assets" / asset.relative_to(previous / "assets")
                    if destination.exists() and destination.read_bytes() != asset.read_bytes():
                        raise ValueError("Hashed frontend asset collision")
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(asset, destination)
        check(staged)
        archive_output.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(current_archive, archive_output)
        shutil.move(str(staged), output)
    return current


def preflight(base_url: str, previous_site: Path | None = None) -> None:
    parsed = urlparse(base_url)
    if parsed.scheme != "https" or not parsed.hostname or not parsed.hostname.endswith(".workers.dev") or parsed.username or parsed.password or parsed.port or parsed.path not in ("", "/") or parsed.query or parsed.fragment:
        raise ValueError("Set STATIC_WEBSITE_URL to the actual production workers.dev origin")
    try:
        request = Request(base_url.rstrip("/") + "/data/current.json", headers={"User-Agent": "VisionZeroStaticVerifier/1.0"})
        with urlopen(request, timeout=60) as response:
            live = json.load(response)
    except HTTPError as error:
        if error.code == 404 and previous_site is None:
            return
        raise ValueError("Production website is unavailable despite a retained archive") from error
    if previous_site is None:
        raise ValueError("Production website exists but its recovery archive is missing")
    expected = check(previous_site)
    if live != expected:
        raise ValueError("Production website differs from the latest recovery archive; recover before publishing")


def smoke(base_url: str, root: Path) -> None:
    files = inventory(root)
    current = _check_inventory(root, files)
    base_url = base_url.rstrip("/")
    def get(name: str) -> tuple[bytes, object]:
        request = Request(base_url + "/" + name, headers={"User-Agent": "VisionZeroStaticVerifier/1.0"})
        for attempt in range(5):
            try:
                with urlopen(request, timeout=60) as response:
                    if response.status != 200:
                        raise ValueError("Unexpected HTTP status")
                    return response.read(), response.headers
            except HTTPError as error:
                if error.code not in {500, 502, 503, 504}:
                    raise
                ray = error.headers.get("CF-Ray", "unavailable") if error.headers else "unavailable"
                print(f"GET {request.full_url}: HTTP {error.code}, attempt {attempt + 1}/5, CF-Ray {ray}", file=sys.stderr, flush=True)
                error.close()
                if attempt == 4:
                    raise
                sleep(2 ** (attempt + 1))
    pointer, headers = get("data/current.json")
    if json.loads(pointer) != current or "no-store" not in headers.get("Cache-Control", ""):
        raise ValueError("Published pointer or its cache policy is wrong")
    manifest_path = f"data/releases/{current['releaseId']}/manifest.json"
    content, immutable_headers = get(manifest_path)
    if json.loads(content) != current or "immutable" not in immutable_headers.get("Cache-Control", ""):
        raise ValueError("Immutable manifest or its cache policy is wrong")
    for route in ("neighborhoods?startYear=2015&endYear=2016", "citywide?startYear=2015&endYear=2016"):
        content, _ = get(route)
        if content != (root / "index.html").read_bytes():
            raise ValueError("Dashboard deep link does not serve the app")
    samples = {"index.html", *[name for name in files if name.startswith("assets/")], *[f"data/releases/{current['releaseId']}/{name}" for name in current["files"] if name in {"meta.json", "resolver.json", "neighborhoods.geojson", "neighborhood-series.json"}]}
    samples.update(next((f"data/releases/{current['releaseId']}/{name}" for name in current["files"] if name.startswith(prefix)), "") for prefix in ("citywide/", "explorer/", "neighborhoods/"))
    def verify_asset(name: str) -> None:
        content, _ = get(name)
        if digest(content) != files[name]:
            raise ValueError("Published asset checksum mismatch")
    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(verify_asset, sorted(samples - {""})))
    try:
        get("data/releases/missing/not-found.json")
    except HTTPError as error:
        if error.code != 404:
            raise
    else:
        raise ValueError("Missing data must return 404, never the app shell")


def upload_result(path: Path) -> dict:
    entries = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
    uploads = [entry for entry in entries if entry.get("type") == "version-upload"]
    if len(uploads) != 1 or any(e.get("type") == "command-failed" for e in entries):
        raise ValueError("Wrangler did not record exactly one successful upload")
    entry = uploads[0]
    version_id = str(UUID(entry["version_id"]))
    preview_url = entry["preview_url"]
    parsed = urlparse(preview_url)
    if parsed.scheme != "https" or not parsed.hostname or not parsed.hostname.endswith(".workers.dev") or parsed.username or parsed.password or parsed.path not in ("", "/") or parsed.query or parsed.fragment or parsed.port:
        raise ValueError("Invalid Wrangler preview URL")
    return {"version_id": version_id, "preview_url": preview_url}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    assembly = commands.add_parser("assemble")
    for name in ("export-dir", "frontend-dir", "output", "archive-output"):
        assembly.add_argument("--" + name, type=Path, required=True)
    assembly.add_argument("--previous-archive", type=Path)
    for name in ("check", "smoke"):
        command = commands.add_parser(name)
        command.add_argument("--site", type=Path, required=True)
        if name == "smoke":
            command.add_argument("--url", required=True)
    preflight_command = commands.add_parser("preflight")
    preflight_command.add_argument("--url", required=True)
    preflight_command.add_argument("--previous-site", type=Path)
    upload = commands.add_parser("upload-result")
    upload.add_argument("--file", type=Path, required=True)
    args = parser.parse_args()
    if args.command == "assemble":
        result = assemble(args.export_dir, args.frontend_dir, args.output, args.archive_output, args.previous_archive)
        print(json.dumps({"releaseId": result["releaseId"], "datasetVersion": result["datasetVersion"]}))
    elif args.command == "check":
        result = check(args.site)
        print(json.dumps({"releaseId": result["releaseId"], "datasetVersion": result["datasetVersion"]}))
    elif args.command == "preflight":
        preflight(args.url, args.previous_site)
        print("Production preflight passed")
    elif args.command == "smoke":
        smoke(args.url, args.site)
        print("Published assets and cache headers verified")
    else:
        print(json.dumps(upload_result(args.file)))


if __name__ == "__main__":
    main()
