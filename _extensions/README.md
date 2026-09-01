# Follio Chrome extension (MVP)

**Goal:** A Dropbox-style resume library plus “score my resumes against this job posting.”

**Icon:** Follio short mark (`public/logo/follio-mark.png`) → `_extensions/chrome/icons/`.

## What it does

1. **Resume library** — list your Follio resumes; **View PDF** / **Download** / open Follio.
2. **JD match** — on a job page, click **Score resumes**. The extension reads the page’s job description and scores **every** resume (Strong / Good / Fair / Weak) with matched skills and gaps.

Not in this MVP: autofill, application tracking, Safari.

## Load unpacked (Chrome)

1. Run the Follio app locally (`npm run dev`) and **sign in** at `http://localhost:3000`.
2. Open `chrome://extensions` → enable **Developer mode** → **Load unpacked**.
3. Select `_extensions/chrome`.
4. Open extension **Settings** and confirm API base is `http://localhost:3000` (or your deploy URL).
5. Open a job posting → click the extension → **Score resumes**.

## APIs (this repo)

| Method | Path                      | Purpose                                                       |
| ------ | ------------------------- | ------------------------------------------------------------- |
| `GET`  | `/api/extension/resumes`  | Resume library + PDF URLs                                     |
| `POST` | `/api/extension/match-jd` | Body: `{ jobDescription, pageUrl? }` → scores for all resumes |

Auth uses your existing **Clerk session cookies**. Stay signed in to Follio in the same browser profile.

## Shared scoring

Server logic lives in `lib/jd-match/` (deterministic, explainable overlap — not a blind keyword dump).
