import { firebaseConfig } from '../firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore, collection, doc, getDoc, setDoc, deleteDoc, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

function clean(data) { return JSON.parse(JSON.stringify(data)); }

function refApi(ref) {
  return {
    id: ref.id,
    set: (d, merge) => (merge ? setDoc(ref, clean(d), { merge: true }) : setDoc(ref, clean(d))),
    delete: () => deleteDoc(ref)
  };
}

function adapt(fs) {
  return {
    collection: (name) => {
      const col = collection(fs, name);
      return {
        doc: (id) => refApi(id ? doc(col, id) : doc(col)),
        onSnapshot: (next, error) => onSnapshot(col, (snap) => next({
          docs: snap.docs.map((d) => ({ id: d.id, data: () => d.data() }))
        }), error)
      };
    }
  };
}

const cfg = firebaseConfig || {};
if (!cfg.apiKey || String(cfg.apiKey).startsWith('PASTE')) {
  window.TUMC.fail('Firebase is not set up yet. Check ../firebase-config.js.');
} else {
  const app = initializeApp(cfg);
  const auth = getAuth(app);
  const fs = getFirestore(app);
  window.TUMC.start({
    db: adapt(fs),
    signIn: () => signInWithPopup(auth, new GoogleAuthProvider()).catch((e) => window.TUMC.toast('Sign-in failed: ' + (e.message || e.code))),
    signOut: () => signOut(auth)
  });
  onAuthStateChanged(auth, async (user) => {
    if (!user) { window.TUMC.setUser(null); return; }
    const email = String(user.email || '').toLowerCase();
    let role = null;
    try {
      const snap = await getDoc(doc(fs, 'members', email));
      if (snap.exists()) role = snap.data().role;
    } catch (e) { /* not a member: rules refuse the read */ }
    window.TUMC.setUser({ email, role });
  });
}
