# B-roll for carousels

The best images are already in the material: the episode itself, the guest's site, the host's
own photo library (the brain's photo tools). Use them when they tell the story better than text alone.

## Episode stills

Most recording tools give each person a separate track (usually 1920x1080). Work from those,
not from an edited export.

```bash
S=<skill>/scripts
python3 $S/stills.py info  guest.mp4                      # 1920x1080, 24/1 fps, 33.3 min
python3 $S/stills.py scan  guest.mp4 "0:42,20:12,32:40" work/scan.jpg --crop 700:700:590:40
python3 $S/stills.py frame guest.mp4 32:40 assets/guest-portrait.jpg --crop 1080:760:420:30
```

- **Scan first.** Grab four to eight moments and pick the best expression: eyes open, looking
  at the camera, mid-smile or mid-sentence. Laughs and answers to light questions make the best
  faces.
- **Native resolution, always.** `frame` crops without scaling and prints the largest box the
  still can fill. A 1080x760 crop fills the full slide width; a 540x620 crop fills half. A
  bigger box than the crop means a soft, upscaled face: cut a bigger crop or use it smaller.
- **Quote frames:** find the line in the transcript, take its timestamp, grab that second.

## Host and guest side by side

Cut two crops the same size, one from each track at nearby moments, and use them as the two
halves of `.split` (or join them with `stills.py side left.jpg right.jpg out.jpg`). Label each
with a `.tag`: "<host name> · host", "<guest name> · guest".

## The guest's site, or a page they mention

```bash
python3 $S/stills.py site https://example.com assets/site.png --size 1440x900
```

Show it small in a `.browser` frame. It proves who the guest is; it isn't meant to be read.

## The host's photos

`photo_pick` (the brain, format "cover" or "thumbnail") returns the host's own photos with signed
links; use `full_url`. Log what you used with `photo_use`. Never generate or alter a person.

## What we never use

- Stock photos or AI-generated people.
- A guest's headshot or logo downloaded from their site without the host's go-ahead. Ask the
  host, or ask the guest for the image they'd like used.
- Images of people who weren't part of the conversation.
- Real app branding (Gmail, Instagram) on a mockup.
