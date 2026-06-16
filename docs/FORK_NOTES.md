# Fork Notes: Windows Portable

> Dokumentasi ini dibuat dari analisis perbedaan antara fork ini dan upstream HKUDS/nanobot.

---

## 1. Summary

Ini adalah **fork Windows portable** dari nanobot. Fork ini mengambil core functionality dan menghapus/menyederhanakan banyak komponen yang tidak esensial untuk deployment portable di Windows.

---

## 2. Yang Dihapus

### 2.1 Tests
- **Semua unit tests dihapus** (`tests/` — ~105.000 baris kode test)
  - `tests/agent/` — 60+ test files
  - `tests/utils/` — 30+ test files  
  - `tests/webui/` — 10+ test files

### 2.2 Documentation
- `.agent/design.md`
- `.agent/gotchas.md`
- `.agent/security.md`
- `AGENTS.md`
- `CLAUDE.md`
- `COMMUNICATION.md`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `THIRD_PARTY_NOTICES.md`
- `docs/` folder (dihapus oleh user, lalu diganti dengan dokumentasi baru)

### 2.3 GitHub Infrastructure
- `.github/ISSUE_TEMPLATE/`
- `.github/workflows/ci.yml`

### 2.4 Demo Assets
- `case/code.gif`
- `case/memory.gif`
- `case/schedule.gif`
- `case/search.gif`

### 2.5 WebUI Simplifications
- **i18n**: Hanya menyisakan English dan Indonesian
  - Dihapus: Spanish, French, Japanese, Korean, Vietnamese, Chinese (Simplified & Traditional)
- **Voice recorder** (`useVoiceRecorder.ts`) — dihapus
- **Math rendering** (`remark-tex-math.ts`) — dihapus
- **Nanobot client** (`nanobot-client.ts`) — dihapus
- **Activity timeline** (`activity-timeline.ts`) — dihapus
- **ANSI parser** (`ansi.ts`) — dihapus
- **Bun lockfile** — dihapus, hanya pakai npm
- **Settings view** — di-refactor dari 5.500 baris menjadi komponen-komponen terpisah

### 2.6 Config Loader
- Penambahan logic untuk path handling di Windows portable environment

---

## 3. Yang Dimodifikasi

### 3.1 WebUI
- **App.tsx** — Simplified routing dan state management
- **SettingsView** — Di-split ke komponen terpisah:
  - `OverviewSection`
  - `ProvidersSection`
  - `ModelsSection`
  - `BrowserSection`
  - `ImageSection`
  - `RuntimeSection`
  - `AdvancedSection`
  - `AppearanceSection`
  - `AppsSection`
- **ThreadComposer** — Simplified
- **MessageBubble** — Simplified rendering
- **useSessions** — Simplified session management
- **useNanobotStream** — Minor adjustments

### 3.2 CLI Commands
- `nanobot/cli/commands.py` — Modifikasi untuk Windows portable paths

### 3.3 Config Loader
- `nanobot/config/loader.py` — Tambahan Windows path handling

### 3.4 WebSocket Channel
- `nanobot/channels/websocket.py` — Modifikasi untuk WebUI integration

### 3.5 Config Whitelist (Provider & Channel)
Fork ini menerapkan **whitelist** pada `config.json` yang di-generate via `save_config()`:

**File terkait:**
- `nanobot/config/loader.py` — `_PROVIDER_WHITELIST` & `_CHANNEL_WHITELIST`
- `nanobot/cli/commands.py` — `_onboard_plugins()` diubah supaya pakai `save_config()`

**Provider whitelist** (`_PROVIDER_WHITELIST`):
```python
{"openai", "custom", "anthropic", "deepseek", "aihubmix", "gemini", "nvidia", "ollama"}
```
Provider lain (e.g. `azure_openai`, `bedrock`, `github_copilot`, `openai_codex`, dll.) tidak akan muncul di `config.json`.

**Channel whitelist** (`_CHANNEL_WHITELIST`):
```python
{"telegram", "whatsapp", "websocket", "email", "cli"}
```
Channel lain (e.g. `discord`, `slack`, `feishu`, `dingtalk`, `matrix`, `signal`, dll.) tidak akan muncul di `config.json`.

**Catatan teknis:**
- `_onboard_plugins()` awalnya menulis langsung ke JSON via `json.dump`, bypass filter.
- Fix: `_onboard_plugins()` sekarang load → merge → re-parse via `Config.model_validate()` → save via `save_config()`.
- Field bawaan channels (`sendProgress`, `sendToolHints`, `showReasoning`, `extractDocumentText`, `sendMaxRetries`, `transcriptionProvider`, `transcriptionLanguage`) menggunakan **camelCase** karena `Base` model pakai `alias_generator=to_camel`.

### 3.6 README
- README.md — Disederhanakan dari 477 baris

---

## 4. Yang Tetap Utuh

### 4.1 Core Agent
- **AgentLoop** (`nanobot/agent/loop.py`) — Intact
- **ContextBuilder** (`nanobot/agent/context.py`) — Intact
- **Tool system** — Intact
- **Provider system** — Intact
- **Session management** — Intact
- **Memory/Dream** — Intact
- **Commands** — Intact
- **Subagent system** — Intact

### 4.2 Channels
- Semua channel implementations tetap ada
- BaseChannel tetap utuh

### 4.3 Tools
- Semua built-in tools tetap ada
- MCP integration tetap ada

### 4.4 API & Gateway
- OpenAI-compatible API server tetap ada
- Gateway server tetap ada

---

## 5. Rekomendasi

Karena test suite dihapus, **hati-hati** saat melakukan modifikasi core. Tidak ada safety net dari unit tests.

Jika ingin mengembangkan lebih lanjut:
1. Pertimbangkan menambahkan kembali tests yang relevan
2. Dokumentasi ini (yang baru dibuat) dapat membantu memahami codebase
3. WebUI masih berfungsi penuh meski sudah disederhanakan
