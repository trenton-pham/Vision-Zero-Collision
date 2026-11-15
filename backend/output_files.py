from contextlib import contextmanager
from pathlib import Path
import shutil
from tempfile import mkdtemp
from typing import Iterator


@contextmanager
def staged_outputs(output: Path) -> Iterator[Path]:
    """Stage local outputs and restore prior files after handled publication failures."""
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(mkdtemp(prefix=f'.output-stage-{output.name}-', dir=output.parent))
    staged = temporary / 'new'
    staged.mkdir()
    retain_backup = False
    try:
        yield staged
        files = sorted(
            (path for path in staged.rglob('*') if path.is_file()),
            key=lambda path: (path.name.endswith('manifest.json'), str(path)),
        )
        destinations = []
        for source in files:
            relative = source.relative_to(staged)
            target = output / relative
            backup = None
            if target.exists() or target.is_symlink():
                backup = temporary / 'old' / relative
                backup.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(target, backup, follow_symlinks=False)
            destinations.append((source, target, backup))

        published = []
        try:
            for source, target, backup in destinations:
                target.parent.mkdir(parents=True, exist_ok=True)
                published.append((target, backup))
                source.replace(target)
        except BaseException as error:
            failures = []
            for target, backup in reversed(published):
                try:
                    if backup is None:
                        target.unlink(missing_ok=True)
                    else:
                        backup.replace(target)
                except OSError as restore_error:
                    failures.append(restore_error)
            if failures:
                retain_backup = True
                raise BaseExceptionGroup(
                    f'Output publication failed; recovery files retained at {temporary}',
                    [error, *failures],
                ) from None
            raise
    finally:
        if not retain_backup:
            shutil.rmtree(temporary)
