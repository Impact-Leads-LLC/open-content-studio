# Cowork or the Code tab: what runs where

The Claude desktop app has two places this studio can run. They differ in where Claude's commands run, which decides
what can be done with video.

## The Code tab (Claude Code in the desktop app): everything

Commands run on the member's own computer, with the tools the README installs: ffmpeg, Node, Chrome (or the headless
Chrome from `npx hyperframes@0.8.143 browser ensure`), whisper.cpp, and a `FAL_KEY` kept in the Keychain. Everything
in the studio works here: transcribing a video, cutting reels with captions, carousels, post cards, covers,
generated cover pictures, the review board, the calendar and clearing. Long episodes are fine. The board can be
published as an artifact or opened in the browser. **Run full episodes here.**

## Cowork: the words, the slides and the board; video belongs in the Code tab

In Cowork, Claude's commands run in a sandbox on the member's computer that sees only the folder chosen for the task.
It does not see the apps installed on the Mac or PC, so the member's ffmpeg, Chrome and whisper.cpp are not there,
and downloads from most of the internet are blocked (package registries usually work).

| Job | In Cowork |
|---|---|
| Reading transcripts, finding the moments, writing posts and captions, reviews | Works. |
| Carousels, post cards, covers, the board | Works when the sandbox has a headless Chromium (it usually ships one at `/opt/pw-browsers`; `doctor.mjs` finds it). |
| The calendar, clearing, the library | Works (Node only). |
| Showing the board | As an artifact or a file preview. The in-app browser can't open files Claude made in the sandbox. |
| Transcribing a video | Usually not: whisper.cpp isn't in the sandbox and its model download is blocked. Bring the transcript from Riverside, Descript, YouTube or your editor, or transcribe in the Code tab. |
| Cutting reels | Not recommended. ffmpeg isn't in the sandbox by default; a copy from the npm registry may work (`npm install @ffmpeg-installer/ffmpeg`, then `FFMPEG_PATH` pointing at its binary, and `doctor.mjs` to check it can burn captions), but the sandbox is slower than the computer and long footage can run out of time or memory. Cut reels in the Code tab. |
| Stills from a video for covers | Only if ffmpeg works there (same as above). Otherwise the cover sets the hook larger. |
| Generated cover pictures (fal) | No: the key isn't in the sandbox and the call is usually blocked. |

A good split: run the episode in the Code tab, then use either place to review the board and send changes. A
transcript-only run (no video) works end to end in Cowork.
