# Nanobot Architecture Documentation

> Dokumentasi ini dibuat langsung dari membaca source code.  
> Versi: Fork Windows Portable (dari upstream HKUDS/nanobot)

---

## 1. Overview

Nanobot adalah AI agent framework yang dapat berjalan di berbagai platform chat (Telegram, Discord, Slack, WebUI, CLI, dll). Arsitekturnya berbasis **async message bus** yang mendekopling channel-layer dari agent core.

### High-Level Flow

```
┌─────────────┐     InboundMessage      ┌──────────────┐
│   Channel   │ ──────────────────────> │  MessageBus  │
│ (Telegram,  │                         │   (Queue)    │
│  Discord,   │ <────────────────────── │              │
│   WebUI)    │     OutboundMessage     └──────┬───────┘
└─────────────┘                                  │
                                                 ▼
                                          ┌──────────────┐
                                          │  AgentLoop   │
                                          │  (Core)      │
                                          └──────┬───────┘
                                                 │
                    ┌────────────┬───────────────┼──────────────┬────────────┐
                    ▼            ▼               ▼              ▼            ▼
              ┌─────────┐ ┌──────────┐  ┌─────────────┐ ┌──────────┐ ┌──────────┐
              │ Session │ │ Context  │  │   Tools     │ │ Provider │ │  Memory  │
              │ Manager │ │ Builder  │  │  (Registry) │ │  (LLM)   │ │ (Dream)  │
              └─────────┘ └──────────┘  └─────────────┘ └──────────┘ └──────────┘
```

---

## 2. Core Components

### 2.1 MessageBus (`nanobot/bus/queue.py`)

Bus berbasis `asyncio.Queue` sederhana dengan dua queue:
- **`inbound`**: Pesan dari user/channel → agent
- **`outbound`**: Pesan dari agent → channel

Channels dan agent loop berjalan secara independen dan berkomunikasi melalui bus ini.

### 2.2 AgentLoop (`nanobot/agent/loop.py`)

**Ini adalah jantung sistem** — engine utama yang memproses pesan. Berjalan dalam event-driven state machine.

#### State Machine (TurnState)

Setiap pesan diproses melalui state machine berikut:

```
RESTORE ──ok──> COMPACT ──ok──> COMMAND ──dispatch──> BUILD ──ok──> RUN ──ok──> SAVE ──ok──> RESPOND ──ok──> DONE
                                          └─shortcut──> DONE
```

| State | Handler | Keterangan |
|-------|---------|------------|
| `RESTORE` | `_state_restore` | Restore checkpoint/pending user turn; extract dokumen dari media |
| `COMPACT` | `_state_compact` | Trigger memory auto-compact jika session terlalu panjang |
| `COMMAND` | `_state_command` | Cek slash commands (`/stop`, `/new`, `/model`, dll). Jika match → shortcut ke DONE |
| `BUILD` | `_state_build` | Bangun context: history, system prompt, skills, runtime metadata |
| `RUN` | `_state_run` | Panggil LLM dan jalankan tool calls dalam iterasi |
| `SAVE` | `_state_save` | Simpan turn ke session, enforce file cap, cleanup |
| `RESPOND` | `_state_respond` | Susun outbound message dari hasil turn |
| `DONE` | — | Turn selesai |

#### Key Properties & Subsystems

```python
self.bus              # MessageBus
self.provider         # LLMProvider aktif
self.model            # Model ID aktif
self.tools            # ToolRegistry
self.sessions         # SessionManager
self.context          # ContextBuilder
self.consolidator     # Memory consolidator (Dream)
self.subagents        # SubagentManager
self.commands         # CommandRouter
self.cron_service     # CronService
self._pending_queues  # Mid-turn message injection queues
```

### 2.3 Session Manager (`nanobot/session/manager.py`)

Session disimpan sebagai **JSONL files** di `{workspace}/sessions/`.

Format file session:
```jsonl
{"_type":"metadata","key":"telegram:12345","created_at":"...","updated_at":"...","metadata":{},"last_consolidated":0}
{"role":"user","content":"Hello","timestamp":"..."}
{"role":"assistant","content":"Hi!","timestamp":"..."}
```

