#!/usr/bin/env python3
"""Create a source-only NT Message ZIP from the current local folder.

The archive is intentionally built from the working directory, not Git, while
excluding secrets, dependency/build output, generated clients, database dumps,
and runtime attachment/storage data required by the Phase 13 source-package
hygiene lock.
"""

from __future__ import annotations

import argparse
import datetime as dt
import os
from pathlib import Path
import sys
import zipfile

EXCLUDED_DIR_NAMES = {
    ".git",
    ".cache",
    "node_modules",
    "dist",
    "build",
    "coverage",
    "uploads",
    "tmp",
    "temp",
    "playwright-report",
    "test-results",
    "backups",
    "deploy-data",
    "deploy-backups",
}

EXCLUDED_PREFIXES = {
    Path("apps/api/storage"),
    Path("apps/api/src/generated"),
}

EXCLUDED_FILE_SUFFIXES = {
    ".dump",
    ".backup",
    ".sql.gz",
    ".log",
    ".tsbuildinfo",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create a sanitized NT Message source ZIP from the local folder.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Output ZIP path. Defaults to ../nt-message-source-<timestamp>.zip.",
    )
    return parser.parse_args()


def repo_root() -> Path:
    root = Path(__file__).resolve().parent.parent
    if not (root / "package.json").is_file() or not (root / "apps").is_dir():
        raise RuntimeError("Unable to locate the NT Message repository root.")
    return root


def is_example_env(name: str) -> bool:
    return name.endswith(".example")


def is_env_secret(name: str) -> bool:
    if name == ".env":
        return True
    return name.startswith(".env.") and not is_example_env(name)


def is_excluded(relative_path: Path) -> bool:
    if any(part in EXCLUDED_DIR_NAMES for part in relative_path.parts[:-1]):
        return True

    if any(
        relative_path == prefix or prefix in relative_path.parents
        for prefix in EXCLUDED_PREFIXES
    ):
        return True

    name = relative_path.name
    if name == ".DS_Store" or is_env_secret(name):
        return True

    lowered = name.lower()
    return any(lowered.endswith(suffix) for suffix in EXCLUDED_FILE_SUFFIXES)


def validate_archive(archive_path: Path) -> tuple[int, int]:
    with zipfile.ZipFile(archive_path, "r") as archive:
        corrupted = archive.testzip()
        if corrupted:
            raise RuntimeError(f"ZIP CRC validation failed at {corrupted}")

        names = archive.namelist()
        prohibited: list[str] = []
        for name in names:
            normalized = name.replace("\\", "/")
            basename = normalized.rsplit("/", 1)[-1]
            if (
                "/.git/" in normalized
                or "/node_modules/" in normalized
                or "/coverage/" in normalized
                or "/apps/api/storage/" in normalized
                or "/apps/api/src/generated/" in normalized
                or basename == ".DS_Store"
                or is_env_secret(basename)
                or basename.lower().endswith((".dump", ".backup", ".sql.gz"))
            ):
                prohibited.append(name)

        if prohibited:
            preview = "\n".join(f"  - {item}" for item in prohibited[:20])
            raise RuntimeError(
                "Sanitized ZIP verification found prohibited entries:\n" + preview,
            )

        return len(names), archive_path.stat().st_size


def main() -> int:
    args = parse_args()
    root = repo_root()
    timestamp = dt.datetime.now().astimezone().strftime("%Y%m%d-%H%M%S")
    output = (
        args.output.expanduser().resolve()
        if args.output
        else (root.parent / f"nt-message-source-{timestamp}.zip").resolve()
    )
    output.parent.mkdir(parents=True, exist_ok=True)

    if output.exists():
        raise RuntimeError(f"Refusing to overwrite existing archive: {output}")

    files_written = 0
    archive_root = root.name
    with zipfile.ZipFile(
        output,
        "w",
        compression=zipfile.ZIP_DEFLATED,
        compresslevel=6,
    ) as archive:
        for path in sorted(root.rglob("*")):
            if not path.is_file() or path.is_symlink():
                continue
            relative = path.relative_to(root)
            if is_excluded(relative):
                continue
            archive.write(path, Path(archive_root) / relative)
            files_written += 1

    entry_count, archive_size = validate_archive(output)
    print("NT Message source backup created successfully.")
    print(f"Source root: {root}")
    print(f"Archive: {output}")
    print(f"Files written: {files_written}")
    print(f"ZIP entries verified: {entry_count}")
    print(f"Archive size: {archive_size / (1024 * 1024):.2f} MiB")
    print("Sanitization verification: PASS")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001 - CLI boundary must return a clear failure.
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
