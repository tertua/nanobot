"""Portable install detection for the nanowin edition.

The nanowin build lays out all nanobot data under a single ``data`` directory
next to the install root (config, workspace, logs, media, ...). This module
detects that layout from the filesystem so the fork never depends on an
environment variable being propagated to every subprocess -- which would risk
leaking data into the host user's ``~/.nanobot``.
"""

from __future__ import annotations

from pathlib import Path


def data_root() -> Path | None:
    """Return the portable ``data`` root, or ``None`` for a normal install.

    Walks up from the nanobot package directory looking for a ``data`` folder
    that is unambiguously the nanowin portable root. The signal is either a
    ``.nanowin`` marker file at the install root, or a ``data/config.json``
    (both written by the nanowin setup). This avoids mistaking an unrelated
    ``data`` directory encountered while walking up the tree for the portable
    root. When not found (e.g. a development checkout or a pip-installed
    copy), the caller falls back to ``~/.nanobot``.
    """
    pkg_parent = Path(__file__).resolve().parent.parent
    for candidate in (pkg_parent, *pkg_parent.parents):
        data = candidate / "data"
        if not data.is_dir():
            continue
        if (candidate / ".nanowin").exists() or (data / "config.json").exists():
            return data
    return None