#### Session Key
- Format default: `{channel}:{chat_id}` (contoh: `telegram:123456789`)
- Dengan `unified_session=true`: semua channel berbagi satu session (`unified`)

#### Key Methods
- `get_or_create(key)` — load dari disk atau buat baru
- `get_history(max_messages, max_tokens)` — ambil unconsolidated messages
- `add_message(role, content, **kwargs)` — tambah pesan
- `enforce_file_cap(on_archive)` — batasi growth dengan archive ke memory

---

## 3. Context Building (`nanobot/agent/context.py`)

`ContextBuilder` membangun prompt yang dikirim ke LLM.

### Struktur Prompt

```
[SYSTEM PROMPT]
  ├── Identity (platform, workspace, runtime info)
  ├── Bootstrap files: AGENTS.md, SOUL.md, USER.md
  ├── Tool contract
  ├── Memory context (dari MEMORY.md)
  ├── Active skills ("always" skills)
  ├── Skills summary (daftar skill yang tersedia)
  ├── Recent history (dari history.jsonl)
  └── Session summary (jika ada archived context)

[USER MESSAGE]
  ├── Content (text/media)
  └── Runtime Context block (time, channel, chat_id, sender_id)
```

### Bootstrap Files
File-file ini di-load dari workspace root:
- **`AGENTS.md`** — instruksi khusus untuk agent
- **`SOUL.md`** — personality & communication style (di-manage oleh Dream)
- **`USER.md`** — user profile & preferences (di-manage oleh Dream)

**Note**: Jangan edit SOUL.md, USER.md, atau MEMORY.md secara manual — mereka di-manage oleh Dream.

---

## 4. Tool System (`nanobot/agent/tools/`)

### 4.1 Tool Base Class (`nanobot/agent/tools/base.py`)

Semua tool meng-extend `Tool` abstract class:

```python
class MyTool(Tool):
    @property
    def name(self) -> str: ...
    @property
    def description(self) -> str: ...
    @property
    def parameters(self) -> dict: ...
    async def execute(self, **kwargs) -> Any: ...
```

### 4.2 ToolRegistry (`nanobot/agent/tools/registry.py`)

Mengelola daftar tool yang tersedia. Tool di-load secara dinamis oleh `ToolLoader`.

### 4.3 Built-in Tools

Tool-tool utama yang tersedia (tergantung konfigurasi):

| Tool | File | Fungsi |
|------|------|--------|
| `read_file` | `filesystem.py` | Baca file teks |
| `write_file` | `filesystem.py` | Tulis file |
| `edit_file` | `filesystem.py` | Edit file (replace text) |
| `apply_patch` | `apply_patch.py` | Apply multi-file patches |
| `exec` | `shell.py` | Jalankan shell command |
| `web_search` | `web.py` | Cari di web |
| `web_fetch` | `web.py` | Fetch URL ke markdown |
| `search` | `search.py` | Search files/code in workspace |
| `message` | `message.py` | Kirim pesan proaktif |
| `cron` | `cron.py` | Schedule reminders/tasks |
| `long_task` / `complete_goal` | `self.py` | Sustained goals |
| `my` | `self.py` | Self-awareness (check/set runtime state) |
| `image_generation` | `image_generation.py` | Generate gambar |
| `spawn` | `subagent.py` | Spawn subagent tasks |
| `run_cli_app` | `cli_apps.py` | Run CLI app attachments |

### 4.4 MCP Integration (`nanobot/agent/tools/mcp.py`)

MCP (Model Context Protocol) server dapat dikonfigurasi di `config.json`:

```json
{
  "tools": {
    "mcpServers": {
      "my-server": {
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem"]
      }
    }
  }
}
```

Tool dari MCP server muncul dengan prefix: `mcp_<server>_<tool>`.

---

## 5. Provider System (`nanobot/providers/`)

### 5.1 Provider Matching (`nanobot/config/schema.py`)

Provider dipilih berdasarkan model name dengan priority:

1. **Explicit prefix**: `deepseek/...`, `anthropic/...`, `openrouter/...`
2. **Custom provider** (dari `model_extra`)
3. **Keyword matching** (dari registry)
4. **Local provider fallback** (Ollama, LM Studio, dll)
5. **Gateway fallback** (yang punya api_key)

### 5.2 Supported Providers

