# Shorts Studio — Manual Video MVP Product Spec

> **Superseded for the new editor:** see [`docs/editor-plan.md`](./editor-plan.md) (approved 2026-10-21).

**Status:** Proposed · integrated build verification in progress
**Last updated:** 2026-10-19
**Audience:** Product, design, and engineering
**Product mode:** Manual editing; no agent is required to complete the workflow

> Verification note (2026-10-19): static production build, TypeScript check, and media-helper tests passed. Browser smoke verified the audio home, switch-confirmation modal, and video empty state. Browser console reports Next.js hydration errors on initial load and after switching modes; video upload/edit/render is therefore not end-to-end verified. Account publishing cannot be exercised without provider OAuth credentials and configured KV.

## 1. Product intent

Help someone with no video-editing experience turn footage they already have into a polished, vertical short they can download and share. The app should make the next action obvious, keep the edit understandable, and let the user inspect the finished video before it leaves their device or is published.

**MVP promise:** Import a video or a ZIP of media, choose a moment, make it fit a vertical frame, add a title and captions, preview the result, and export a ready-to-upload short.

The existing audio visualizer remains available as its own creation path. Video projects add source-footage editing without requiring users to switch to an agent workflow.

## 2. Current product baseline

The repository has a four-step audio workflow and a separate video workflow with local video import, ZIP review, trim/crop, title/caption overlays, and browser-side rendering/export. Project persistence for video source media and integrated review/publish are not complete. Publishing endpoints now use session-keyed provider tokens and upload ownership records; OAuth callbacks validate and atomically consume state and rotate the bearer session. TikTok delivery currently uses inbox mode only; YouTube upload and provider processing checks are implemented, but external-account journeys still require configured OAuth credentials and KV for verification.

This spec describes proposed behavior; existing features should not be represented as complete against these criteria until verified in the integrated workflow.

## 3. Goals and non-goals

### Goals

- A novice can make a first usable vertical short without knowing editing terminology.
- Users can import individual media files or a ZIP and see what will be used before editing.
- Users can select and adjust a source-video range, frame it for portrait viewing, and add readable titles/captions.
- Preview and exported output are consistent, with clear progress and actionable errors.
- Export works without connecting a social account or configuring an AI service.
- Publishing, when enabled, requires an explicit final review and user action.

### Not in the manual MVP

- Agent planning, “Full Auto,” prompt/question flows, or automatic creative decisions.
- Text-to-video, generative footage, stock-media search, or a music catalog.
- A multi-track nonlinear editor, scene transitions, keyframes, or advanced color grading.
- Silent background publishing, scheduled publishing, or automatic public privacy selection.
- Cloud project sync, team collaboration, or cross-device media storage.
- A promise that a ZIP can contain arbitrary file types or unlimited data.

## 4. Priority and release sequence

**P0 — Core manual creation (MVP release candidate)**
1. Start a video project while retaining the existing audio workflow.
2. Import individual videos and ZIP archives; inspect the archive before importing.
3. Preview, select/trim a range, and adjust a vertical crop.
4. Add/edit a title and captions; preview them in context.
5. Render, download, and re-download a playable vertical video; report errors honestly.

**P1 — Make projects forgiving and first-time friendly**
1. Save and reopen a project with its source media, or a clear media-relink flow if the project format does not embed media.
2. Optional automatic captions for video audio when transcription is configured; preserve the edit if transcription fails.
3. Onboarding/sample project, undo/reset for common edits, and usability improvements informed by novice testing.

**P2 — Platform publishing (separate, gated workstream)**
1. Finish account connection and publishing UI integration; scope credentials to the correct user and validate OAuth state before launch.
2. Implement provider-specific file validation, transfer progress/retry, processing status, and truthful final states.
3. Require a final preview and explicit publish confirmation. Do not imply that “uploaded” means “published.”

