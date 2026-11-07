# studio.json: who the studio is for

The guided setup fills this in. Everything else about your brand (voice, offers, proof, the review standard) lives in
the brain (`../../BRAIN.md`). Change a value, then redeploy.

| Field | What it is | Example |
|---|---|---|
| `owner` | Your first name, all over the app ("Waiting for Alex") and in "Coach Alex" | `Alex` |
| `ownerFull` | Your full name, in the prompts, the post graphics and the podcast feed | `Alex Rivera` |
| `brand` | The app's name in the top bar and the browser tab | `Alex Rivera Studio` |
| `tagline` | The line under your name on the LinkedIn preview and the post graphics | `Coach for service founders` |
| `handle` | Your social handle, on previews and slides ("" for none) | `@alexrivera` |
| `website` | Your site | `https://example.com` |
| `audience` | A few words for who the content is for | `service business owners` |
| `idealClient` | One line on your ideal client | `service founders who are good at the work and struggle to win the right clients` |
| `offerIdea` | The idea at the heart of your main offer, for readers who don't know it yet | `one clear offer sells better than five` |
| `ideas` | Your named frameworks and methods (the brain has the detail) | `["The Two-Offer Rule"]` |
| `bookingOffer` | The bottom-of-funnel next step, in words | `a free 20-minute call` |
| `bookingUrl` | Where it's booked (`BOOKING_URL` in Vercel overrides it) | `https://example.com/book` |
| `shows` | Your shows; the first is the default for new episodes | `["Your Show"]` |
| `primaryNetwork` | Captions end on this network's next step: linkedin, instagram, tiktok, facebook, threads or youtube | `linkedin` |
| `timezone` | The time zone the calendar and the slots use; match your scheduler's | `America/New_York` |
| `timezoneLabel` | How times are labelled ("" makes "New York time" from the zone) | `` |
| `slots.hours` | The day's posting times (24-hour) | `[9, 12, 17]` |
| `slots.sundayHours` | The times on the full episode's day | `[12, 15, 18]` |
| `slots.episodeDay`, `slots.episodeHour` | The full episode's day (0 = Sunday) and hour | `0`, `9` |
| `slots.days` | The days each kind goes out (0 = Sunday) | `{"reel": [1, 3, 5]}` |
| `palette` | Colours: `primary` (boards, the top bar; harbor blue by default), `accent` (the key word, the owner's turn; yellow by default), `ink`, `paper`, `soft` | `"#1E4E6E"`, `"#FFC530"` |
| `fonts` | The heading and body fonts the engines name | `Libre Franklin`, `Poppins` |
| `model` | The Claude model (`CLAUDE_MODEL` overrides it) | `claude-opus-5-5` |

The post graphics show your headshot when you put a square photo at `app/assets/postcard/head.jpg` (or `head.png`).
