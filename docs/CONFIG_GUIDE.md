# Configuration Guide

> Dokumentasi ini dibuat dari source code analysis (`nanobot/config/schema.py`).

---

## 1. Config File Location

Nanobot membaca konfigurasi dari (berurutan):

1. **`~/.nanobot/config.json`** — default location
2. Path yang ditentukan via arg: `--config /path/to/config.json`
3. Environment variables dengan prefix `NANOBOT_` (e.g., `NANOBOT_AGENTS__DEFAULTS__MODEL`)

### Windows Portable Note
Pada fork Windows portable ini, workspace default biasanya diarahkan ke folder portable (bukan `~/.nanobot`).

---

## 2. Root Config Sections

```json
{
  "agents": { ... },
  "channels": { ... },
  "transcription": { ... },
  "providers": { ... },
  "api": { ... },
  "gateway": { ... },
  "tools": { ... },
  "modelPresets": { ... }
}
```

---

## 3. Agents Config

```json
{
  "agents": {
    "defaults": {
      "workspace": "~/.nanobot/workspace",
      "model": "anthropic/claude-opus-4-5",
      "provider": "auto",
      "model_preset": null,
      "max_tokens": 8192,
      "context_window_tokens": 65536,
      "context_block_limit": null,
      "temperature": 0.1,
      "fallback_models": [],
      "max_tool_iterations": 200,
      "max_concurrent_subagents": 1,
      "max_tool_result_chars": 16000,
      "provider_retry_mode": "standard",
      "tool_hint_max_length": 40,
      "reasoning_effort": null,
      "timezone": "UTC",
      "bot_name": "nanobot",
      "bot_icon": "🐈",
      "unified_session": false,
      "disabled_skills": [],
      "session_ttl_minutes": 0,
      "max_messages": 120,
      "consolidation_ratio": 0.5,
      "dream": {
        "enabled": true,
        "interval_h": 2
      }
    }
  }
}
```

### Field Descriptions

| Field | Default | Description |
|-------|---------|-------------|
| `workspace` | `~/.nanobot/workspace` | Root directory untuk sessions, memory, skills |
| `model` | `anthropic/claude-opus-4-5` | Default model ID |
| `provider` | `auto` | Provider name atau `auto` untuk auto-detect |
| `model_preset` | `null` | Active preset name (overrides model/provider) |
| `max_tokens` | 8192 | Max completion tokens |
| `context_window_tokens` | 65536 | Model context window size |
| `temperature` | 0.1 | Sampling temperature (0-2) |
| `fallback_models` | `[]` | Fallback presets jika primary gagal |
| `max_tool_iterations` | 200 | Max tool calls per turn |
| `max_concurrent_subagents` | 1 | Max subagents running in parallel |
| `max_tool_result_chars` | 16000 | Max chars per tool result |
| `provider_retry_mode` | `standard` | `standard` atau `persistent` |
| `reasoning_effort` | `null` | `low`/`medium`/`high`/`adaptive`/`none` |
| `timezone` | `UTC` | IANA timezone untuk timestamps |
| `bot_name` | `nanobot` | Display name di CLI prompts |
| `bot_icon` | `🐈` | Icon di CLI (string kosong untuk hide) |
| `unified_session` | `false` | Satu session untuk semua channels |
| `disabled_skills` | `[]` | List skill names yang di-disable |
| `session_ttl_minutes` | 0 | Auto-compact idle session (0 = disabled) |
| `max_messages` | 120 | Max messages dari history untuk replay |
| `consolidation_ratio` | 0.5 | Target ratio setelah memory compact |

### Dream Config

