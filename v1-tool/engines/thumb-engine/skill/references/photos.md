# The owner's photos

The thumbnails use the owner's own photos from the brain's photo library, never a generated person. The studio's
`thumb_pick` tool returns them as pairs (one photo, ready for a look) and the app passes each look's pair to the engine
exactly as received:

```json
{"id": "<asset uuid>", "pair_id": "<asset uuid>", "cutout": "<photo name>", "background_id": "brand",
 "background_label": "Brand background", "side": "R", "hook_types": ["smirk", "verdict"], "frame": null,
 "storage_prefix": "",
 "urls": {"photo": "<signed full photo>", "preview": "<signed preview or null>", "person": "<signed cutout PNG or null>",
          "mask": "<signed person mask PNG or null>", "plate": null, "alpha": null, "pair": null}}
```

- `side`: where the person sits in the frame, R (default) or L. Pick it from the way the person faces: into the frame.
- `hook_types`: the expressions the photo plays (`skeptic`, `verdict`, `warning`, `number`, `secret`, `smirk`, `how`).
- `urls.person`: a transparent PNG of the person (best). Else `urls.mask`: a person mask the same shape as the photo
  (white or opaque = person). Else the engine makes the cutout itself with rembg (`u2net_human_seg` on the CPU); only
  the mask comes from the model, every colour pixel is the photo's own.
- `urls.plate`: optional, a brand background image for the call and the wall. Without it the backdrop is drawn from
  the palette.
- `face_box`: optional, `[x0, y0, x1, y1]` in the photo's own pixels. The engine finds the face with YuNet (OpenCV);
  this is the fallback when it finds none.

## What makes a photo work

- One person, the face sharp, both eyes visible, looking at the lens or into the frame. Yaw within about 20 deg.
- The face big in the photo: 240 px or more from crown to chin (under 120 px the photo can't play; under 240 the
  thumbnail may look soft, and the log says so).
- Head and shoulders at least, with room above the hair. A crop through the top of the head breaks the board's print.
- A clear expression that matches its hook types. Plain backgrounds cut out cleanest.
- A real photo of the owner, taken on purpose for thumbnails. Never edited inside the face.

## What each look needs

| Look | Needs |
|---|---|
| call | a cutout, the person on the right (side R), and a guest frame from the episode |
| wall | a cutout (the head is scaled to 430 px in front of a giant number) |
| board | any photo with a clear face; without a cutout the plain photo fills the print |
