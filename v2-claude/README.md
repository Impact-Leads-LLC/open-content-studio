# Version 2: the studio inside Claude

A content studio that lives entirely inside Claude, with no separate app. Drop an episode video, a clip or a
transcript into Claude and it:

1. finds the moments worth making, the way a good editor would: reels scored and held to a bar, and two carousels and
   two posts for each of the five awareness levels (from people who don't know they have the problem to people ready
   to buy), built out from your own teaching material;
2. writes every post and caption in your voice, with a line asking people to save it and one next step;
3. builds the carousels, the post graphics and the covers in your colours and fonts, and cuts the reels with captions;
4. reviews every piece against your own standard, with a truth test on every number and quote;
5. shows it all on one review board, and writes a posting calendar in your rhythm and time zone for your scheduler.

You review the board, tell Claude what to change in plain words, and import the calendar. Nothing is ever posted for
you.

## What you need

| | Why | Mac | Windows |
|---|---|---|---|
| The Claude desktop app, on a paid plan | Runs everything, in Cowork or the Code tab. Max is worth it for video-heavy weeks. | claude.ai/download | claude.ai/download |
| Node.js 20 or newer | Runs the studio's scripts | `brew install node` | `winget install OpenJS.NodeJS.LTS` |
| ffmpeg | Cuts reels, burns captions, grabs stills | `brew install ffmpeg` | `winget install Gyan.FFmpeg` |
| A headless browser | Turns slides and graphics into images. Google Chrome or Edge already counts. | `npx hyperframes@0.8.143 browser ensure` | `npx hyperframes@0.8.143 browser ensure` |
| whisper.cpp (optional) | Transcribes on your computer when you have no transcript | `brew install whisper-cpp` | download `whisper-bin-x64.zip` from github.com/ggml-org/whisper.cpp/releases and put `whisper-cli.exe` on your PATH |
| A whisper model (with whisper.cpp) | About 470 MB, once | `mkdir -p ~/.cache/whisper && curl -L -o ~/.cache/whisper/ggml-small.en.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin` | `mkdir $HOME\.cache\whisper; curl.exe -L -o $HOME\.cache\whisper\ggml-small.en.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin` |
| A fal.ai key (optional) | Generated cover pictures when a carousel has no video still, about 4 cents each | `security add-generic-password -a "$USER" -s studio-fal-key -w` (it asks for the key) | set `FAL_KEY` in your user environment variables |

No Homebrew on the Mac yet? Install it from brew.sh first. After installing, ask Claude to "run the studio doctor":
it checks everything and names the fix for anything missing.

## Install

1. **Add the plugin.** The repository is public, so there's nothing to sign in to or ask for.
   - **Code tab:** type `/plugin marketplace add Impact-Leads-LLC/open-content-studio`, then
     `/plugin install studio@open-content-studio`, and start a new session. (Working from a downloaded copy instead?
     `/plugin marketplace add <the folder>/open-content-studio/v2-claude` does the same.)
   - **Cowork:** download `studio.zip` from the repository's latest release (or zip the `v2-claude/plugins/studio`
     folder), then in the desktop app's plugin settings choose Add, then Upload plugin, and pick the zip.
2. **Make your first content.** Open the folder you'll work in (Cowork: choose it for the task; Code tab: open it as
   the project) and say **"quick start"**. Five questions (or your website and a few of your posts to read), then one
   topic you teach becomes a story carousel, two posts with their graphics and five hooks, reviewed, on one board.
   About 20 minutes. `plugins/studio/examples/previews/quickstart-carousel.jpg` and `quickstart-cards.jpg` show what
   it made for a sample hiring coach from five answers and two topic questions.
3. **Set up your studio** when you have half an hour: say **"set up my studio"**. It reads what the quick start wrote
   and anything you give it (your website, brand guide, documents, notes), then asks only what's missing, including
   your tools, preferences and spend. Give it as much material as you can: your second brain if you have a connector
   for it, or course and training transcripts, podcast transcripts, past posts and emails, testimonials, offer docs,
   photos and your logo. It writes a `studio/` folder with your brand files, your playbooks and your material library.

Updating: `/plugin marketplace update open-content-studio` (Code tab), or upload the new zip (Cowork).

## Your playbooks

`studio/playbooks/` holds the craft the studio follows, in plain words: content strategy (the five awareness levels and
what each piece asks for), design (your colours, type, the one-accent rule, pictures, and what makes graphics look
AI-made), hooks, posts, carousels and reels. Change any of them, or tell Claude ("six reading slides at most",
"captions in capitals"). Your copies win over the plugin's defaults, and updates never touch them. Say **"show me my
look"** to see your post card in both looks after a change.

## How a run goes

1. Drop in a video, a clip or a transcript (Riverside, Descript, YouTube captions, .srt, .vtt or plain text), and say
   **"run the studio"**. Or with no file: "make content from my library about pricing".
2. Claude transcribes if it needs to, then shows the plan: every piece it found, by format and awareness level, what
   came up short and why. Say go, or change the plan first.
3. It writes, builds and reviews everything. A full episode is a big job (5 to 8 reels, 10 carousels, 10 posts), so
   give it time; a light mix is half that.
4. It shows the **review board**: every piece with its slides, graphic or reel frames, its words, the coach's verdict
   and fixes, and a "Say to Claude" box. The board can't change anything by itself. Copy a line from the box (or write
   your own) and paste it into the chat: `approve r01 c02`, `p03: shorter, and lead with the 60 days`,
   `c02: use fixes 1 to 3`, `drop p07`, `approve everything that's ready`. Claude makes the change, checks it again
   and rebuilds the board.
5. It writes `calendar.csv` in the episode folder: every approved and ready piece in your next open slots, in your
   time zone, one row per network with the caption fitted to that network. With your scheduler's CSV template saved in
   setup it fills that too, and it can make a folder per slot with the files and the text. Import it into
   ContentStudio, Metricool or Buffer, or post from the folders by hand. Most schedulers need the images and videos
   attached in the scheduler itself, since a CSV can only carry links.
6. Tell Claude what went out ("posted r01 and c02 today"). Seven days after posting, the heavy files (videos, slides,
   graphics) are cleared and the words stay; an episode's raw footage copied into the studio goes once every piece
   from it is posted or dropped. Nothing unposted is ever touched, and Claude shows the list and asks before clearing
   anything. You can change the 7 days, or move the files to an archive folder instead, in setup.

## Cowork or the Code tab

| | Code tab | Cowork |
|---|---|---|
| Transcripts in, moments, posts, captions, reviews | Yes | Yes |
| Carousels, post graphics, covers, the review board, the calendar | Yes | Yes, with the browser Cowork's sandbox ships |
| Transcribing a video | Yes (whisper.cpp) | Usually not: bring the transcript |
| Cutting reels | Yes (ffmpeg) | Not recommended: Cowork's sandbox can't see the ffmpeg on your computer, and long footage is slow there |
| Generated cover pictures (fal) | Yes | No |

Cowork runs Claude's commands in a sandbox that sees only the folder you chose, not the apps on your computer. So run
episodes with video in the **Code tab**, and use either one to review the board and send changes. A transcript-only
run works end to end in Cowork.

## Credits

Adapted from the content studio Mike Moll runs for his own business, shared free under the MIT License. The humanizer
guide is by Siqi Chen (MIT). Fonts: Libre Franklin and Poppins (SIL Open Font License). The full list is in
`THIRD-PARTY-NOTICES.md` at the top of the repository.
