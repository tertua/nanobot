# Turn Lifecycle & State Machine

> Dokumentasi ini dibuat dari source code analysis (`nanobot/agent/loop.py`).

---

## 1. Overview

Setiap pesan yang masuk diproses sebagai **satu turn** yang berjalan melalui state machine. Turn adalah unit atomik pemrosesan: satu pesan user → satu atau lebih LLM calls → tool executions → response.

---

## 2. State Machine

```
RESTORE ──ok──> COMPACT ──ok──> COMMAND ──dispatch──> BUILD ──ok──> RUN ──ok──> SAVE ──ok──> RESPOND ──ok──> DONE

Exception di state manapun → DONE (cleanup)
COMMAND match → shortcut ke DONE (setelah execute command)
```

---

## 3. Detailed States

### 3.1 RESTORE (`_state_restore`)

**Tujuan**: Prepare session sebelum turn dimulai.

**Actions**:
1. **Load session** dari SessionManager (atau buat baru)
2. **Extract documents** dari media attachments (PDF, DOCX, PPTX) jika `extract_document_text=true`
3. **Restore checkpoint** jika turn sebelumnya di-interrupt:
   - Turn sebelumnya mungkin gagal di tengah (timeout, error, `/stop`)
   - Partial state disimpan di session metadata: `_checkpoint_tool_result`, `_pending_tool_call`
   - Tool result dari turn sebelumnya di-"rewind" dan tool call di-replay

**Checkpoint Recovery**:
```python
# Jika turn sebelumnya di-interrupt:
- Ambil checkpoint_tool_result dari metadata
- Masukkan ke session messages sebagai tool result
- Restore pending_tool_calls
- Turn akan melanjutkan dari state RUN dengan context yang sudah tersusun
```

**Output**: `ctx.state = COMPACT`

---

### 3.2 COMPACT (`_state_compact`)

**Tujuan**: Trigger auto-compact jika session terlalu panjang.

**Logic**:
```python
if session.message_count > AUTO_COMPACT_THRESHOLD:
    trigger_memory_compaction()
```

Auto-compact akan:
- Archive old messages ke memory/history
- Generate summary
- Trim session ke `max_messages`

**Output**: `ctx.state = COMMAND`

---

### 3.3 COMMAND (`_state_command`)

**Tujuan**: Cek apakah pesan adalah slash command.

**Logic**:
1. Ambil pesan terakhir dari session
2. Cek apakah content dimulai dengan `/`
3. Match ke `CommandRouter`
4. Jika match → execute command handler → shortcut ke DONE
5. Jika tidak match → lanjut ke BUILD

**Command Handlers** (`nanobot/command/builtin.py`):
- `/new` — clear session
- `/stop` — cancel active tasks
- `/restart` — restart process
- `/status` — show runtime status
- `/model [preset]` — switch model
- `/history [n]` — show history
- `/goal <text>` — start sustained goal
- `/dream` — trigger memory consolidation
- `/dream-log` — show dream changes
- `/dream-restore <sha>` — restore memory
- `/skill` — list skills
- `/pairing` — manage pairing
- `/help` — show commands

**Output**: `ctx.state = BUILD` (atau `DONE` jika command match)

---

### 3.4 BUILD (`_state_build`)

**Tujuan**: Susun context lengkap untuk LLM.

**Actions**:
1. **Get recent messages** dari session via `get_history(max_messages)`
2. **Build system prompt** via ContextBuilder:
   - Identity (workspace, runtime info)
   - Bootstrap files (AGENTS.md, SOUL.md, USER.md)
   - Tool contract
   - Memory context (MEMORY.md)
   - Active skills (always skills)
   - Skills summary
   - Recent history (history.jsonl)
   - Session summary (jika ada)
3. **Build messages list**:
   - System prompt
   - Recent conversation history
   - Current user message + runtime context block
4. **Set metadata**: `_building_context = True` (untuk cancel detection)
5. **Auto-compact** jika context melebihi token limit (fallback)

**Runtime Context Block**:
```
[Runtime Context — metadata only, not instructions]
Current Time: 2026-06-16 21:03 (Tuesday) (Asia/Jakarta, UTC+07:00)
Channel: websocket
Chat ID: c9958f0b-d880-431a-a7cc-d937bf78425b
Sender ID: anon-240c17b3fe2e
[/Runtime Context]
```

**Output**: `ctx.state = RUN`

---

### 3.5 RUN (`_state_run`)

**Tujuan**: Eksekusi utama — panggil LLM dan jalankan tool calls.

**Actions**:
1. **Build progress callback** — untuk streaming progress ke channel
2. **Set tool context** — inject routing info (channel, chat_id, session_key) ke tools
3. **Call LLM** via `AgentRunner.run()`:
   - Kirim messages + tools schema ke provider
   - Dapat response (text + optional tool_calls)
4. **Handle tool calls** (iterasi):
   ```
   while tool_calls:
       validate tool_calls
       execute tools (parallel jika concurrency_safe)
       build tool result messages
       call LLM lagi dengan updated messages
       dapat next response
   ```