P2 can ship later than the local-export MVP. If publishing is included in a release, its account-isolation and provider-approval gates are launch blockers, not optional polish. Current status: implemented partially and not release verified. TikTok Direct Post is intentionally not enabled; inbox delivery is used. YouTube `processingDetails.processingStatus === succeeded` is reported as processing complete, not publication. TikTok status is checked against the creator-specific request. No statement here asserts provider approval, cross-account isolation proof, or public visibility.

## 5. Core user journey

1. Choose **Create from video** (the manual path remains the default; no agent toggle is needed).
2. Select video files or a ZIP. For a ZIP, inspect the detected media list and choose what to import.
3. Select a video, preview it, and choose the in/out points for a short.
4. Reposition/scale the source inside a 9:16 canvas; choose a simple fit/fill behavior.
5. Add a title and captions, or import an SRT/VTT caption file. See all overlays in the preview.
6. Preview the whole selected range, make corrections, and render.
7. Download the resulting MP4 and optionally proceed to an explicitly confirmed publishing flow when available.

The UI should use plain-language labels such as “Choose the moment” and “Move video in frame”; advanced numeric time/crop controls can remain available as secondary controls.

## 6. User stories and acceptance criteria

### P0 — Start and import

#### MV-01 — Start a manual video project
**As a** first-time user, **I want** a clearly labeled video creation path, **so that** I can begin without learning the existing audio workflow.

Acceptance criteria:
- The user can choose video creation without losing access to the existing audio visualizer workflow.
- The video workflow identifies its steps and the current step, and provides clear back/continue navigation.
- The user can reach a useful empty state before selecting files; it explains which file types are supported and what to do next.
- No agent, external account, API key, or publishing connection is required to create and export a video.

#### MV-02 — Import one or more video files
**As a** user with footage on my device, **I want** to select videos and see which ones are usable, **so that** I can work with my own material.

Acceptance criteria:
- The user can select multiple files in one import action and can add more files later in the same project.
- Each item shows its filename, media type, duration when readable, and an import/unsupported/error state.
- The initial supported input profile is documented in the UI and verified on the target browsers before release. Unsupported codecs show an actionable message; they do not silently create a blank preview.
- A rejected file does not prevent other valid selected files from being imported.
- The user can remove an imported file without clearing other project state.
- Importing local media does not upload it to a server as a side effect.

#### MV-03 — Import a ZIP safely
**As a** user whose footage is organized in a folder, **I want** to choose a ZIP and inspect its contents, **so that** I do not have to extract and select files one by one.

Acceptance criteria:
- The app lists supported media found in the archive before adding it to the project; the user confirms which files to import.
- Archive paths are displayed as relative paths and normalized. Entries that escape the archive root, are symlinks, malformed, encrypted/unsupported, or exceed configured limits are rejected with a reason.
- The importer enforces configured compressed-size, expanded-size, entry-count, and per-file limits before fully extracting content. The numeric limits are agreed and documented before implementation.
- Non-media files are ignored or listed as unsupported; they are never executed or rendered as active content.
- An invalid archive fails safely and leaves already-imported project media and edits intact.

### P0 — Edit and preview

#### MV-04 — Find and trim a moment
**As a** non-editor, **I want** to preview footage and select the part I want, **so that** I can make a short without complex timeline tools.

Acceptance criteria:
- The user can play, pause, seek, and scrub the selected source video.
- The user can set and adjust in/out points using a simple range/timeline control and can preview the selected range from its beginning.
- In-point is earlier than out-point; the range stays within source duration; invalid edits are prevented or explained.
- A project can contain multiple output clips sourced from imported videos. Each output clip has one continuous source range in P0; combining separate ranges into a multi-scene timeline is not required.
- The interface displays selected clip duration and validates the chosen range against the current export profile.

#### MV-05 — Frame footage vertically
**As a** user making a portrait short, **I want** to position and scale landscape or portrait footage, **so that** the important subject is visible in the vertical output.

Acceptance criteria:
- The preview uses the same 9:16 composition as the export.
- The user can choose fit (no crop) or fill (cover the frame); fill exposes simple drag/reposition and zoom controls.
- Crop/position changes are visible immediately and are preserved for the selected output clip.
- The app never stretches footage non-uniformly. Empty areas under fit use a defined background treatment.
- Reset returns the framing to the documented default.

