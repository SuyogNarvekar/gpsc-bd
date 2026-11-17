import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore, collection, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const gate = document.getElementById('gate');
const msg = document.getElementById('gate-msg');
const btnIn = document.getElementById('gate-btn');
const btnOther = document.getElementById('gate-out');

function showGate(text, opts) {
  opts = opts || {};
  gate.hidden = false;
  msg.textContent = text;
  btnIn.hidden = opts.signIn === false;
  btnOther.hidden = !opts.switchAccount;
}

function clean(data) { return JSON.parse(JSON.stringify(data)); }

function refApi(ref) {
  return {
    id: ref.id,
    path: ref.path,
    set: (d) => setDoc(ref, clean(d)),
    update: (d) => updateDoc(ref, clean(d)),
    delete: () => deleteDoc(ref)
  };
}

function adapt(fs) {
  return {
    doc: (path) => refApi(doc(fs, path)),
    collection: (path) => {
      const col = collection(fs, path);
      return {
        doc: (id) => refApi(id ? doc(col, id) : doc(col)),
        onSnapshot: (next, error) => onSnapshot(col, (snap) => next({
          docs: snap.docs.map((d) => ({ id: d.id, data: () => d.data() })),
          metadata: { fromCache: snap.metadata.fromCache }
        }), error)
      };
    }
  };
}

const cfg = firebaseConfig || {};
if (!cfg.apiKey || String(cfg.apiKey).startsWith('PASTE')) {
  showGate('Firebase is not set up yet. Fill in firebase-config.js, then reload this page.', { signIn: false });
} else {
  const app = initializeApp(cfg);
  const auth = getAuth(app);
  const fs = getFirestore(app);
  const leave = () => signOut(auth).then(() => location.reload());

  btnIn.addEventListener('click', () => {
    signInWithPopup(auth, new GoogleAuthProvider()).catch((e) => showGate('Sign-in failed: ' + (e.message || e.code)));
  });
  btnOther.addEventListener('click', leave);

  onAuthStateChanged(auth, async (user) => {
    if (!user) { showGate('Sign in with your Google account to continue.'); return; }
    const email = String(user.email || '').toLowerCase();
    let role = null;
    try {
      const snap = await getDoc(doc(fs, 'members', email));
      if (snap.exists()) role = snap.data().role;
    } catch (e) { /* not a member: rules refuse the read */ }
    if (['admin', 'editor', 'viewer'].indexOf(role) < 0) {
      showGate(email + ' is not on the access list. Ask Suyog to add this account.', { signIn: false, switchAccount: true });
      return;
    }
    gate.hidden = true;
    window.GPSC.start({
      db: adapt(fs),
      email,
      uid: user.uid,
      canWrite: role !== 'viewer',
      isAdmin: role === 'admin',
      signOut: leave
    });
  });
}
