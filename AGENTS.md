# AGENTS.md

## What is this

Nanobot is a portable AI agent framework (Python) that connects to chat platforms via an async message bus. Fork of HKUDS/nanobot with Windows portable simplifications.

Related repo: [tertua/nanowin](https://github.com/tertua/nanowin) — separate Windows portable *installer* repo (unrelated git history). It clones/downloads this repo's `master` at install time, then patches source files via `scripts/portable_paths.py`. See "nanowin patch anchors" below before editing the files it touches.

## Monorepo layout

```
nanobot/          Python core package (pyproject.toml, hatchling build)
webui/            React 18 + TypeScript + Vite frontend (bun/npm)
tui/              Terminal UI assets
images/           README/webui images
scripts/          Repo maintenance scripts
```

`docs/`, `tests/`, and `bridge/` are removed in this fork (upstream `main` branch keeps them).

## Key commands

### Python (from repo root)

```bash
pip install -e .            # editable install (skips webui build)
nanobot gateway             # start multi-channel gateway (port 18790)
nanobot agent -m "Hello"    # single message mode
nanobot serve               # OpenAI-compatible API server (port 8900)
nanobot onboard --wizard    # interactive setup
```

Lint/typecheck:
```bash
ruff check .                # Python linter (E/F/I/N/W, E501 ignored)
ruff format .               # auto-format
```

Test: no Python tests in this fork (removed). WebUI tests exist (`cd webui && bunx vitest run`).

- **Agent Loop** (`nanobot/agent/loop.py`, `runner.py`): The core processing engine. `AgentLoop` manages session keys, hooks, and context building. `AgentRunner` executes the multi-turn LLM conversation with tool execution.
- **LLM Providers** (`nanobot/providers/`): Provider implementations (Anthropic, OpenAI-compatible, OpenAI Responses API, Azure, Bedrock, GitHub Copilot, OpenAI Codex, etc.) built on a common base (`base.py`). Includes image generation (`image_generation.py`) and audio transcription (`transcription.py`). `factory.py` and `registry.py` handle instantiation and model discovery.
- **Channels** (`nanobot/channels/`): Platform integrations (Telegram, Discord, Slack, Feishu, Matrix, WhatsApp, QQ, WeChat, WeCom, DingTalk, Email, MoChat, MS Teams, WebSocket, Mattermost). `manager.py` discovers and coordinates them. Channels are self-contained packages auto-discovered via `pkgutil` scanning.
- **Tools** (`nanobot/agent/tools/`): Agent capabilities exposed to the LLM: filesystem (read/write/edit/list), shell execution (with sandbox backends), web search/fetch, MCP servers, cron, notebook editing, subagent spawning, long-running tasks / sustained goals (`long_task.py`), image generation, and self-modification. Tools are auto-discovered via `pkgutil` scan + entry-point plugins.
- **Memory** (`nanobot/agent/memory.py`): Session history persistence with Dream two-phase memory consolidation. Uses atomic writes with fsync for durability.
- **Session Management** (`nanobot/session/`): Per-session history, context compaction, TTL-based auto-compaction (`manager.py`), and sustained goal state tracking (`goal_state.py`).
- **Config** (`nanobot/config/schema.py`, `loader.py`): Pydantic-based configuration loaded from `~/.nanobot/config.json`. Supports camelCase aliases for JSON compatibility.
- **WebUI** (`webui/`): Vite-based React SPA that talks to the gateway over a WebSocket multiplex protocol. The dev server proxies `/api`, `/webui`, `/auth`, and WebSocket traffic to the gateway.
- **API Server** (`nanobot/api/server.py`): OpenAI-compatible HTTP API (`/v1/chat/completions`, `/v1/models`) for programmatic access.
- **Command Router** (`nanobot/command/`): Slash command routing and built-in command handlers.
- **Heartbeat** (`nanobot/templates/HEARTBEAT.md`): Periodic task list checked via `cron` jobs (legacy dedicated service removed).
- **Pairing** (`nanobot/pairing/`): DM sender approval store with persistent pairing codes per channel.
- **Skills** (`nanobot/skills/`): Built-in skill definitions (cron, github, image-generation, etc.) loaded into agent context.
- **Security** (`nanobot/security/`): PTH file guard and other security measures activated at CLI entry.

### WebUI

```bash
cd webui
bun install                 # npm install also works; lock files are not committed
bun run dev                 # Vite HMR on :5173, proxies API to :8765
bun run build               # writes to ../nanobot/web/dist
bun run test                # bunx vitest run
bun run lint                # eslint (max-warnings 0)
```

## Build system

Hatchling with custom `hatch_build.py` auto-bundles webui into `nanobot/web/dist/` during `python -m build`. Editable installs skip this. Set `NANOBOT_SKIP_WEBUI_BUILD=1` to skip, `NANOBOT_FORCE_WEBUI_BUILD=1` to force rebuild.

## Architecture

Core flow: **Channel → MessageBus → AgentLoop → MessageBus → Channel**

AgentLoop is a state machine: RESTORE → COMPACT → COMMAND → BUILD → RUN → SAVE → RESPOND → DONE

Key entrypoints:
- `nanobot/agent/loop.py` — core engine (~1800 lines)
- `nanobot/agent/runner.py` — LLM call + tool execution loop
- `nanobot/agent/context.py` — prompt builder (loads AGENTS.md, SOUL.md, USER.md, MEMORY.md)
- `nanobot/agent/tools/registry.py` — tool discovery and dispatch
- `nanobot/channels/base.py` — channel interface (extend for new platforms)
- `nanobot/config/schema.py` — Pydantic config models
- `nanobot/config/loader.py` — config loading with provider/channel whitelists
- `nanobot/cli/commands.py` — CLI entrypoint (typer)

## Config

Default: `~/.nanobot/config.json`. Override with `--config`. Env vars: `NANOBOT_*` with `__` as nested delimiter.

This fork applies whitelists on generated config (`get_provider_whitelist()` / `_CHANNEL_WHITELIST` in `loader.py`, applied in `save_config()` and `_onboard_plugins()`):
- **Providers**: openai, custom, aihubmix, openrouter, nvidia (other *built-in* providers omitted from config.json). Dynamic custom providers (any extra key under `providers`) are always preserved.
- **Channels**: telegram, whatsapp, websocket, email, cli (others omitted)

The WebUI settings view filters providers through the same whitelist (`nanobot/webui/settings_models.py`).

Dynamic custom providers also work for image generation: `tools.imageGeneration.provider` may name any extra key under `providers`; it is served by the generic OpenAI-compatible `CustomImageGenerationProvider` (requires `apiBase`) and appears in the WebUI image-generation provider list.

## Upstream sync playbook

`.gitattributes` protects with `merge=ours`: `docs/`, `tests/`, `webui/src/i18n/locales`, `README.md`.

When merging `upstream/main`:
1. For conflicted files, prefer taking the **upstream version wholesale**, then re-apply fork bits on top — keeping the old fork side risks losing upstream refactors (this caused a real crash once: schema.py lost `idle_compact_check_interval_seconds` while loop.py referenced it).
2. Re-apply fork bits after taking upstream files (see "Fork-specific notes").
3. Verify after merge: `ruff check nanobot/`, import smoke test of all touched modules, `uv run nanobot --help`, `cd webui && bun run build && bunx vitest run`.
4. Check nanowin patch anchors still match (below) and that any new startup dependency is added to nanowin's `scripts/requirements-lite.txt`.

## nanowin patch anchors

`tertua/nanowin` `scripts/portable_paths.py` string-matches and rewrites these files post-install. Changing these anchor regions breaks silent installs (fails as `[WARN] pattern not found`):
- `config/paths.py` — `Path.home() / ".nanobot" / ...` fallbacks
- `config/loader.py` — `get_config_path()` body
- `config/schema.py` — `workspace: str = "~/.nanobot/workspace"` default
- `cli/commands.py` — `_set_nanobot_logs(verbose)` block in serve()
- `cli/agent.py` — `_set_nanobot_logs(logs)`
- `cli/gateway.py` — `configure_logging()` body
- `utils/helpers.py` — `sync_workspace_templates()` pkg_files block
- `agent/memory.py` — `__init__` memory paths + `GitStore(workspace, ...)`

Also keep nanowin's `scripts/requirements-lite.txt` in sync with anything imported on the startup path (e.g. `tzlocal`, `packaging`, `httpx[socks]` were missed once).

## Important constraints

- Python requires >=3.11 (uses `|` union syntax, `tomllib`)
- `SOUL.md`, `USER.md`, `MEMORY.md` in workspace are managed by the Dream consolidation system — do not edit manually
- All Python tests were removed in this fork — no test safety net for core changes
- WebUI tests exist in `webui/src/tests/` (vitest + testing-library); several are `it.skip`ped because they expect locales this fork removed
- Session files are JSONL in `{workspace}/sessions/`
- Tools are auto-discovered via pkgutil scanning; new tools go in `nanobot/agent/tools/`
- MCP servers configured in `tools.mcpServers` in config.json
- Line length: 100 (ruff), Python target: 3.11
- No CI workflows (.github/workflows removed); no lock files committed (webui/bun.lock gitignored)

## Fork-specific notes

- README.md is intentionally short (fork header only); full upstream docs live on the `main` branch which tracks HKUDS/nanobot
- i18n limited to English + Indonesian (`webui/src/i18n/config.ts`); locale files kept: en, id, pt-BR; other locales deleted
- Branding: `bot_name="nanowin"`, `bot_icon="✨"` (schema.py), `__logo__="✨"` (__init__.py), OpenRouter headers in `image_generation.py` point to tertua/nanowin
- `ensure_ascii=True` policy: all `json.dumps` calls that produce user-visible/error output use `ensure_ascii=True` to avoid crashes on unpaired surrogates (Windows consoles); ~20 files, must be re-applied after taking upstream versions
- Surrogate sanitization helpers (`.encode("utf-8", errors="replace").decode()`) in providers/base error paths — same reason
- AihubMix `default_extra_headers={"APP-Code": ...}` in `registry.py`; `factory.py` guards against missing `default_extra_headers`
- NVIDIA API key URL default (build.nvidia.com) in onboard output (`commands.py`)
- Fork keeps the `webui_cancel_active_turn` chain (gateway_runtime → channels/manager → gateway_services); upstream removed it
- Windows portable path handling in config loader (NANOBOT_HOME support)