#### MV-06 — Add a title and captions
**As a** user who wants the video to be understandable without sound, **I want** to add readable text, **so that** viewers can follow the short.

Acceptance criteria:
- The user can add/edit a title and choose from a small set of legible presets; overlay positions remain inside the portrait safe area.
- The user can import SRT or VTT captions and see timed captions in the preview.
- The user can correct caption text and timing for the selected clip. Caption timing is based on the source range and is correct after trimming.
- If a caption file has malformed entries, valid cues are retained and the user is told which entries could not be read.
- Caption/title contrast and text wrapping remain readable at the rendered 1080×1920 size; text does not silently overflow outside the frame.

#### MV-07 — Review the finished short
**As a** user, **I want** to preview the exact edit before rendering or publishing, **so that** I can catch mistakes.

Acceptance criteria:
- The review preview shows the selected source range, crop, title, and captions together.
- The user can return to editing from review without losing settings.
- If a destination platform is selected, the review step shows destination-specific duration/format warnings before an upload is initiated.
- Publishing is never triggered by preview, render, or a saved preference alone.

### P0 — Render and export

#### MV-08 — Export a playable vertical short
**As a** user, **I want** a standard video file I can download, **so that** I can share it even if I do not connect an account.

Acceptance criteria:
- The initial output profile is 1080×1920, 9:16, 30 fps, MP4 with H.264 video and AAC audio when supported by the chosen export implementation. Any fallback format is clearly labeled before export.
- Rendered duration matches the selected range within 0.5 seconds; audio/video synchronization drift is no more than 100 ms in the release test asset.
- The export plays in the app’s supported playback browsers and imports into a platform’s upload flow without requiring a manual re-encode.
- The user sees progress, can cancel, and receives a clear success or actionable failure state. Cancelled/failed output is not presented as complete.
- A completed export appears with filename, size, and a re-download action. A user can export another clip without reloading the app.
- Rendering failure, unsupported codec, insufficient memory, or lost source media does not silently yield a zero-byte or misleadingly named successful file.

#### MV-09 — Work within explicit resource limits
**As a** user, **I want** limits to be explained before a long import/render, **so that** I can choose an appropriate file and avoid losing work.

Acceptance criteria:
- Product and engineering agree source duration, file-size, archive-size, expanded-size, and simultaneous-asset limits based on tests on supported devices before release.
- Files beyond those limits are rejected before expensive decode/render work and the UI states the limit and a practical next step.
- A representative test matrix covers a short portrait MP4, a landscape MP4, a longer source with a short selected range, a ZIP with valid and invalid entries, and an unsupported/corrupt file.
- The app remains responsive enough to cancel a long operation; no performance claim is made without measured results on the agreed test devices.

### P1 — Project continuity and assisted convenience

#### MV-10 — Save and reopen the video project
**As a** user, **I want** to resume an edit later, **so that** a page refresh or new session does not force me to start over.

Acceptance criteria:
- The saved project restores clip ranges, crop, title, captions, and selected export settings.
- The project format either contains the referenced source assets or detects missing assets and provides an explicit relink flow; filenames alone are not treated as restored media.
- A malformed or unsupported project file is rejected with a useful message and does not overwrite the current project.
- Save/load compatibility is versioned and tested with at least one prior-format fixture before format changes ship.

#### MV-11 — Generate captions from video audio (optional service)
**As a** user without a transcript, **I want** draft captions generated from my video’s audio, **so that** I can publish accessible content with less typing.

Acceptance criteria:
- The feature is clearly marked optional and unavailable when transcription is not configured; export remains usable without it.
- Transcription uses only the selected clip/source audio and reports applicable limits before upload to the transcription service.
- Generated captions are presented as editable drafts; they are never treated as verified or published automatically.
- A timeout, service error, or rejected file preserves the video project and any captions already edited.
- The user is told when audio is sent to a configured external transcription service.

