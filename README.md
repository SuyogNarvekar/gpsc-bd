# GPSC BD Pipeline

Kanban CRM for K&P government opportunities, from Radar to Won or Lost. Static site on GitHub Pages, data in Firebase (Firestore), sign-in with Google.

## Files
- `index.html`, `app.js`: the board (no data inside).
- `backend.js`: Google sign-in and Firestore connection.
- `firebase-config.js`: your Firebase web config (you fill this in).
- `firestore.rules`: who can read and write.

## Setup (about 20 minutes)

### 1. Firebase project
1. Go to console.firebase.google.com and create a project (free Spark plan is enough). Skip Analytics.
2. **Build > Authentication > Get started > Sign-in method > Google > Enable.** Use a support email.
3. **Build > Firestore Database > Create database.** Region `asia-south1 (Mumbai)`. Start in production mode.
4. **Firestore > Rules.** Replace the contents with `firestore.rules` from this folder and Publish.
5. **Project settings > General > Your apps > Web app (</>).** Register an app, copy the config values into `firebase-config.js`.

### 2. First admin (you)
In Firestore, **Start collection** `members`. Document ID: your email in lower case (for example `narvekar.suyog@gmail.com`). Add one field: `role` (string) = `admin`.

### 3. GitHub Pages
1. Create a repository and upload these files (not the seed file).
2. **Settings > Pages > Deploy from a branch > main / root.** Note the site address, `https://<username>.github.io/<repo>/`.
3. Back in Firebase, **Authentication > Settings > Authorized domains > Add domain:** `<username>.github.io`.

### 4. First load
Open the site, sign in, then use **Import** and choose `gpsc-seed.json` (kept outside the repo). It loads 18 test opportunities marked **Verify**.

### 5. Add the team
Add one `members` document per person, document ID = their Google email in lower case:
- `role: viewer` can see everything, cannot change anything (Mangesh).
- `role: editor` can add and edit opportunities (KGS teammates).
- `role: admin` can also delete, import, export and edit the access list.

Everyone needs an email that signs in with Google (Gmail or a Google Workspace account).

## Notes
- The Firebase web config is not a secret. The data is protected by sign-in and `firestore.rules`.
- A public GitHub repository or Pages site shows the code only. Keep real data out of the repository, including the seed file.
- **Export** (admin) downloads all opportunities as JSON. Take one now and then as a backup.
