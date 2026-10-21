# Shorts Studio — Setup Guide

> **1080×1920 vertical video generator** with Spotify metadata fill, Whisper auto-captions, and a live audio spectrum visualizer. Publish finished exports to YouTube (resumable upload with schedule, category and thumbnail) or to your TikTok inbox, and see recent YouTube Shorts stats.

---

## Table of Contents

1. [Quick Start](#1-quick-start)
2. [Environment Variables Reference](#2-environment-variables-reference)
3. [Vercel KV Setup](#3-vercel-kv-setup)
4. [Google / YouTube Setup](#4-google--youtube-setup)
5. [TikTok Developer Setup](#5-tiktok-developer-setup)
6. [Spotify Setup](#6-spotify-setup)
7. [OpenAI / Whisper Setup](#7-openai--whisper-setup)
8. [Local Development](#8-local-development)
9. [Deploying to Vercel](#9-deploying-to-vercel)
10. [Feature Availability Matrix](#10-feature-availability-matrix)

---

## 1. Quick Start

```bash
git clone https://github.com/carl-stem/youtube-shorts-studio.git
cd youtube-shorts-studio
npm install
npm run dev          # → http://localhost:3000
```

The app works immediately without any API keys. File export, project save/load, and the full canvas editor all run offline. Add keys progressively to unlock publishing features.

---

## 2. Environment Variables Reference

Add these in **Vercel Dashboard → your project → Settings → Environment Variables**.  
For local dev, copy `.env.example` to `.env.local` (never commit `.env.local`).

| Variable | Required For | Where to Get It |
|----------|-------------|-----------------|
| `NEXTAUTH_URL` | All OAuth callbacks | Your Vercel domain: `https://youtube-shorts-studio.vercel.app` |
| `KV_REST_API_URL` | Token storage (YouTube/TikTok auth); rate limits for Spotify/Whisper in production | Vercel Dashboard → Storage → KV |
| `KV_REST_API_TOKEN` | Token storage | Vercel Dashboard → Storage → KV |
| `TOKEN_ENC_KEY` | Encrypting OAuth tokens at rest (required in production for YouTube/TikTok connect) | `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID` | YouTube OAuth | [console.cloud.google.com](https://console.cloud.google.com) |
| `GOOGLE_CLIENT_SECRET` | YouTube OAuth | [console.cloud.google.com](https://console.cloud.google.com) |
| `TIKTOK_CLIENT_KEY` | TikTok OAuth | [developers.tiktok.com](https://developers.tiktok.com) |
| `TIKTOK_CLIENT_SECRET` | TikTok OAuth | [developers.tiktok.com](https://developers.tiktok.com) |
| `SPOTIFY_CLIENT_ID` | Spotify metadata search | [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) |
| `SPOTIFY_CLIENT_SECRET` | Spotify metadata search | [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) |
| `OPENAI_API_KEY` | Whisper auto-captions | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| `WHISPER_DAILY_MINUTES` | Optional free auto-caption minutes per user per UTC day (default 60) | Any non-negative number |

**Example `.env.local`:**
```env
NEXTAUTH_URL=http://localhost:3000
KV_REST_API_URL=https://your-kv.kv.vercel-storage.com
KV_REST_API_TOKEN=your-kv-token
GOOGLE_CLIENT_ID=123456789-abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxxxx
TIKTOK_CLIENT_KEY=awxxxxxxxxxxxxxx
TIKTOK_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SPOTIFY_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SPOTIFY_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## 3. Vercel KV Setup

Vercel KV is a serverless Redis store used to persist OAuth session state and tokens. Tokens are encrypted at rest with AES-256-GCM using `TOKEN_ENC_KEY` (generate with `openssl rand -base64 32`). In production, YouTube/TikTok connect is refused with `token_encryption_not_configured` if the key is missing; in development tokens are stored unencrypted with a console warning. Tokens saved before encryption was enabled are re-saved encrypted the next time they are read. Free tier: **30,000 requests/day**.

**Steps:**
1. Go to **[vercel.com/dashboard](https://vercel.com/dashboard)** → your project
2. Click the **Storage** tab → **Create Database** → choose **KV**
3. Name it `shorts-studio-kv` → click **Create**
4. Click **Connect to Project** → select your project → **Connect**
5. Vercel automatically adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` to your project's env vars
6. **Pull to local:** `npx vercel env pull .env.local` (requires `npx vercel link` first)

> **No KV?** Local editing and export work without KV. In local development, Spotify search and Whisper captions also work without KV (rate limits are skipped). In production (`NODE_ENV=production`) they require KV for rate limiting and refuse with `503` (`rate_limit_unavailable`) when it is missing. YouTube/TikTok OAuth tokens always require storage.

---

## 4. Google / YouTube Setup

**Estimated time: 10–15 minutes**

### 4.1 Create a Google Cloud Project
1. Go to **[console.cloud.google.com](https://console.cloud.google.com)**
2. Click the project selector at the top → **New Project**
3. Name: `Shorts Studio` → **Create**

### 4.2 Enable Required APIs
1. In the left sidebar → **APIs & Services → Library**
2. Search and enable each:
   - **YouTube Data API v3** (for uploading videos)
   - **YouTube Analytics API** (for the analytics dashboard)

### 4.3 Configure OAuth Consent Screen
1. **APIs & Services → OAuth consent screen**
2. User Type: **External** → **Create**
3. Fill in:
   - App name: `Shorts Studio`
   - User support email: your email
   - Developer contact: your email
4. Click **Save and Continue**
5. **Scopes → Add or Remove Scopes**, add:
   - `https://www.googleapis.com/auth/youtube.upload`
   - `https://www.googleapis.com/auth/youtube.readonly`
   - `https://www.googleapis.com/auth/yt-analytics.readonly`
6. Click **Save and Continue** through the rest
7. **Test users**: add your own Google account while in development

### 4.4 Create OAuth Credentials
1. **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
2. Application type: **Web application**
3. Name: `Shorts Studio Web`
4. **Authorized redirect URIs** — add **both**:
   - `https://YOUR_VERCEL_DOMAIN.vercel.app/api/auth/google/callback`
   - `http://localhost:3000/api/auth/google/callback` (for local dev)
5. Click **Create**
6. Copy **Client ID** and **Client Secret** → add to Vercel env vars

### 4.5 Add to Vercel
```
GOOGLE_CLIENT_ID     = 123456789-abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET = GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxxxx
```

> **Publishing to production?** Submit your OAuth app for Google verification. Until verified, only test users can authenticate.

---

## 5. TikTok Developer Setup

**Estimated time: 15–20 minutes**

> **Note:** TikTok requires app review before enabling production video uploads. During development, use a sandbox/test account.

### 5.1 Create a TikTok Developer App
1. Go to **[developers.tiktok.com](https://developers.tiktok.com)** → **My Apps → Create App**
2. Fill in:
   - App name: `Shorts Studio`
   - Category: `Content & Media`
   - Description: A video creation and publishing tool
3. Click **Submit**

### 5.2 Add Products
1. In your app dashboard → **Add Products**
2. Add **Content Posting API** → click **Add**
3. This enables `video.upload` and `video.publish` scopes

### 5.3 Configure Redirect URIs
1. In app settings → **Login Kit → Redirect domain**
2. Add:
   - `https://YOUR_VERCEL_DOMAIN.vercel.app`
   - `http://localhost:3000` (for local dev)
3. Under **Redirect URI for login kit**:
   - `https://YOUR_VERCEL_DOMAIN.vercel.app/api/auth/tiktok/callback`
   - `http://localhost:3000/api/auth/tiktok/callback`

### 5.4 Get Credentials
1. Go to app → **Keys and tokens**
2. Copy **Client key** and **Client secret**

### 5.5 Add to Vercel
```
TIKTOK_CLIENT_KEY    = awxxxxxxxxxxxxxxxx
TIKTOK_CLIENT_SECRET = xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

> **Inbox only:** Shorts Studio sends videos to the creator's TikTok inbox as drafts (`video.upload` scope). Caption and privacy are chosen in the TikTok app when posting. Direct Post is not used.

---

## 6. Spotify Setup

**Estimated time: 5 minutes** — No user auth required, just app credentials.

### 6.1 Create a Spotify App
1. Go to **[developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)**
2. Click **Create App**
3. Fill in:
   - App name: `Shorts Studio`
   - App description: `Metadata fill for short-form video creation`
   - Redirect URIs: `http://localhost:3000` (required but unused for Client Credentials)
4. Check **Web API** → **Save**

### 6.2 Get Credentials
1. Click your app → **Settings**
2. Copy **Client ID** and **Client Secret** (click "View client secret")

### 6.3 Add to Vercel
```
SPOTIFY_CLIENT_ID     = xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SPOTIFY_CLIENT_SECRET = xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**What it enables:** In Step 1, a "Find on Spotify" panel lets you search any track and auto-fill the title, artist name, and download the album art as the cover image.

---

## 7. OpenAI / Whisper Setup

**Estimated time: 2 minutes**  
**Cost:** ~$0.006 per minute of audio (Whisper-1 model as of 2024)

### 7.1 Get an API Key
1. Go to **[platform.openai.com/api-keys](https://platform.openai.com/api-keys)**
2. Click **Create new secret key**
3. Name it `Shorts Studio` → **Create**
4. Copy the key immediately (shown only once)

### 7.2 Add to Vercel
```
OPENAI_API_KEY = sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Limits:**
- Max file size: **24 MB** per request
- For audio longer than ~25 minutes at standard bitrates, trim the audio before captioning
- Returns SRT format that's auto-imported into the caption track
- Rate limited to 10 requests/minute per user (signed-in session, otherwise IP); Spotify search is limited to 30/minute
- Free daily allowance: `WHISPER_DAILY_MINUTES` (default 60) of audio per user per UTC day; once used up the route returns `429` with code `whisper_daily_cap_reached`

---

## 8. Local Development

```bash
# 1. Clone and install
git clone https://github.com/carl-stem/youtube-shorts-studio.git
cd youtube-shorts-studio
npm install

# 2. Link to your Vercel project (to pull env vars)
npx vercel link
# → Select your team and project

# 3. Pull environment variables
npx vercel env pull .env.local
# Creates a .env.local file with all your production env vars

# 4. Start dev server
npm run dev
# → http://localhost:3000
```

> **OAuth in local dev:** Make sure `http://localhost:3000/api/auth/google/callback` and `http://localhost:3000/api/auth/tiktok/callback` are in your allowed redirect URIs (see steps 4.4 and 5.3).

**`.env.local` is gitignored** — never commit it. It contains secrets.

---

## 9. Deploying to Vercel

### Auto-deploy on push (recommended)
Every `git push` to `master` automatically triggers a Vercel deployment:
```bash
git add -A
git commit -m "your changes"
git push origin master
# → Vercel builds and deploys in ~30 seconds
```

### Manual deploy via CLI
```bash
npx vercel --prod
```

### After adding new env vars
Redeploy after adding environment variables so the new values take effect:
```bash
npx vercel --prod
```
Or trigger a redeploy from the Vercel Dashboard.

---

## 10. Feature Availability Matrix

| Feature | No Keys | Spotify | OpenAI | Google + KV | TikTok + KV |
|---------|:-------:|:-------:|:------:|:-----------:|:-----------:|
| Canvas preview (60fps) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Local export — MediaRecorder | ✅ | ✅ | ✅ | ✅ | ✅ |
| Fast export — WebCodecs (H.264) | planned¹ | planned | planned | planned | planned |
| Project save / load (.json) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Editable segments | ✅ | ✅ | ✅ | ✅ | ✅ |
| SRT subtitle upload | ✅ | ✅ | ✅ | ✅ | ✅ |
| Light / dark theme | ✅ | ✅ | ✅ | ✅ | ✅ |
| PWA install + shortcuts | ✅ | ✅ | ✅ | ✅ | ✅ |
| Spotify metadata fill | ❌ | ✅ | ✅ | ✅ | ✅ |
| Whisper auto-captions | ❌ | ❌ | ✅ | ✅ | ✅ |
| YouTube OAuth connect | ❌ | ❌ | ❌ | ✅ | ✅ |
| YouTube upload (resumable, pause/resume) | ❌ | ❌ | ❌ | ✅ | ✅ |
| Scheduled YouTube publish | ❌ | ❌ | ❌ | ✅ | ✅ |
| Custom YouTube thumbnail | ❌ | ❌ | ❌ | ✅² | ✅² |
| YouTube analytics dashboard | ❌ | ❌ | ❌ | ✅ | ✅ |
| TikTok OAuth connect | ❌ | ❌ | ❌ | ❌ | ✅ |
| TikTok inbox upload | ❌ | ❌ | ❌ | ❌ | ✅³ |

¹ Not wired up yet: all exports currently use MediaRecorder (real-time). Planned, see [docs/editor-plan.md](docs/editor-plan.md).

² YouTube only allows custom thumbnails on verified channels ([youtube.com/verify](https://www.youtube.com/verify)); otherwise the upload succeeds and the app says the thumbnail was not set.

³ Videos over 4 MB require the browser to send chunks directly to TikTok; see [Publishing: how uploads travel](#publishing-how-uploads-travel).

---

## Publishing: how uploads travel

Vercel functions accept request bodies of only ~4.5 MB, so video files are never sent to the app's server in one piece.

**YouTube.** `POST /api/upload/youtube/session` validates the metadata and creates a resumable upload session with Google (sending the app's `Origin`). The browser then `PUT`s 8 MiB chunks straight to the Google upload URL. If the browser blocks the first direct chunk (CORS), it switches to `PUT /api/upload/youtube/chunk`, which forwards 4 MiB chunks to that one session's upload URL and nothing else. After any network error the browser asks Google how many bytes it has and continues from there. An unfinished upload is remembered in the browser for up to a week: publish the same export again to resume. The progress bar says **"Sending straight to YouTube"** or **"Sending through Shorts Studio"** so you can tell which path was used.

**TikTok.** `POST /api/upload/tiktok/init` starts an inbox `FILE_UPLOAD` and returns TikTok's upload URL (valid for one hour). TikTok requires chunks of at least 5 MB, more than a Vercel function can receive, so the browser `PUT`s the chunks straight to `*.tiktokapis.com`. Only a whole video of 4 MB or less can fall back to `PUT /api/upload/tiktok/chunk` if the browser blocks the direct path; larger videos then show an error asking you to upload in the TikTok app.

Required production env vars are unchanged (KV, `TOKEN_ENC_KEY`, Google/TikTok OAuth). Upload routes are rate limited per session and, like Spotify/Whisper, return `503 rate_limit_unavailable` in production without KV.

---

## Architecture Notes

```
Shorts Studio (Next.js 14, App Router)
│
├── Client (browser)
│   ├── Canvas renderer    — 1080×1920 @60fps via requestAnimationFrame
│   ├── WebCodecs encoder  — Fast H.264 encoding (planned; not used yet)
│   ├── MediaRecorder      — Real-time recording (current export path)
│   └── Web Audio API      — Decoding, playback, FFT spectrum
│
└── Server (Vercel Edge/Node)
    ├── /api/auth/*        — OAuth initiation + callbacks
    ├── /api/upload/*      — Upload sessions (metadata only), small chunk relays, status, thumbnails
    ├── /api/analytics/*   — YouTube Analytics API
    ├── /api/spotify/*     — Spotify search proxy
    ├── /api/whisper       — OpenAI Whisper transcription
    └── Vercel KV          — OAuth token storage (AES-256-GCM encrypted)
```

---

*Questions? Open an issue at [github.com/carl-stem/youtube-shorts-studio](https://github.com/carl-stem/youtube-shorts-studio)*