```json
{
  "enabled": true,
  "interval_h": 2,
  "model_override": null
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `enabled` | `true` | Register periodic Dream consolidation |
| `interval_h` | 2 | Interval dalam jam |
| `model_override` | `null` | Override model khusus untuk Dream |

---

## 4. Providers Config

### 4.0 Provider Whitelist

Fork ini menerapkan **whitelist** — hanya provider berikut yang muncul di `config.json`:
```python
{"openai", "custom", "aihubmix", "openrouter", "nvidia"}
```
Provider lain (deepseek, ollama, azure_openai, bedrock, dll.) tidak akan disimpan oleh `save_config()`.

### 4.1 Built-in Providers

```json
{
  "providers": {
    "anthropic": { "api_key": "sk-ant-..." },
    "openai": { "api_key": "sk-..." },
    "openrouter": { "api_key": "sk-..." },
    "deepseek": { "api_key": "sk-..." },
    "groq": { "api_key": "gsk_..." },
    "gemini": { "api_key": "..." },
    "ollama": { "api_base": "http://localhost:11434" },
    "lm_studio": { "api_base": "http://localhost:1234/v1" },
    "bedrock": { "region": "us-east-1", "profile": "default" },
    "azure_openai": { "api_key": "...", "api_base": "..." },
    "custom": { "api_key": "...", "api_base": "..." }
  }
}
```

### 4.2 Provider Fields

| Field | Type | Description |
|-------|------|-------------|
| `api_key` | string | API key untuk provider |
| `api_base` | string | Custom base URL |
| `api_type` | string | `auto`, `chat_completions`, `responses` |
| `extra_headers` | dict | Custom HTTP headers |
| `extra_body` | dict | Extra request body fields |
| `extra_query` | dict | Extra query params |

### 4.3 Custom Providers

Tambahkan provider custom langsung di config:

```json
{
  "providers": {
    "my_gateway": {
      "api_key": "my-key",
      "api_base": "https://api.mycompany.com/v1"
    }
  }
}
```

Kemudian gunakan dengan prefix model: `my_gateway/gpt-4`.

### 4.4 AWS Bedrock Config

```json
{
  "providers": {
    "bedrock": {
      "region": "us-east-1",
      "profile": "default"
    }
  }
}
```

---

## 5. Model Presets

```json
{
  "modelPresets": {
    "fast": {
      "label": "Fast & Cheap",
      "model": "groq/llama-3.1-70b-versatile",
      "provider": "groq",
      "max_tokens": 4096,
      "temperature": 0.1
    },
    "smart": {
      "label": "Smart & Thorough",
      "model": "anthropic/claude-opus-4-5",
      "provider": "anthropic",
      "max_tokens": 16384,
      "temperature": 0.1
    },
    "coding": {
      "label": "Code Mode",
      "model": "anthropic/claude-sonnet-4",
      "provider": "anthropic",
      "max_tokens": 8192,
      "temperature": 0.0
    }
  }
}
```

### Fallback Models

```json
{
  "agents": {
    "defaults": {
      "fallback_models": ["fast", "smart"]
    }
  }
}
```

Fallback dapat berupa:
- **String**: nama preset yang direferensikan
- **Object**: inline fallback config

```json
{
  "fallback_models": [
    "fast",
    {
      "model": "groq/llama3-8b",
      "provider": "groq",
      "max_tokens": 4096
    }
  ]
}
```

---

## 6. Channels Config

### 6.0 Channel Whitelist

Fork ini menerapkan **whitelist** — hanya channel berikut yang muncul di `config.json`:
```python
{"telegram", "whatsapp", "websocket", "email", "cli"}
```
Channel lain (discord, slack, feishu, dingtalk, matrix, signal, dll.) tidak akan disimpan oleh `save_config()`.

### 6.1 Global Channel Settings

```json
{
  "channels": {
    "send_progress": true,
    "send_tool_hints": false,
    "show_reasoning": true,
    "extract_document_text": true,
    "send_max_retries": 3,
    "transcription_provider": "groq",
    "transcription_language": null
  }
}
```

### 6.2 Channel-Specific Config

Tambahkan langsung di root config:

```json
{
  "telegram": {
    "enabled": true,
    "token": "YOUR_BOT_TOKEN",
    "allow_from": ["*"],
    "streaming": false
  },
  "discord": {
    "enabled": true,
    "token": "YOUR_BOT_TOKEN",
    "allow_from": ["user_id_1", "user_id_2"]
  },
  "webui": {
    "enabled": true,
    "port": 8080
  }
}
```

### 6.3 Permission Model

| Setting | Behavior |
|---------|----------|
| `allow_from: ["*"]` | Allow semua sender |
| `allow_from: ["12345"]` | Allow sender spesifik |
| Tanpa `allow_from` + pairing store | Pairing code required |

---

## 7. Tools Config

```json
{
  "tools": {
    "restrict_to_workspace": false,
    "webui_allow_local_service_access": true,
    "mcp_servers": {
      "filesystem": {
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allow"],
        "env": {},
        "tool_timeout": 30,
        "enabled_tools": ["*"]
      }
    },
    "ssrf_whitelist": []
  }
}
```

### MCP Server Fields

| Field | Default | Description |
|-------|---------|-------------|
| `type` | auto-detect | `stdio`, `sse`, atau `streamableHttp` |
| `command` | — | Command untuk stdio |
| `args` | `[]` | Arguments |
| `env` | `{}` | Extra env vars |
| `cwd` | — | Working directory |
| `url` | — | URL untuk HTTP/SSE |
| `headers` | `{}` | Custom headers |
| `tool_timeout` | 30 | Timeout dalam detik |
| `enabled_tools` | `["*"]` | Tools yang di-enable (`["*"]` = all) |

---

## 8. API & Gateway Config

### API Server (OpenAI-compatible)

```json
{
  "api": {
    "host": "127.0.0.1",
    "port": 8900,
    "timeout": 120.0
  }
}
```

### Gateway Server

```json
{
  "gateway": {
    "host": "127.0.0.1",
    "port": 18790,
    "heartbeat": {
      "enabled": true,
      "interval_s": 1800,
      "keep_recent_messages": 8
    }
  }
}
```

---

## 9. Transcription Config

```json
{
  "transcription": {
    "enabled": true,
    "provider": null,
    "model": null,
    "language": null,
    "max_duration_sec": 120,
    "max_upload_mb": 25
  }
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `provider` | `null` | `groq`, `openai`, dll |
| `language` | `null` | Kode bahasa ISO 639-1 (e.g., `en`, `id`) |
| `max_duration_sec` | 120 | Max durasi audio |
| `max_upload_mb` | 25 | Max ukuran file |

---

## 10. Environment Variables

Semua config dapat di-override via environment variables dengan prefix `NANOBOT_` dan nested delimiter `__`:

```bash
# Set model
export NANOBOT_AGENTS__DEFAULTS__MODEL=openrouter/anthropic/claude-opus-4-5

# Set API key
export NANOBOT_PROVIDERS__ANTHROPIC__API_KEY=sk-ant-...

# Disable skills
export NANOBOT_AGENTS__DEFAULTS__DISABLED_SKILLS='["skill-1","skill-2"]'

# Set workspace
export NANOBOT_AGENTS__DEFAULTS__WORKSPACE=/path/to/workspace
```

---

## 11. Config Validation

Nanobot menggunakan **Pydantic** untuk validasi config. Error yang umum:

| Error | Penyebab |
|-------|----------|
| `model_preset 'xxx' not found` | Preset yang direferensikan tidak ada di `modelPresets` |
| `providers.xxx conflicts with built-in` | Custom provider name bentrok dengan built-in |
| `providers.<name>.api_type is only supported for providers.openai` | `api_type` hanya untuk OpenAI provider |
| `model_preset name 'default' is reserved` | Tidak boleh membuat preset bernama `default` |
