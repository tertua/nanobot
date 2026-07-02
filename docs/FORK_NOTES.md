# Fork Notes: Windows Portable

> Dokumentasi ini dibuat dari analisis perbedaan antara fork ini dan upstream HKUDS/nanobot.
> Terakhir diperbarui: setelah sync upstream 308 commits (2026-07-02).

---

## 1. Summary

Ini adalah **fork Windows portable** dari nanobot. Fork ini mengambil core functionality dan menghapus/menyederhanakan banyak komponen yang tidak esensial untuk deployment portable di Windows.

---

## 2. Yang Dihapus

### 2.1 Tests
- **Semua unit tests dihapus** (`tests/` — ~105.000 baris kode test)

### 2.2 Documentation
- `.agent/security.md`, `.github/workflows/ci.yml`
- `SECURITY.md`, `CONTRIBUTING.md`, `COMMUNICATION.md`
- `Dockerfile`
- `scripts/install.ps1`, `scripts/install.sh`

### 2.3 Demo Assets
- `case/code.gif`, `case/memory.gif`, `case/schedule.gif`, `case/search.gif`

### 2.4 WebUI Simplifications
- **i18n**: Hanya menyisakan English dan Indonesian
  - Dihapus: Spanish, French, Japanese, Korean, Vietnamese, Chinese (Simplified & Traditional)
- **Bun lockfile** — dihapus, hanya pakai npm

### 2.5 Config Whitelist (Provider & Channel)
Fork ini menerapkan **whitelist** pada `config.json` yang di-generate via `save_config()`:

**Provider whitelist** (`_PROVIDER_WHITELIST`):
```python
{"openai", "custom", "aihubmix", "openrouter", "nvidia"}
```

**Channel whitelist** (`_CHANNEL_WHITELIST`):
```python
{"telegram", "whatsapp", "websocket", "email", "cli"}
```

Lihat `nanobot/config/loader.py` untuk detail.

---

## 3. Yang Dimodifikasi

### 3.1 CLI Commands
- `nanobot/cli/commands.py` — API key URL diarahkan ke NVIDIA (`build.nvidia.com`)
- `_onboard_plugins()` diubah supaya pakai `save_config()` (agar whitelist tetap diterapkan)

### 3.2 Config Loader
- `nanobot/config/loader.py` — Whitelist filtering di `save_config()`

### 3.3 WebUI
- `SettingsView.tsx` — Mengikuti upstream (monolithic 7500+ baris)

### 3.4 AGENTS.md
- `AGENTS.md` — Development guide untuk agent sessions

---

## 4. Yang Dipertahankan (berbeda dari upstream lama)

Setelah sync upstream (308 commits), fitur-fitur berikut **dipertahankan** meskipun sebelumnya dihapus:

| Fitur | Status | Alasan |
|-------|--------|--------|
| Voice recorder (`useVoiceRecorder.ts`) | Dipertahankan | Upstream bergantung padanya |
| Math rendering (`remark-tex-math.ts`) | Dipertahankan | Upstream bergantung padanya |
| ANSI parser (`ansi.ts`) | Dipertahankan | Upstream bergantung padanya |
| Nanobot client (`nanobot-client.ts`) | Dipertahankan | Upstream bergantung padanya |
| Activity timeline (`activity-timeline.ts`) | Dipertahankan | Upstream bergantung padanya |

Menghapus fitur ini akan memerlukan modifikasi besar-besaran pada komponen upstream.

---

## 5. Yang Tetap Utuh

### 5.1 Core Agent
- AgentLoop, ContextBuilder, Tool system, Provider system
- Session management, Memory/Dream, Commands, Subagent system

### 5.2 Channels & Tools
- Semua channel implementations tetap ada
- Semua built-in tools tetap ada
- MCP integration tetap ada

### 5.3 API & Gateway
- OpenAI-compatible API server tetap ada
- Gateway server tetap ada

---

## 6. Rekomendasi

Karena test suite dihapus, **hati-hati** saat melakukan modifikasi core. Tidak ada safety net dari unit tests.

Jika ingin mengembangkan lebih lanjut:
1. Pertimbangkan menambahkan kembali tests yang relevan
2. Dokumentasi ini dapat membantu memahami codebase
3. WebUI berfungsi penuh dengan fitur upstream