Lihat `ProvidersConfig` di `schema.py` untuk daftar lengkap. Yang utama:
- **anthropic**, **openai**, **openrouter**, **deepseek**, **groq**
- **ollama**, **lm_studio** (local)
- **azure_openai**, **bedrock** (enterprise)
- **gemini**, **moonshot**, **siliconflow**, **volcengine**, dll.

**Provider Whitelist** (hanya provider ini yang muncul di config.json):
```python
{"openai", "custom", "aihubmix", "openrouter", "nvidia"}
```
Lihat `nanobot/config/loader.py` → `_PROVIDER_WHITELIST`.

### 5.3 Model Presets

Preset memungkinkan switch model cepat:

```json
{
  "modelPresets": {
    "fast": {
      "model": "groq/llama-3.1-70b",
      "provider": "groq",
      "max_tokens": 4096
    },
    "smart": {
      "model": "anthropic/claude-opus-4-5",
      "provider": "anthropic",
      "max_tokens": 8192
    }
  }
}
```

Switch via: `/model fast` atau SDK: `loop.set_model_preset("fast")`.

---

## 6. Commands (`nanobot/command/builtin.py`)

Slash commands diproses di `COMMAND` state sebelum turn dimulai.

| Command | Fungsi |
|---------|--------|
| `/new` | Hapus session, mulai fresh chat |
| `/stop` | Cancel active task + subagents |
| `/restart` | Restart nanobot process |
| `/status` | Tampilkan runtime status |
| `/model [preset]` | Switch model preset |
| `/history [n]` | Tampilkan n pesan terakhir |
| `/goal <text>` | Start sustained goal (long_task) |
| `/dream` | Trigger memory consolidation manual |
| `/dream-log` | Lihat perubahan memory terakhir |
| `/dream-restore <sha>` | Restore memory ke versi sebelumnya |
| `/skill` | List available skills |
| `/pairing` | Manage pairing requests |
| `/help` | Daftar commands |

Commands di-register di `register_builtin_commands()` dan dapat di-extend.

---

## 7. Memory & Dream (`nanobot/agent/memory.py`)

### 7.1 MemoryStore

Memory tersimpan di `{workspace}/memory/`:
- **`MEMORY.md`** — long-term facts (di-manage oleh Dream)
- **`history.jsonl`** — append-only event history
- **`.git/`** — versioning untuk memory (opsional)

### 7.2 Consolidator (Dream)

Proses periodic yang:
1. Membaca history baru sejak cursor terakhir
2. Membangun prompt untuk LLM
3. LLM menyintesis facts baru dan update MEMORY.md, SOUL.md, USER.md
4. Git auto-commit perubahan
5. Prune old Dream sessions

Schedule default: setiap 2 jam (configurable via `agents.defaults.dream.interval_h`).

---

## 8. Skills System (`nanobot/agent/skills.py`)

Skills adalah modul ekstensi yang ditempatkan di `{workspace}/skills/{name}/SKILL.md`.

### Struktur Skill
```
skills/
  my-skill/
    SKILL.md          # Deskripsi, instructions, tools
    scripts/          # (opsional) helper scripts
    references/       # (opsional) docs
    assets/           # (opsional) static files
```

### Skill Loading
- SkillsLoader scan folder `skills/`
- Skill dengan `always: true` di metadata selalu dimuat ke context
- Skill lainnya hanya muncul di skills summary (LLM memilih menggunakannya)
- Skill dapat di-disable via `agents.defaults.disabled_skills`

---

## 9. Channels (`nanobot/channels/`)

### 9.1 BaseChannel

Semua channel meng-extend `BaseChannel`:

```python
class MyChannel(BaseChannel):
    name = "myplatform"
    
    async def start(self): ...      # Connect & listen
    async def stop(self): ...       # Cleanup
    async def send(self, msg): ...  # Send message
```

### 9.2 Permission Model

```
1. allow_from: ["*"] → allow all
2. allow_from: ["user_id"] → allow specific
3. Pairing store → approved senders
4. else → deny (kirim pairing code di DM)
```

### 9.3 Supported Channels

