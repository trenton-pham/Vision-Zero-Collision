from __future__ import annotations

import json

from backend.app.config import Settings
from backend.app.mongo_writer import MongoDatasetWriter


def main() -> None:
    settings = Settings.from_env()
    if not settings.mongodb_uri:
        raise RuntimeError("MONGODB_URI is required for dataset rollback")
    writer = MongoDatasetWriter(settings.mongodb_uri, settings.mongodb_database)
    try:
        print(json.dumps(writer.rollback(), indent=2))
    finally:
        writer.close()


if __name__ == "__main__":
    main()