5. **Mid-turn injection handling**:
   - Jika ada pesan baru dari user saat turn berjalan → queue dan inject
   - Pesan di-queue via `_pending_queues`
   - Di-inject sebagai user messages in-order

**Tool Execution**:
- Tools yang `read_only=True` dan `exclusive=False` → parallel execution
- Tools dengan side effects atau `exclusive=True` → serial execution
- Max tool calls per turn: `max_tool_iterations` (default 200)

**Output**: `ctx.state = SAVE`

---

### 3.6 SAVE (`_state_save`)

**Tujuan**: Persist turn ke session storage.

**Actions**:
1. **Append messages ke session**:
   - User message
   - Assistant message (dengan tool_calls jika ada)
   - Tool results (jika ada)
2. **Enforce file cap**:
   - Jika session > 2000 messages → archive old messages ke memory/
3. **Cleanup checkpoint metadata**:
   - Hapus `_checkpoint_tool_result`, `_pending_tool_call`
4. **Save session** ke disk (JSONL)
5. **Update title** (jika belum ada):
   - Extract title dari first user message
   - Strip think tags
   - Trim ke 120 chars

**Output**: `ctx.state = RESPOND`

---

### 3.7 RESPOND (`_state_respond`)

**Tujuan**: Kirim response ke user via channel.

**Actions**:
1. **Build final content** dari assistant response
2. **Split response** (jika melebihi max_tokens dan streaming disabled):
   - Split ke beberapa parts
   - Update metadata untuk multi-part delivery
3. **Publish outbound message** ke MessageBus
4. **Handle media attachments** (images, files)
5. **Schedule background tasks** (consolidation, archiving)

**Output**: `ctx.state = DONE`

---

### 3.8 DONE

Turn selesai. Session lock dilepaskan.

---

## 4. Concurrent Execution Model

### 4.1 Per-Session Serial

```python
# Setiap session key punya satu lock
async with self._lock_for(key):
    await self._run_one_turn(ctx)
```

- Hanya satu turn per session yang berjalan pada satu waktu
- Ini mencegah race condition pada session state

### 4.2 Cross-Session Concurrent

```python
# Global semaphore membatasi total concurrent turns
self._semaphore = asyncio.Semaphore(max_concurrent_turns)  # default: 3
```

- Turn dari session berbeda dapat berjalan paralel (max 3 secara default)
- Cron turns punya koordinator sendiri (`CronTurnCoordinator`)

### 4.3 Mid-Turn Injection

```
User kirim pesan A → Turn A mulai (BUILD → RUN)
                    ↳ User kirim pesan B saat Turn A di RUN
                      → Pesan B di-queue di _pending_queues[key]
                      → Saat Turn A sampling ke-2, pesan B di-inject
                      → Turn A selesai dengan konteks yang sudah include pesan B
```

---

## 5. Error Handling

### 5.1 Turn-Level Errors

Exception di state manapun akan:
1. Log error
2. Cleanup resources
3. Transition ke DONE
4. Release session lock

### 5.2 Tool Errors

- Tool error → result disimpan sebagai error message
- Turn lanjut ke LLM call berikutnya dengan error context
- Max tool errors tidak hard-coded (tapi ada max iterations)

### 5.3 Provider Errors

- Retry dengan exponential backoff (tergantung `provider_retry_mode`)
- Fallback ke model lain jika primary gagal
- Setelah semua fallback habis → error ke user

### 5.4 Checkpoint on Failure

Jika turn gagal di tengah (timeout, process crash):
- Tool result yang sudah didapat disimpan di session metadata
- Tool calls yang pending disimpan di metadata
- Turn berikutnya restore dari checkpoint dan melanjutkan

---

## 6. Cancellation

### 6.1 /stop Command

```python
async def cmd_stop(ctx):
    total = await loop._cancel_active_tasks(ctx.key)
    # Cancel semua subagents untuk session ini
    # Cancel active turn jika sedang berjalan
```

### 6.2 Cancel Detection

```python
# Saat turn berjalan, cek apakah ada pending /stop
if self._cancel_requests.get(key):
    self._cancel_requests[key] = False
    raise CancelTurnRequest("Turn cancelled by user via /stop")
```

Cancel dapat terjadi di:
- Antara tool execution batches
- Saat waiting for LLM response

---

## 7. Streaming

### 7.1 Streaming Model

```
LLM response stream → chunk 1, chunk 2, chunk 3...
                    ↳ Progress callback ke channel
                      → send_delta() per chunk
                      → send_reasoning_delta() untuk thinking content
                      → send_reasoning_end() saat reasoning selesai
```

### 7.2 Channel Streaming Support

- Channel dengan `supports_streaming=True` menerima chunk secara real-time
- Channel tanpa streaming menerima full response setelah selesai
- WebUI, Telegram (dengan editMessageText), Discord mendukung streaming
- CLI mendukung streaming ke stdout

---

## 8. Background Tasks

Beberapa operasi dijalankan di background (tidak blocking turn):

| Task | Trigger |
|------|---------|
| Memory consolidation | Post-turn jika threshold tercapai |
| Session archiving | Post-turn jika file cap tercapai |
| Subagent cleanup | Periodic |
| Cron tick | Every minute |
| Heartbeat | Configured interval |
