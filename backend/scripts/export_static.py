from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile

from dotenv import load_dotenv

from backend.app.data import DataStore, DEFAULT_ARTIFACT_DIR
from backend.app.repository import MongoDatasetRepository
from backend.app.static_export import (
    canonical_json, dependency_provenance, digest, verify_inventory, write_export,
)


ROOT = Path(__file__).resolve().parents[2]


def source_revision() -> str:
    revision = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    paths = ["backend", "frontend/src", "frontend/package.json", "frontend/package-lock.json", "pyproject.toml", "uv.lock", "wrangler.jsonc"]
    dirty = subprocess.check_output(["git", "status", "--porcelain", "--", *paths], cwd=ROOT)
    if not dirty:
        return revision
    names = subprocess.check_output(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "--", *paths], cwd=ROOT, text=True,
    ).splitlines()
    hashes = {name: digest((ROOT / name).read_bytes()) for name in sorted(set(names)) if (ROOT / name).is_file()}
    return f"{revision}-worktree-{digest(canonical_json(hashes))[:16]}"


def export_static(
    output: Path,
    store: DataStore,
    *,
    code_revision: str,
    verify: bool = False,
) -> dict:
    output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".static-candidate-", dir=output) as temporary:
        candidate = Path(temporary)
        manifest = write_export(
            store, candidate, code_revision=code_revision,
            provenance=dependency_provenance(ROOT / "uv.lock"), verify=verify,
        )
        release = output / "data/releases" / manifest["releaseId"]
        release.parent.mkdir(parents=True, exist_ok=True)
        if release.exists():
            verify_inventory(release, manifest)
        else:
            candidate.rename(release)
        current = output / "data/.current.json"
        current.write_bytes(canonical_json(manifest))
        current.replace(output / "data/current.json")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description="Export validated dashboard responses as immutable static files")
    parser.add_argument("--output", type=Path, default=ROOT / "build/export")
    parser.add_argument("--backend", choices=("artifacts", "mongodb"), default="artifacts")
    parser.add_argument("--artifact-dir", type=Path, default=DEFAULT_ARTIFACT_DIR)
    parser.add_argument("--dataset-version")
    parser.add_argument("--code-revision")
    parser.add_argument("--verify", action="store_true")
    parser.add_argument("--env-file", type=Path, help="Load an explicitly selected local secrets file")
    args = parser.parse_args()
    if args.env_file:
        if not args.env_file.is_file():
            parser.error("The selected environment file does not exist")
        load_dotenv(args.env_file, override=False)
    revision = args.code_revision or source_revision()
    if args.backend == "mongodb":
        uri = os.getenv("MONGODB_URI")
        if not uri:
            parser.error("MONGODB_URI is required for MongoDB export")
        repository = MongoDatasetRepository(uri, os.getenv("MONGODB_DATABASE", "seattle_collision"))
        try:
            state = repository.active_state()
            version = args.dataset_version or str(state["activeVersion"])
            bundle = repository.load_version(version, state=state)
            store = DataStore(bundle=bundle)
        finally:
            repository.close()
    else:
        store = DataStore(args.artifact_dir)
        if args.dataset_version and args.dataset_version != store.manifest["datasetVersion"]:
            parser.error("Requested dataset version does not match the artifacts")
    manifest = export_static(args.output, store, code_revision=revision, verify=args.verify)
    print(json.dumps({
        "status": "exported", "releaseId": manifest["releaseId"],
        "datasetVersion": manifest["datasetVersion"], "files": len(manifest["files"]),
        "rawBytes": sum(item["size"] for item in manifest["files"].values()),
        "verified": args.verify,
    }))


if __name__ == "__main__":
    main()
