# Art direction: words, look, photo, guest frame, feed review

## The words

The thumbnail says the episode's biggest takeaway: the best advice in it, the thing the host spent the most words
teaching, the thing a viewer would come away using. A side tactic or a fun aside never gets the thumbnail, however
good its number is: a memorable number about a side trick belongs to its own short video. The words add to the title
and never repeat a content word from it.

## Which look

The app rotates the three looks across episodes (the look the owner published least lately goes first). Within an
episode, the words decide what can play:

- **The call** when the episode has a guest whose frame shows the problem (a gesture or an expression at the line the
  hook comes from). Its support line names the problem on the tag; its hero is the fix.
- **The wall** when the takeaway has a number worth seeing big (one to five characters). A round number from the
  speaker ("six or seven") is flagged `rounded-figure`.
- **The board** for any words that fit it: a number hero, or a short word hero over a support line.

`thumb.py looks <spec>` reports per option which looks play and why the others don't.

## Hook type and photo

hook-maker names a hook type (`skeptic`, `verdict`, `warning`, `number`, `secret`, `smirk`, `how`): the expression the
words need. `thumb_pick` returns only the owner's photos tagged with that type, and the app passes the types that have
a photo today (`playable`), so hook-maker writes only to those. A hook that needs an expression no photo has (a wince,
a palm out, pointing) is rerouted to a playable type, or held until the owner adds a photo.

## Sides

A photo's side is where the person sits in the frame: R (right, the default) or L (left). Pick the side from the way
the person faces: they should look into the frame, toward the words. The call plays only on side R (its hero would
otherwise sit in the badge corner). The wall and the board mirror their layout for either side (the layout, never
the person).

## The guest frame

From the guest's own camera track, at the moment the hook comes from. Check `guest-candidates.jpg`: the picked frame
must show the gesture or expression the words are about, the face sharp and unblocked. Never a still the guest didn't
make on the call; never a generated face.

## Feed review (before delivery)

- Cover the words: does the expression, or the guest's gesture, carry the hook?
- Read it at 168 px in the feed sheet, dark and light.
- It is not the darkest tile in dark mode.
- Truth test: the words promise only what the video pays off, and they are the biggest takeaway.
