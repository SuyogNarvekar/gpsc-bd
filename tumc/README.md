# TUMC Manpower Requirement Tracker

One page that shows what TUMC has asked for (how many people, how much experience, what experience), with one row per position to tick off, name the candidate and set the date of joining. No commercials anywhere in the tracker.

It lives inside the existing `gpsc-bd` repo as the `tumc/` folder and reuses the same Firebase project and sign-in. Site address: `https://suyognarvekar.github.io/gpsc-bd/tumc/`

## Who can do what
- Anyone with the link: view, download CSV, print. No sign-in.
- K&P `editor` or `admin` (same `members` list as the GPSC board): sign in with Google, then tick, enter names, dates and remarks, add or edit requirement lines.
- `admin` only: delete a requirement line, backup JSON, import JSON.

## Files
- `index.html`, `app.js`: the page.
- `backend.js`: Firebase connection (uses `../firebase-config.js`, the file already in the repo root).
- `data.js`: the 18 initial requirement lines (40 positions). Requirements only, no names.
- `../firestore.rules`: the existing rules plus read and write rules for the two new collections.

## Using it
- **Filled** tick: needs a candidate name first. Ticking sets the status to Offer accepted, unticking sets it back to Offer shared.
- **Status** runs Open, Profile shared, Selected by TUMC, Offer shared, Offer accepted, Joined. Filled means Offer accepted or Joined.
- **Date of joining** has a Tentative tick. An accepted offer whose date has passed shows "Date passed, confirm joining".
- Clearing a candidate name sends the position back to Open (use this when someone backs out, and note it in Remarks).
- **Edit** on a requirement line changes the numbers, experience, qualification, job description, source and received date. **Add requirement** starts a new line, in an existing or new batch.
- **Joining schedule** at the top lists every dated joining in order.
- **Backup JSON** (admin) now and then. **Download CSV** is open to everyone.

## First load (admin)
Sign in, click **Load initial requirements**, then **Import JSON** and choose the status file kept outside the repo.

## Notes
- Candidate names are readable by anyone who has the link or finds the Firebase project. Names are stored in Firestore only, never in the repo.
- The page asks search engines not to index it, which is not access control.
