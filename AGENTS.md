# AGENTS.md

## What is this

Nanobot is a portable AI agent framework (Python) that connects to chat platforms via an async message bus. Fork of HKUDS/nanobot with Windows portable simplifications.

## Monorepo layout

```
nanobot/          Python core package (pyproject.toml, hatchling build)
webui/            React 18 + TypeScript + Vite frontend (bun/npm)
bridge/           WhatsApp bridge (Baileys, Node.js >=20)
docs/             Internal architecture docs
```

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

Test:
```bash
pytest                      # runs tests/ (currently empty in this fork)
```

### WebUI

```bash
cd webui
bun install                 # npm install also works
bun run dev                 # Vite HMR on :5173, proxies API to :8765
bun run build               # writes to ../nanobot/web/dist
bun run test                # vitest
bun run lint                # eslint (max-warnings 0)
```

### Bridge (WhatsApp)

```bash
cd bridge
npm install
npm run build               # tsc
npm start                   # node dist/index.js
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

This fork applies whitelists on generated config:
- **Providers**: openai, custom, aihubmix, openrouter, nvidia (others omitted from config.json)
- **Channels**: telegram, whatsapp, websocket, email, cli (others omitted)

See `docs/CONFIG_GUIDE.md` for full config reference.

## Important constraints

- Python requires >=3.11 (uses `|` union syntax, `tomllib`)
- `SOUL.md`, `USER.md`, `MEMORY.md` in workspace are managed by the Dream consolidation system — do not edit manually
- All Python tests were removed in this fork — no test safety net for core changes
- WebUI tests exist in `webui/src/tests/` (vitest + testing-library)
- Session files are JSONL in `{workspace}/sessions/`
- Tools are auto-discovered via pkgutil scanning; new tools go in `nanobot/agent/tools/`
- MCP servers configured in `tools.mcpServers` in config.json
- Line length: 100 (ruff), Python target: 3.11

## Fork-specific notes

- i18n limited to English + Indonesian (other locales removed)
- Settings view split into components (was 5500+ lines)
- Windows portable path handling in config loader
- No CI workflows (.github/workflows removed)
