"""Runtime log visibility controls shared by CLI commands."""

import sys

from loguru import logger

__all__ = ["_set_nanobot_logs", "setup_logging"]

# Subsystems whose logs are always shown on the terminal, even without
# ``--verbose``. Everything else under the ``nanobot`` namespace is suppressed
# on the terminal unless ``--verbose`` (or ``plugins enable --logs``) is set.
_ALWAYS_ON_SYSTEMS = frozenset({"cron", "heartbeat", "dream"})

# Module name prefixes that are always shown on the terminal.
_ALWAYS_ON_PREFIXES = ("nanobot.cron.",)

# When True, every ``nanobot.*`` record is shown on the terminal regardless of
# the allowlist above. Driven by ``--verbose`` and ``plugins enable --logs``.
_nanobot_logs_enabled = False

_TERMINAL_FORMAT = (
    "<green>{time:YYYY-MM-DD HH:mm:ss}</green> | "
    "<level>{level: <5}</level> | "
    "<cyan>{extra[channel]}</cyan> | "
    "<level>{message}</level>"
)
_FILE_FORMAT = "{time:YYYY-MM-DD HH:mm:ss} | {level: <5} | {extra[channel]} | {message}"


def _channel_filter(record: dict) -> bool:
    record["extra"].setdefault("channel", "-")
    return True


def _terminal_filter(record: dict) -> bool:
    record["extra"].setdefault("channel", "-")
    if _nanobot_logs_enabled:
        return True
    name = record["name"]
    if name.startswith(_ALWAYS_ON_PREFIXES):
        return True
    if record["extra"].get("system") in _ALWAYS_ON_SYSTEMS:
        return True
    if name.startswith("nanobot"):
        return False
    return True


def _set_nanobot_logs(enabled: bool) -> None:
    """Toggle terminal visibility of all ``nanobot.*`` logs.

    Used by ``plugins enable --logs`` to surface install/feature logs. The
    always-on subsystems (cron/heartbeat/dream) are unaffected by this flag.
    """
    global _nanobot_logs_enabled
    _nanobot_logs_enabled = enabled


def setup_logging(*, verbose: bool, file: bool | None = None) -> None:
    """Configure terminal + (portable) file handlers.

    Terminal shows INFO (or DEBUG with *verbose*). A DEBUG file log is written
    under the portable ``data/logs`` directory, but only when running inside the
    nanowin portable layout (``data_root()`` is not None) unless *file* is
    forced. This keeps logging self-contained in the install folder so it never
    leaks to the host user's ``~/.nanobot``.
    """
    from nanobot.config.portable import data_root

    root = data_root()
    write_file = bool(root) if file is None else file

    global _nanobot_logs_enabled
    _nanobot_logs_enabled = verbose

    logger.remove()
    logger.add(
        sys.stderr,
        format=_TERMINAL_FORMAT,
        level="DEBUG" if verbose else "INFO",
        colorize=None,
        filter=_terminal_filter,
    )
    if write_file and root is not None:
        log_dir = root / "logs"
        log_dir.mkdir(parents=True, exist_ok=True)
        logger.add(
            log_dir / "nanobot_{time:YYYY-MM-DD}.log",
            format=_FILE_FORMAT,
            level="DEBUG",
            rotation="1 day",
            retention="14 days",
            filter=_channel_filter,
        )
