# Skill Development Guide

> Dokumentasi ini dibuat dari source code analysis.

Skills adalah cara untuk menambah kemampuan agent tanpa mengubah core code. Skill berupa **dokumen markdown (SKILL.md)** yang ditempatkan di folder `skills/`.

---

## 1. Struktur Skill

```
skills/
  my-skill/                 # nama skill = nama folder
    SKILL.md               # WAJIB: instruksi, tools, dan metadata
    scripts/               # (opsional) helper scripts
    references/            # (opsional) docs & examples
    assets/                # (opsional) static files
```

Skill dapat ditempatkan di dua lokasi:
- **`{workspace}/skills/`** — user-defined skills (priority)
- **`{package}/nanobot/skills/`** — built-in skills (shipped dengan nanobot)

---

## 2. SKILL.md Format

### 2.1 YAML Frontmatter (Opsional tapi direkomendasikan)

```markdown
---
description: "Deskripsi singkat skill ini untuk agent"
always: true
requires:
  bins: ["git", "node"]
  env: ["OPENAI_API_KEY"]
metadata:
  nanobot:
    always: true
    category: "development"
---

# My Skill

Instruksi detail untuk agent tentang cara menggunakan skill ini.

## Tools

Skill ini menyediakan tool:
- `my_custom_tool` — deskripsi tool

## Usage

Contoh penggunaan...
```

### 2.2 Frontmatter Fields

| Field | Type | Deskripsi |
|-------|------|-----------|
| `description` | string | Deskripsi singkat yang muncul di skills summary |
| `always` | boolean | Jika `true`, skill selalu dimuat ke system prompt |
| `requires.bins` | list | CLI commands yang harus tersedia di PATH |
| `requires.env` | list | Environment variables yang harus ada |
| `metadata.nanobot` | object | Metadata ekstra untuk nanobot |

### 2.3 Loading Behavior

- **`always: true`** → Konten skill dimasukkan langsung ke system prompt setiap turn
- **`always: false`** (default) → Hanya muncul di skills summary; agent memilih untuk membacanya via `read_file` jika perlu
- Skill dengan requirements yang tidak terpenuhi ditandai "unavailable" di summary

---

## 3. Skill Content Guidelines

### 3.1 Instruksi untuk Agent

Tulis SKILL.md seolah-olah kamu sedang memberi instruksi ke AI assistant:

```markdown
# Docker Helper

Gunakan skill ini untuk membantu user mengelola container Docker.

## Best Practices
- Selalu cek status container sebelum mengubahnya
- Gunakan `docker compose` untuk multi-container apps
- Backup volume sebelum destructive operations

## Commands Reference
- `docker ps` — list running containers
- `docker logs <container>` — view logs
- `docker exec -it <container> sh` — shell ke container
```

### 3.2 Progressive Loading

Jika skill kamu panjang, gunakan progressive loading:

```markdown
# Kubernetes Manager

Ini adalah skill untuk mengelola cluster Kubernetes.

## Quick Reference
Untuk referensi cepat, baca `references/cheatsheet.md`.

## Full Documentation
Baca `references/full-guide.md` untuk dokumentasi lengkap.

## Scripts
- `scripts/kube-status.py` — check cluster health
- `scripts/backup-ns.sh` — backup namespace
```

Agent akan membaca file-file referensi via `read_file` atau `exec` hanya jika diperlukan.

---

## 4. Skill dengan Scripts

Kamu bisa menempatkan executable scripts di folder `scripts/` skill:

```
skills/db-migrate/
  SKILL.md
  scripts/
    migrate.py
    rollback.py
```

Dalam SKILL.md:
```markdown
## Scripts

- `scripts/migrate.py` — Run database migration
  Usage: `python skills/db-migrate/scripts/migrate.py <direction> <version>`

- `scripts/rollback.py` — Rollback migration
  Usage: `python skills/db-migrate/scripts/rollback.py <version>`
```

Agent dapat menjalankan script tersebut via tool `exec`.

---

## 5. Disabled Skills

Untuk menonaktifkan skill tanpa menghapus folder:

```json
// config.json
{
  "agents": {
    "defaults": {
      "disabled_skills": ["skill-name-1", "skill-name-2"]
    }
  }
}
```

---

## 6. Best Practices

1. **Keep it focused** — Satu skill = satu domain (e.g., "docker", "aws", "python-testing")
2. **Use examples** — Berikan contoh penggunaan yang konkret
3. **Document requirements** — Declare `requires.bins` dan `requires.env` di frontmatter
4. **Progressive loading** — Jangan buat SKILL.md terlalu panjang; split ke `references/`
5. **Version your skills** — Gunakan git di workspace untuk versioning
6. **Test your skill** — Uji skill dengan memberikan instruksi yang relevan ke agent

---

## 7. Skill Example

```markdown
---
description: "Generate and edit images using Pillow"
always: false
requires:
  bins: ["python"]
metadata:
  nanobot:
    category: "media"
---

# Image Processing

Skill untuk memproses dan memanipulasi gambar menggunakan Python Pillow.

## Prerequisites
Pastikan Python dan Pillow terinstall:
```bash
pip install Pillow
```

## Quick Operations

### Resize Image
```python
from PIL import Image
img = Image.open("input.jpg")
img.thumbnail((800, 800))
img.save("output.jpg")
```

### Convert Format
```python
from PIL import Image
Image.open("input.png").convert("RGB").save("output.jpg", quality=95)
```

## Best Practices
- Selalu backup gambar original sebelum edit
- Gunakan format yang sesuai (PNG untuk transparency, JPEG untuk foto)
- Perhatikan color space (RGB vs RGBA vs L)
```
