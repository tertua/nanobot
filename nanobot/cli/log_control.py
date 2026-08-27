"""Runtime log visibility controls shared by CLI commands."""

import sys

from loguru import logger

__all__ = ["_set_nanobot_logs", "setup_logging"]

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


def _set_nanobot_logs(enabled: bool) -> None:
    if enabled:
        logger.enable("nanobot")
    else:
        logger.disable("nanobot")


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

    logger.remove()
    logger.add(
        sys.stderr,
        format=_TERMINAL_FORMAT,
        level="DEBUG" if verbose else "INFO",
        colorize=None,
        filter=_channel_filter,
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
    _set_nanobot_logs(verbose)
