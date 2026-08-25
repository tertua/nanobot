# AGENTS.md

## What is this

Fork of HKUDS/nanobot (portable AI agent framework: Python core + chat-platform channels over an async message bus) with Windows-portable simplifications. Upstream docs live on the `main` branch; this `master` branch is the fork.

Related repo: [tertua/nanowin](https://github.com/tertua/nanowin) — separate Windows portable *installer* repo (unrelated git history). It clones/downloads this repo's `master` at install time, then patches source files via `scripts/portable_paths.py`. See "nanowin patch anchors" before editing the files it touches.

**Language convention**: code, comments, log messages, error strings, and commit messages in English; conversation with the user in Indonesian.

## Layout

```
nanobot/          Python core package (hatchling build)
webui/            React 18 + TypeScript + Vite frontend (bun/npm)
tui/              Terminal UI assets
```

`docs/`, `tests/`, and `bridge/` are removed in this fork (upstream `main` keeps them).

## Key commands

This machine uses `uv`: run Python via `uv run python`, ruff via `uv tool run ruff check nanobot/`. There is no `python` alias (use `python3`).

```bash
uv run nanobot gateway             # multi-channel gateway (port 18790)
uv run nanobot agent -m "Hello"    # single message mode
uv run nanobot serve               # OpenAI-compatible API server (port 8900)
uv tool run ruff check nanobot/    # lint (E/F/I/N/W, E501 ignored); ruff format to auto-format
```

No Python tests in this fork (removed upstream tests are never restored). WebUI:

```bash
cd webui
bun install                 # npm works too; lock files are not committed
bun run build               # writes to ../nanobot/web/dist
bunx vitest run             # tests
```

**WebUI test baseline**: 4 failures are pre-existing/flaky (app-layout ×2 timeouts, thread-composer "compact context meter", thread-shell "reset lineage") — they fail on pure upstream too. Don't chase them; a regression is any failure beyond these four. Several other tests are `it.skip`ped because they expect locales this fork removed.

## Architecture

Core flow: **Channel → MessageBus → AgentLoop → MessageBus → Channel**. AgentLoop (`nanobot/agent/loop.py`, ~2400 lines) is a state machine: RESTORE → COMPACT → COMMAND → BUILD → RUN → SAVE → RESPOND → DONE.

Non-obvious wiring:
- Tools auto-discovered via pkgutil scan of `nanobot/agent/tools/` + entry-point plugins; channels likewise from `nanobot/channels/`
- Config is Pydantic with camelCase JSON aliases (`schema.py`); `${ENV_VAR}` references in config.json resolved via `resolve_config_env_vars` (loader.py) at usage sites, not automatically in `load_config()`
- Image generation providers are a fixed class registry (`_IMAGE_GEN_PROVIDERS` in `providers/image_generation.py`) plus dynamic custom providers served by the generic OpenAI-compatible client

## Config whitelist (fork-specific)

`save_config()` / `_onboard_plugins()` filter generated config.json through whitelists in `loader.py`:
- **Providers**: openai, custom, aihubmix, openrouter, nvidia. Other *built-in* providers are omitted, but dynamic custom providers (any extra key under `providers`) are always preserved.
- **Channels**: telegram, whatsapp, websocket, email, cli

The WebUI settings view applies the same provider filter (`webui/settings_models.py`). Dynamic custom providers work for image generation too: `tools.imageGeneration.provider` may name any extra key under `providers` (requires `apiBase`); a warning is logged when the name isn't registered. Per-request opt-out of image-gen defaults: `"extraBody": {"response_format": null}` (null-valued extraBody keys drop client defaults via `_merge_extra_body`).

## Upstream sync playbook

`.gitattributes` protects with `merge=ours`: `docs/`, `tests/`, `webui/src/i18n/locales`, `README.md`.

1. Most conflicts are modify/delete (fork deleted tests/docs/extra locales, upstream modified them): resolve with `git rm` — never restore them. Also `git rm -f` any brand-new `tests/**` files the merge stages.
2. For content conflicts, take the **upstream version wholesale**, then re-apply fork bits — keeping the old fork side loses upstream refactors (this caused a real crash: schema.py lost `idle_compact_check_interval_seconds` while loop.py referenced it; azure/bedrock providers lost Responses-API refactors the same way).
3. Re-apply fork bits (see below), then verify: `ruff check nanobot/`, import-smoke touched modules, `uv run nanobot --help`, `cd webui && bun run build && bunx vitest run`.
4. Check nanowin patch anchors still match, and add any new startup-path dependency to nanowin's `scripts/requirements-lite.txt` (`tzlocal`, `packaging`, `httpx[socks]` were missed once).

## nanowin patch anchors

`scripts/portable_paths.py` in tertua/nanowin string-matches and rewrites these regions post-install; changing them breaks silent installs (`[WARN] pattern not found`):
- `config/paths.py` — `Path.home() / ".nanobot" / ...` fallbacks
- `config/loader.py` — `get_config_path()` body
- `config/schema.py` — `workspace: str = "~/.nanobot/workspace"` default
- `cli/commands.py` — `_set_nanobot_logs(verbose)` block in serve()
- `cli/agent.py` — `_set_nanobot_logs(logs)`
- `cli/gateway.py` — `configure_logging()` body
- `utils/helpers.py` — `sync_workspace_templates()` pkg_files block
- `agent/memory.py` — `__init__` memory paths + `GitStore(workspace, ...)`

## Fork-specific notes (re-apply after taking upstream files)

- Branding: `bot_name="nanowin"`, `bot_icon="✨"` (schema.py), `__logo__="✨"` (__init__.py), OpenRouter headers in `image_generation.py` point to tertua/nanowin
- `ensure_ascii=True` on all user-visible/error `json.dumps` calls (~20 files) + surrogate sanitization (`.encode("utf-8", errors="replace").decode()`) in provider error paths and `_safe_detail` in image_generation.py — prevents Windows console crashes on unpaired surrogates
- AihubMix `default_extra_headers={"APP-Code": ...}` in `registry.py`; `factory.py` guards against missing `default_extra_headers`
- NVIDIA API-key URL (build.nvidia.com) in onboard output (`commands.py`)
- Fork keeps the `webui_cancel_active_turn` chain (gateway_runtime → channels/manager → gateway_services); upstream removed it
- i18n limited to en + id (`webui/src/i18n/config.ts`); locale dirs kept: en, id, pt-BR
- README.md is intentionally short (fork header only)
- Windows portable path handling / NANOBOT_HOME support in config loader

## Constraints

- Python >=3.11; line length 100 (ruff)
- No CI workflows; no lock files committed
- `SOUL.md`, `USER.md`, `MEMORY.md` in workspace are Dream-consolidation managed — do not edit manually
- Session files are JSONL in `{workspace}/sessions/`