### P2 — Publish after review

#### MV-12 — Connect a destination account safely
**As a** creator, **I want** to connect my own platform account, **so that** I can upload without handing the app my password.

Acceptance criteria:
- Each signed-in user can only read, refresh, publish with, and disconnect their own provider credentials.
- OAuth callbacks validate one-time state and reject missing, mismatched, expired, or reused state.
- Credentials are stored server-side and never returned to the browser or written to logs.
- Connect/disconnect status is displayed in the workflow; an absent provider connection does not block local export.

#### MV-13 — Upload and track status
**As a** creator, **I want** to upload a reviewed short and know what happened, **so that** I can trust the result.

Acceptance criteria:
- The user sees the final rendered file and destination metadata, selects any required privacy/settings, and explicitly confirms before upload begins.
- The UI distinguishes at least: ready, transferring, uploaded/processing, published or awaiting user action, and failed.
- Transfer progress is reported where supported. Retry/resume behavior is provider-specific and does not restart an upload without explaining the consequence.
- Provider rejection includes a useful error and preserves the local export for manual upload.
- TikTok privacy choices are fetched from the creator’s available options and selected by the user; no public privacy choice is preselected. Upload-to-inbox is described as requiring the user to finish in TikTok. Direct Post is only enabled after applicable TikTok review/audit approval.
- YouTube short validation uses the selected destination’s current requirements. The current standard-channel Shorts definition is square or vertical and up to three minutes; provider restrictions and account/channel exceptions are checked rather than assumed.
- A platform API response that only acknowledges submission is never shown as “Published.”

## 7. Quality and release gates

- **Functional:** complete every P0 story in the supported browser/device matrix; retain the current audio workflow. Current status: partial. Audio home and video empty-state/mode-switch interaction render in a browser. Hydration warnings/errors remain; import-through-render/export and supported-browser matrix remain unverified.
- **Novice usability:** in a moderated test with five first-time users who do not identify as video editors, at least four complete import → trim → crop → title/caption → preview → export without facilitator intervention. Target median time to first export: five minutes or less, measured from entering the video workflow with a prepared sample asset.
- **Output quality:** validate resolution, aspect ratio, codec, frame rate, duration, audio presence/sync, crop, and caption timing on exported files—not just the in-app preview.
- **Failure safety:** test corrupt media, unsupported codec, invalid ZIP paths, limit violations, cancellation, and render failure; none may destroy previously imported media or claim a successful export.
- **Privacy:** no media leaves the browser during manual import/render/export. Any future transcription or publishing transfer is disclosed at the point of use.
- **Publishing release gate:** multi-user account isolation, OAuth-state validation, and provider-required UX/review must be verified before enabling connected-account publishing for general users.

## 8. Decisions required before implementation

1. **Supported source codecs/containers:** select the exact initial input profile after testing browser decoders (recommended first target: MP4/H.264 with AAC; MOV support only where verified).
2. **Input and archive limits:** set numeric source-file, total-project, compressed ZIP, expanded ZIP, entry-count, and source-duration limits after a browser memory/performance spike.
3. **Project portability:** choose between a bundle containing media and a versioned manifest with a relink flow; do not ship settings-only save as video-project save.
4. **Export fallback:** decide whether unsupported H.264 export blocks video export with a clear recommendation or permits a clearly labeled WebM fallback.
5. **Video audio behavior:** decide whether P0 retains source audio only, offers mute, or supports an additional soundtrack. Do not add a music library without separate rights/product review.
6. **Publishing release boundary:** decide which platforms are in the first publishing release; TikTok Direct Post approval/audit may determine the schedule. Keep local export useful independently.

## 9. External platform references for the publishing workstream

- [YouTube Shorts eligibility](https://support.google.com/youtube/answer/15424877?hl=en)
- [TikTok Content Sharing Guidelines](https://developers.tiktok.com/docs/en/content-sharing-guidelines)
- [TikTok media transfer guide](https://developers.tiktok.com/docs/en/content-posting-api-media-transfer-guide)