- CLI (`cli`) — terminal interaktif
- WebUI (`webui`) — built-in web interface
- Telegram, Discord, Slack, Feishu/Lark
- DingTalk, WeChat (MoChat/NapCat), MS Teams
- Matrix, Email, QQ, dan custom channels

**Channel Whitelist** (hanya channel ini yang muncul di config.json):
```python
{"telegram", "whatsapp", "websocket", "email", "cli"}
```
Lihat `nanobot/config/loader.py` → `_CHANNEL_WHITELIST`.

---

## 10. Subagent System (`nanobot/agent/subagent.py`)

Agent dapat mem-spawn subagent untuk tugas paralel:

```python
# Dalam tool call
await spawn("Analyze file X", label="analysis")
```

- Subagent berbagi provider & workspace
- Hasil dikirim kembali sebagai `InboundMessage` dengan `sender_id="subagent"`
- Mid-turn injection: pesan baru dari user saat turn berjalan dapat di-queue dan di-inject ke turn yang sedang aktif

---

## 11. Cron & Scheduling (`nanobot/cron/`)

### 11.1 CronService

Backend scheduling menggunakan cron expressions atau interval.

### 11.2 CronTurns

Message dengan metadata `_cron_turn` di-route melalui `CronTurnCoordinator` untuk memastikan:
- Cron turns tidak ganggu user turns yang sedang aktif
- Deferred execution jika session sedang sibuk

---

## 12. Configuration (`nanobot/config/schema.py`)

Root config class: `Config` (extends Pydantic BaseSettings).

### Config File Location
- Default: `~/.nanobot/config.json`
- Override via arg: `--config path/to/config.json`
- Env vars: `NANOBOT_*` (e.g., `NANOBOT_AGENTS__DEFAULTS__MODEL`)

### Key Sections

```json
{
  "agents": {
    "defaults": {
      "model": "anthropic/claude-opus-4-5",
      "provider": "auto",
      "max_tool_iterations": 200,
      "workspace": "~/.nanobot/workspace",
      "timezone": "UTC",
      "unified_session": false
    }
  },
  "providers": {
    "anthropic": { "api_key": "..." },
    "openrouter": { "api_key": "..." }
  },
  "channels": {
    "telegram": { "enabled": true, "token": "...", "allow_from": ["*"] }
  },
  "tools": {
    "restrict_to_workspace": false,
    "mcp_servers": {}
  }
}
```

---

## 13. Entry Points

### 13.1 CLI Mode
```bash
python -m nanobot
# atau
nanobot
```

### 13.2 Programmatic (SDK)
```python
from nanobot import Nanobot

bot = Nanobot.from_config()
result = await bot.run("Hello!")
print(result.content)
```

### 13.3 API Server
```python
# OpenAI-compatible API di port 8900 (default)
```

### 13.4 Gateway Server
```python
# Gateway di port 18790 (default)
# Untuk multi-channel orchestration
```

---

## 14. Data Flow Summary

```
1. User kirim pesan di Channel (Telegram/WebUI/CLI)
2. Channel → InboundMessage → MessageBus.inbound
3. AgentLoop.consume_inbound() → dapat pesan
4. AgentLoop._dispatch() → acquire session lock
5. TurnContext state machine mulai:
   a. RESTORE: load session, restore checkpoint jika ada
   b. COMPACT: auto-compact jika perlu
   c. COMMAND: cek slash command
   d. BUILD: ContextBuilder.build_messages()
   e. RUN: AgentRunner.run() → call LLM → execute tools
   f. SAVE: simpan ke session, archive jika perlu
   g. RESPOND: kirim OutboundMessage ke bus
6. Channel.consume_outbound() → kirim ke user
```

---

## 15. Important Notes

- **Workspace sandboxing**: `restrict_to_workspace=true` membatasi tool access ke dalam workspace
- **Mid-turn injection**: Pesan follow-up dari user saat turn berjalan di-routing ke `pending_queue` dan di-inject secara in-order
- **Checkpointing**: Turn yang di-interrupt (via `/stop`) menyimpan partial state untuk direstore di turn berikutnya
- **File cap**: Session dibatasi ~2000 messages; pesan lama di-archive ke memory/
- **Token budget**: History di-slice berdasarkan message count + token budget
- **Concurrent turns**: Per-session serial (lock), cross-session concurrent (semaphore, default max 3)
