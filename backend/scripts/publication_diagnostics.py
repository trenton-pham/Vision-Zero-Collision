from __future__ import annotations

import argparse
from html import escape
import json
import os
from pathlib import Path
import re
from urllib.parse import quote, quote_plus, unquote, urlsplit
from uuid import uuid4


SECRET_NAMES = (
    "MONGODB_URI", "MONGODB_INGEST_URI", "MONGODB_EXPORT_URI",
    "CLOUDFLARE_API_TOKEN", "ATLAS_PUBLIC_KEY", "ATLAS_PRIVATE_KEY",
    "GH_TOKEN", "GITHUB_TOKEN",
)


def sanitize(text: str, environment: dict[str, str]) -> str:
    text = re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", text)
    text = re.sub(r"mongodb(?:\+srv)?://[^\s\"'<>]+", "[REDACTED MONGODB URI]", text, flags=re.IGNORECASE)
    secrets = {environment[name] for name in SECRET_NAMES if environment.get(name)}
    for name in ("MONGODB_URI", "MONGODB_INGEST_URI", "MONGODB_EXPORT_URI"):
        try:
            uri = urlsplit(environment.get(name, ""))
            secrets.update(value for value in (uri.username, uri.password) if value)
        except ValueError:
            pass
    variants = set()
    for secret in secrets:
        for value in (secret, unquote(secret)):
            variants.update((value, quote(value, safe=""), quote_plus(value), json.dumps(value)[1:-1]))
    for secret in sorted(variants, key=len, reverse=True):
        text = text.replace(secret, "[REDACTED]")
    return text


def report(log: Path, stage: str, exit_code: int, environment: dict[str, str]) -> str:
    text = sanitize(log.read_text(errors="replace"), environment)
    if exit_code:
        text = "\n".join(text.splitlines()[-128:]).encode()[-8192:].decode(errors="ignore")
        title = f"{stage} failed (exit {exit_code})"
        text = text or "No diagnostic output was captured."
    else:
        text = "\n".join(line for line in text.splitlines() if "Could not release publication lock" in line)
        if not text:
            return ""
        title = f"{stage} publication lock warning"
    rendered = f"{title}\n{text}"
    token = uuid4().hex
    print(f"::stop-commands::{token}\n{rendered}\n::{token}::")
    if environment.get("GITHUB_STEP_SUMMARY"):
        with Path(environment["GITHUB_STEP_SUMMARY"]).open("a") as summary:
            summary.write(f"\n### {escape(title)}\n\n<pre>{escape(text)}</pre>\n")
    return rendered


def main() -> None:
    parser = argparse.ArgumentParser(description="Report sanitized publication diagnostics")
    parser.add_argument("--log", type=Path, required=True)
    parser.add_argument("--stage", choices=("Atlas ingestion", "Static export"), required=True)
    parser.add_argument("--exit-code", type=int, required=True)
    args = parser.parse_args()
    report(args.log, args.stage, args.exit_code, dict(os.environ))


if __name__ == "__main__":
    main()
