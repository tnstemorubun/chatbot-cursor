# chatbot-cursor

Chatbot HTML dengan Cursor Cloud Agents API.

## Setup

```bash
npm install
cp .env.example .env   # isi CURSOR_API_KEY
npm start
```

## Cloud Agent + GitHub Sync

Cloud Agent otomatis terhubung ke repo GitHub lewat `GITHUB_REPO_URL`.
Setelah agent selesai (`FINISHED`) dan push perubahan, server menjalankan `git pull` agar kode lokal tetap sinkron.

Pastikan:
1. GitHub sudah terhubung di [Cursor Dashboard → Integrations](https://cursor.com/dashboard)
2. Repo `tnstemorubun/chatbot-cursor` sudah di-authorize
3. `git remote origin` sudah mengarah ke repo yang sama
