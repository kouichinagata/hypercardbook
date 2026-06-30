
# HyperCardBook 📖✨

![HyperCardBook Logo](https://fxtqkhfkavwtctuljrqt.supabase.co/storage/v1/object/public/HyperCardBookBucket/d9841327-418b-41fd-8657-59c3b7f7fb19/ed9bf285-70f9-4f99-b026-0669a6a8395a_hyperbook_png.webp)

**Write once. Publish interactive books in 80 languages.**

HyperCardBook is an open-source Markdown platform for creating AI-powered interactive books, interactive web content, and multilingual publications.

Built with **SvelteKit**, **Supabase**, and **Google Gemini**.

---

# Features

## 📝 Markdown First

Everything is stored as Markdown.

Write your content once and easily maintain, version, and publish it.

---

## 🤖 AI-Powered Authoring

Generate, rewrite, summarize, translate, and improve your content using Google Gemini.

---

## 📖 Interactive Books

Create rich interactive books with:

* Images
* Audio
* Videos
* Vertical Shorts (YouTube Shorts, TikTok, Instagram Reels)
* External Web Pages
* AI Characters (PapeRobo)
* Buttons and Interactive Links

---

## 🌍 Automatic Translation

Publish your books in **80+ languages**.

Translations are automatically generated and cached for fast reading.

---

## ⚡ HyperHooks

Customize your books with JavaScript event hooks.

Examples include:

* Page Open
* Page Close
* Button Click
* Timer Events
* Custom Automation

---

## 🧠 Skills

Create reusable AI behaviors and workflows.

Skills allow authors to define custom AI rules that extend writing and reading experiences.

---

## 📚 HyperBook & HyperCard

HyperCardBook supports two publishing styles.

### HyperBook

Interactive AI-powered books for education, storytelling, manuals, and documentation.

### HyperCard

Interactive Markdown-based web applications and websites.

---

## 🤝 PapeRobo Integration

HyperCardBook can connect books with AI characters from PapeRobo.

PapeRobo is a separate AI character call system. It is not required to use HyperCardBook.

When configured, published PapeRobo characters can appear on the HyperCardBook bookshelf, and readers can open them from interactive books.

To enable this integration, set `HYPERCARDBOOK_SHARED_SECRET` to the same value on both HyperCardBook and PapeRobo.

---

## Prerequisites

- Node.js (v20.19.0+ or v22.12.0+)
- A Supabase Project
- Gemini API Key
- Pixabay API Key (optional, for image search)

---

# Installation

Clone the repository.

```bash
git clone https://github.com/kouichinagata/hypercardbook.git

cd hypercardbook
```

Install dependencies.

```bash
npm install
```

---

# Configuration

Copy the example environment file.

```bash
cp .env.example .env
```

Configure the following variables.

| Variable                      | Description                            |
| ----------------------------- | -------------------------------------- |
| `GEMINI_API_KEY`              | Google Gemini API Key                  |
| `PUBLIC_SUPABASE_URL`         | Supabase Project URL                   |
| `PUBLIC_SUPABASE_ANON_KEY`    | Supabase Public Key                    |
| `SUPABASE_SERVICE_ROLE_KEY`   | Backend Service Role Key               |
| `DB_PASSWORD`                 | PostgreSQL Password                    |
| `PIXABAY_API_KEY`             | Optional image search                  |
| `HYPERCARDBOOK_SHARED_SECRET` | Shared secret for PapeRobo integration |

> [!WARNING]
> **Security Critical**:
> - `SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security (RLS) and must **never** be exposed in client-side code or committed to public repositories. SvelteKit's `$env/dynamic/private` is used to keep this key server-side.
> - `DB_PASSWORD` is used by backend setup scripts (like `exec_ddl.js`) to migrate database schemas. Keep it safe and never expose it.

> [!NOTE]
> - `HYPERCARDBOOK_SHARED_SECRET` is only required if integrating with a separate, optional **PapeRobo** AI system. If you are not using PapeRobo, you can leave this blank.

---

# Supabase Setup

Create a public Storage Bucket named:

```
HyperCardBookBucket
```

Run

```
supabase_migration_translations.sql
```

inside the Supabase SQL Editor.

---

# Database Migration

Prepare the database.

```bash
node scripts/exec_ddl.js
```

Import existing Markdown books.

```bash
node scripts/migrate.js
```

---

# Development

Start the development server.

```bash
npm run dev
```

Open

```
http://localhost:5173
```

---

# Production Build

Build the application.

```bash
npm run build
```

Preview the production build.

```bash
npm run preview
```

---

# Technology Stack

* SvelteKit
* Supabase
* Google Gemini
* Markdown
* JavaScript
* PostgreSQL

---

# License

Released under the MIT License.

See the [LICENSE](LICENSE) file for details.
