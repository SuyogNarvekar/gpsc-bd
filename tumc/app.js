(function () {
  'use strict';

  var STATUSES = ['Open', 'Profile shared', 'Selected by TUMC', 'Offer shared', 'Offer accepted', 'Joined'];
  var ACCEPTED = STATUSES.indexOf('Offer accepted');
  var $ = function (id) { return document.getElementById(id); };

  var S = {
    db: null, api: null, reqs: [], slots: {}, user: null, loaded: { req: false, slot: false },
    f: { q: '', batch: '', stream: '', status: '' }, editing: null, failed: false,
    tab: /details/.test(window.location.hash || '') ? 'details' : 'summary', open: {}, printing: false
  };

  // ---------- helpers ----------
  function h(tag, attrs) {
    var el = document.createElement(tag), k, v, kids = Array.prototype.slice.call(arguments, 2);
    attrs = attrs || {};
    for (k in attrs) {
      v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.indexOf('on') === 0) el.addEventListener(k.slice(2), v);
      else if (k === 'checked') el.checked = true;
      else if (k === 'disabled') el.disabled = true;
      else el.setAttribute(k, v === true ? '' : v);
    }
    (function add(list) {
      list.forEach(function (c) {
        if (c == null || c === false) return;
        if (Array.isArray(c)) return add(c);
        el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
      });
    })(kids);
    return el;
  }
  function select(options, value, attrs) {
    var el = h('select', attrs, options.map(function (o) {
      var val = typeof o === 'string' ? o : o[0], lab = typeof o === 'string' ? o : o[1];
      return h('option', { value: val, text: lab });
    }));
    el.value = value;
    return el;
  }
  function chip(text, cls) { return h('span', { class: 'chip' + (cls ? ' ' + cls : ''), text: text }); }
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? (parseInt(m[3], 10) + ' ' + MON[parseInt(m[2], 10) - 1] + ' ' + m[1]) : '';
  }
  function todayIso() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  var toastTimer;
  function toast(text) {
    var t = $('toast'); t.textContent = text; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 3500);
  }
  function rank(s) { return STATUSES.indexOf(s); }
  function canWrite() { return !!(S.user && (S.user.role === 'admin' || S.user.role === 'editor')); }
  function isAdmin() { return !!(S.user && S.user.role === 'admin'); }
  function slotId(r, n) { return r.id + '_' + n; }
  function slotOf(r, n) {
    var d = S.slots[slotId(r, n)] || {};
    return { candidate: d.candidate || '', status: STATUSES.indexOf(d.status) >= 0 ? d.status : 'Open', doj: d.doj || '', tentative: !!d.tentative, remarks: d.remarks || '' };
  }
  function allSlots() {
    var out = [];
    S.reqs.forEach(function (r) { for (var n = 1; n <= r.nos; n++) out.push({ r: r, n: n, s: slotOf(r, n) }); });
    return out;
  }
  function title(r) { return r.designation; }
  function levelChip(r) { return r.level && r.designation.indexOf(r.level) < 0 ? r.level : ''; }
  function posName(r) { return title(r) + (levelChip(r) ? ' (' + levelChip(r) + ')' : ''); }
  function cat(st) { return st === 'Joined' ? 'joined' : st === 'Offer accepted' ? 'accepted' : st === 'Offer shared' ? 'offer' : st === 'Open' ? 'open' : 'prog'; }
  function tally(list) {
    var t = { total: 0, joined: 0, accepted: 0, offer: 0, prog: 0, open: 0 };
    list.forEach(function (x) { t.total++; t[cat(x.s.status)]++; });
    t.filled = t.joined + t.accepted;
    return t;
  }
  function bar(t) {
    var pct = function (n) { return (t.total ? n / t.total * 100 : 0) + '%'; };
    return h('div', { class: 'prog', 'aria-hidden': 'true' },
      h('i', { class: 'j', style: 'width:' + pct(t.joined) }), h('i', { class: 'f', style: 'width:' + pct(t.accepted) }),
      h('i', { class: 'o', style: 'width:' + pct(t.offer) }), h('i', { class: 'p', style: 'width:' + pct(t.prog) }));
  }

  // ---------- data ----------
  function onReqSnap(snap) {
    S.reqs = snap.docs.map(function (d) { var x = d.data(); x.id = d.id; x.nos = parseInt(x.nos, 10) || 0; return x; })
      .sort(function (a, b) { return (a.batchOrder - b.batchOrder) || (a.order - b.order); });
    S.loaded.req = true; render();
  }
  function onSlotSnap(snap) {
    S.slots = {};
    snap.docs.forEach(function (d) { S.slots[d.id] = d.data(); });
    S.loaded.slot = true; render();
  }
  function onErr(e) {
    var denied = e && (e.code === 'permission-denied' || /permission/i.test(e.message || ''));
    showBanner(denied ? 'The tracker cannot read its data. Publish the updated firestore.rules in Firebase, then reload.' : 'Could not load data: ' + ((e && e.message) || e));
  }
  function showBanner(text) { var b = $('banner'); b.textContent = text; b.hidden = !text; }

  function stamp() { return { updatedAt: new Date().toISOString(), updatedBy: S.user ? S.user.email : '' }; }
  function saveSlot(r, n, patch) {
    var id = slotId(r, n), data = Object.assign({ reqId: r.id, n: n }, patch, stamp());
    S.slots[id] = Object.assign({}, S.slots[id] || {}, data);
    render();
    S.db.collection('tumc_slots').doc(id).set(data, true).catch(function (e) { toast('Save failed: ' + ((e && e.message) || e)); });
  }

  // ---------- slot actions ----------
  var CLEAR = { candidate: '', status: 'Open', doj: '', tentative: false };
  function needName() { toast('Enter the candidate name first.'); render(); }
  function onName(r, n, val) {
    var cur = slotOf(r, n); val = val.trim();
    if (val === cur.candidate) return;
    if (!val) { saveSlot(r, n, CLEAR); toast('Candidate cleared. The position is open again.'); return; }
    saveSlot(r, n, { candidate: val, status: cur.status === 'Open' ? 'Profile shared' : cur.status });
  }
  function onStatus(r, n, val) {
    var cur = slotOf(r, n);
    if (val === cur.status) return;
    if (val === 'Open') {
      if (cur.candidate && !window.confirm('Mark as Open and clear the candidate name?')) { render(); return; }
      saveSlot(r, n, CLEAR); return;
    }
    if (!cur.candidate) { needName(); return; }
    saveSlot(r, n, { status: val });
  }
  function onTick(r, n, on) {
    var cur = slotOf(r, n);
    if (!cur.candidate) { needName(); return; }
    if (on) { saveSlot(r, n, { status: rank(cur.status) < ACCEPTED ? 'Offer accepted' : cur.status }); return; }
    if (cur.status === 'Joined' && !window.confirm('This candidate is marked as Joined. Untick and set back to Offer shared?')) { render(); return; }
    saveSlot(r, n, { status: rank(cur.status) >= ACCEPTED ? 'Offer shared' : cur.status });
  }
  function onDoj(r, n, val) {
    var cur = slotOf(r, n);
    if (val && !cur.candidate) { needName(); return; }
    saveSlot(r, n, { doj: val, tentative: val ? cur.tentative : false });
  }
  function onTent(r, n, on) {
    var cur = slotOf(r, n);
    if (!cur.doj) { toast('Pick a date of joining first.'); render(); return; }
    saveSlot(r, n, { tentative: on });
  }
  function onRemarks(r, n, val) {
    var cur = slotOf(r, n);
    if (val.trim() === cur.remarks) return;
    saveSlot(r, n, { remarks: val.trim() });
  }

  // ---------- render ----------
  function matches(r, n, s) {
    var f = S.f, st = s.status, q = f.q.toLowerCase();
    if (f.status === 'open' && st !== 'Open') return false;
    if (f.status === 'progress' && !(rank(st) > 0 && rank(st) < ACCEPTED)) return false;
    if (f.status === 'filled' && rank(st) < ACCEPTED) return false;
    if (f.status === 'joined' && st !== 'Joined') return false;
    if (q && (s.candidate + ' ' + r.designation + ' ' + r.stream + ' ' + (r.level || '') + ' ' + s.remarks).toLowerCase().indexOf(q) < 0) return false;
    return true;
  }
  function filtering() { return !!(S.f.q || S.f.status); }

  function renderTiles() {
    var t = tally(allSlots());
    var tiles = $('tiles'); tiles.textContent = '';
    function tile(l, big, sm) { return h('div', { class: 'tile' }, h('div', { class: 'lbl', text: l }), h('div', { class: 'big', text: String(big) }), sm ? h('div', { class: 'sm', text: sm }) : null); }
    tiles.appendChild(h('div', { class: 'tile' }, h('div', { class: 'lbl', text: 'Positions filled' }), h('div', { class: 'big', text: t.filled + ' / ' + t.total }), bar(t)));
    tiles.appendChild(tile('Joined', t.joined));
    tiles.appendChild(tile('Offers awaiting acceptance', t.offer));
    tiles.appendChild(tile('Profiles in progress', t.prog, 'Shared or selected, no offer yet'));
    tiles.appendChild(tile('Open positions', t.open, 'No candidate yet'));
  }

  function goDetails(r) {
    S.f = { q: '', batch: '', stream: '', status: '' };
    if (r) S.open[r.id] = true;
    setTab('details');
    if (r) {
      var el = document.getElementById('line-' + r.id);
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start' });
    }
  }
  function setTab(t) {
    S.tab = t;
    try { window.history.replaceState(null, '', t === 'details' ? '#details' : window.location.pathname + window.location.search); } catch (e) { /* ignore */ }
    render();
  }

  function num(n) { return h('td', { class: 'num', text: String(n) }); }
  function posLabel(r) { return r.stream + ': ' + posName(r); }

  function renderSummary() {
    var body = $('sum-body'); body.textContent = '';
    if (!S.loaded.req || !S.loaded.slot) { if (!S.failed && !$('banner').textContent) body.appendChild(h('div', { class: 'empty', text: 'Loading...' })); return; }
    if (!S.reqs.length) { body.appendChild(h('div', { class: 'empty', text: 'No requirements recorded yet.' })); return; }
    var slots = allSlots(), today = todayIso();

    // by stream
    var streams = [];
    S.reqs.forEach(function (r) { if (streams.indexOf(r.stream) < 0) streams.push(r.stream); });
    var head = ['Stream', 'Needed', 'Filled', 'Offer pending', 'In progress', 'Open', 'Progress'];
    function thead(cols, nums) { return h('thead', null, h('tr', null, cols.map(function (c, i) { return h('th', { class: (nums || []).indexOf(i) >= 0 ? 'num' : '', text: c }); }))); }
    var all = tally(slots);
    body.appendChild(h('section', { class: 'box bx' }, h('h2', { text: 'By stream' }),
      h('div', { class: 'scroll' }, h('table', { class: 'sumtbl' }, thead(head, [1, 2, 3, 4, 5]),
        h('tbody', null, streams.map(function (s) {
          var t = tally(slots.filter(function (x) { return x.r.stream === s; }));
          return h('tr', null, h('td', { text: s }), num(t.total), num(t.filled), num(t.offer), num(t.prog), num(t.open), h('td', { class: 'barcell' }, bar(t)));
        }), h('tr', { class: 'totrow' }, h('td', { text: 'All streams' }), num(all.total), num(all.filled), num(all.offer), num(all.prog), num(all.open), h('td', { class: 'barcell' }, bar(all))))))));

    // needs attention and joining schedule
    var late = slots.filter(function (x) { return x.s.candidate && x.s.status === 'Offer accepted' && x.s.doj && x.s.doj < today; });
    var nodate = slots.filter(function (x) { return x.s.candidate && x.s.status === 'Offer accepted' && !x.s.doj; });
    var offers = slots.filter(function (x) { return x.s.candidate && x.s.status === 'Offer shared'; });
    function group(label, list, why) {
      if (!list.length) return null;
      return h('div', { class: 'attg' }, h('div', { class: 'attl' }, label + ' (' + list.length + ')'), h('div', { class: 'legend', text: why }),
        h('ul', null, list.map(function (x) {
          return h('li', null, h('b', { text: x.s.candidate }), ' ' + posLabel(x.r), x.s.doj ? ' ' : null, x.s.doj ? chip(fmtDate(x.s.doj) + (x.s.tentative ? ' tentative' : ''), 'warn') : null);
        })));
    }
    var att = [
      group('Joining date passed', late, 'Offer accepted and the date has gone by. Confirm whether they joined.'),
      group('Offers awaiting acceptance', offers, 'Offer shared, not yet accepted.'),
      group('Accepted, no joining date', nodate, 'Add the date of joining.')
    ].filter(Boolean);
    var sched = slots.filter(function (x) { return x.s.doj && x.s.candidate; })
      .sort(function (a, b) { return a.s.doj < b.s.doj ? -1 : a.s.doj > b.s.doj ? 1 : 0; });
    body.appendChild(h('div', { class: 'two' },
      h('section', { class: 'box bx' }, h('h2', { text: 'Needs attention' }),
        att.length ? att : h('div', { class: 'legend', text: 'Nothing needs attention right now.' })),
      h('section', { class: 'box bx' }, h('h2', { text: 'Joining schedule (' + sched.length + ')' }),
        sched.length ? h('div', { class: 'scroll' }, h('table', { class: 'sumtbl slim' }, thead(['Date', 'Candidate', 'Position', 'Status']),
          h('tbody', null, sched.map(function (x) {
            return h('tr', null, h('td', { text: fmtDate(x.s.doj) + (x.s.tentative ? ' (tentative)' : '') }), h('td', { text: x.s.candidate }), h('td', { text: posLabel(x.r) }),
              h('td', null, chip(x.s.status, x.s.status === 'Joined' ? 'good' : '')));
          })))) : h('div', { class: 'legend', text: 'No joining dates recorded yet.' }))));

    // by requirement
    var batches = [];
    S.reqs.forEach(function (r) { if (batches.indexOf(r.batch) < 0) batches.push(r.batch); });
    var rows = [];
    batches.forEach(function (b) {
      var rs = S.reqs.filter(function (r) { return r.batch === b; }), first = rs[0];
      var meta = [first.receivedOn ? 'received ' + fmtDate(first.receivedOn) : 'received date not recorded'].join('');
      rows.push(h('tr', { class: 'bhead' }, h('td', { colspan: '5' }, h('b', { text: b }), h('span', { class: 'meta', text: '  ' + meta }))));
      rs.forEach(function (r) {
        var t = tally(slots.filter(function (x) { return x.r.id === r.id; }));
        rows.push(h('tr', null,
          h('td', null, h('button', { class: 'linkbtn', type: 'button', text: posLabel(r), title: 'Open the positions', onclick: function () { goDetails(r); } })),
          h('td', { text: r.minExp || 'Not specified' }), num(t.total), num(t.filled), h('td', { class: 'barcell' }, bar(t))));
      });
    });
    body.appendChild(h('section', { class: 'box bx' }, h('h2', { text: 'By requirement' }),
      h('div', { class: 'scroll' }, h('table', { class: 'sumtbl' },
        h('thead', null, h('tr', null, [['Position', ''], ['Experience', ''], ['Needed', 'num'], ['Filled', 'num'], ['Progress', '']].map(function (c) { return h('th', { class: c[1], text: c[0] }); }))),
        h('tbody', null, rows)))));
  }

  function slotRow(r, n) {
    var s = slotOf(r, n), w = canWrite(), k = slotId(r, n), filled = rank(s.status) >= ACCEPTED;
    var late = s.status === 'Offer accepted' && s.doj && s.doj < todayIso();
    var tr = h('tr', { class: filled ? 'rowfilled' : 'rowopen' });
    tr.appendChild(h('td', { class: 'n', text: String(n) }));
    tr.appendChild(h('td', { class: 'tick' }, h('input', { type: 'checkbox', 'aria-label': 'Filled: position ' + n + ' of ' + title(r), checked: filled, disabled: !w, 'data-k': k + ':tick',
      onchange: function (e) { onTick(r, n, e.target.checked); } })));
    tr.appendChild(h('td', null, w
      ? h('input', { type: 'text', value: s.candidate, placeholder: 'Candidate name', 'aria-label': 'Candidate name', 'data-k': k + ':name', onchange: function (e) { onName(r, n, e.target.value); } })
      : (s.candidate || h('span', { class: 'legend', text: 'Open' }))));
    tr.appendChild(h('td', null, w
      ? select(STATUSES, s.status, { 'aria-label': 'Status', 'data-k': k + ':status', onchange: function (e) { onStatus(r, n, e.target.value); } })
      : chip(s.status, s.status === 'Joined' ? 'good' : rank(s.status) >= ACCEPTED ? 'acc' : '')));
    tr.appendChild(h('td', null, w
      ? h('div', { class: 'doj' },
          h('input', { type: 'date', value: s.doj, 'aria-label': 'Date of joining', 'data-k': k + ':doj', onchange: function (e) { onDoj(r, n, e.target.value); } }),
          h('label', null, h('input', { type: 'checkbox', checked: s.tentative, 'data-k': k + ':tent', onchange: function (e) { onTent(r, n, e.target.checked); } }), 'Tentative'))
      : (s.doj ? fmtDate(s.doj) + (s.tentative ? ' (tentative)' : '') : '')));
    tr.appendChild(h('td', null, w
      ? h('input', { type: 'text', value: s.remarks, placeholder: 'Remarks', 'aria-label': 'Remarks', 'data-k': k + ':rem', onchange: function (e) { onRemarks(r, n, e.target.value); } })
      : s.remarks, late ? [' ', chip('Date passed, confirm joining', 'warn')] : null));
    return tr;
  }

  function isOpen(r) { return S.printing || filtering() || !!S.open[r.id]; }
  function line(r) {
    var shown = [], n, filled = 0;
    for (n = 1; n <= r.nos; n++) { var s = slotOf(r, n); if (rank(s.status) >= ACCEPTED) filled++; if (matches(r, n, s)) shown.push(n); }
    if (filtering() && !shown.length) return null;
    var open = isOpen(r);
    var facts = [chip(r.nos + (r.nos === 1 ? ' position' : ' positions'), 'acc'), chip('Experience: ' + (r.minExp || 'Not specified'))];
    var want = h('div', { class: 'want' },
      h('div', null, h('span', { class: 'k', text: 'Qualification: ' }), r.qualification || 'Not specified'),
      r.specificExp ? h('div', null, h('span', { class: 'k', text: 'Experience wanted: ' }), r.specificExp) : null,
      r.toShare ? h('div', null, h('span', { class: 'k', text: 'K&P to share: ' }), r.toShare) : null,
      (r.jd && r.jd.length) ? h('details', null, h('summary', { text: 'Job description from TUMC' }), h('ul', null, r.jd.map(function (t) { return h('li', { text: t }); }))) : null);
    var t = tally(slots4(r));
    return h('section', { class: 'box line', id: 'line-' + r.id },
      h('div', { class: 'line-head' },
        h('div', null,
          h('div', { class: 'line-title' }, chip(r.stream, 'acc'), title(r), levelChip(r) ? chip(levelChip(r)) : null),
          h('div', { class: 'facts' }, facts)),
        h('div', { class: 'line-right' },
          h('div', { class: 'minibar' }, bar(t)),
          h('span', { class: 'count', text: filled + ' of ' + r.nos + ' filled' }),
          canWrite() ? h('button', { class: 'btn sm noprint', type: 'button', text: 'Edit', onclick: function () { openForm(r); } }) : null,
          filtering() ? null : h('button', { class: 'btn sm noprint', type: 'button', 'data-k': r.id + ':toggle', 'aria-expanded': open ? 'true' : 'false', text: open ? 'Hide positions' : 'Show positions',
            onclick: function () { S.open[r.id] = !S.open[r.id]; render(); } }))),
      open ? [want,
        h('div', { class: 'scroll' }, h('table', null,
          h('thead', null, h('tr', null, ['#', 'Filled', 'Candidate', 'Status', 'Date of joining', 'Remarks'].map(function (t) { return h('th', { text: t }); }))),
          h('tbody', null, shown.map(function (x) { return slotRow(r, x); }))))] : null);
  }
  function slots4(r) { var out = []; for (var n = 1; n <= r.nos; n++) out.push({ r: r, n: n, s: slotOf(r, n) }); return out; }

  function renderFilters() {
    function fill(id, values, current) {
      var el = $(id), first = el.options[0];
      el.textContent = ''; el.appendChild(first);
      values.forEach(function (v) { el.appendChild(h('option', { value: v, text: v })); });
      el.value = values.indexOf(current) >= 0 ? current : '';
    }
    var batches = [], streams = [];
    S.reqs.forEach(function (r) { if (batches.indexOf(r.batch) < 0) batches.push(r.batch); if (streams.indexOf(r.stream) < 0) streams.push(r.stream); });
    fill('f-batch', batches, S.f.batch); fill('f-stream', streams, S.f.stream);
    S.f.batch = $('f-batch').value; S.f.stream = $('f-stream').value;
  }

  function renderView() {
    var v = $('view'); v.textContent = '';
    if (!S.loaded.req || !S.loaded.slot) { if (!S.failed && !$('banner').textContent) v.appendChild(h('div', { class: 'empty', text: 'Loading...' })); return; }
    if (!S.reqs.length) { v.appendChild(h('div', { class: 'empty', text: 'No requirements recorded yet.' })); return; }
    var order = [];
    S.reqs.forEach(function (r) { if (order.indexOf(r.batch) < 0) order.push(r.batch); });
    var any = false;
    order.forEach(function (b) {
      if (S.f.batch && S.f.batch !== b) return;
      var rs = S.reqs.filter(function (r) { return r.batch === b && (!S.f.stream || r.stream === S.f.stream); });
      var cards = rs.map(line).filter(Boolean);
      if (!cards.length) return;
      any = true;
      var first = rs[0], total = rs.reduce(function (a, r) { return a + r.nos; }, 0);
      var meta = [first.source, first.receivedOn ? 'Received ' + fmtDate(first.receivedOn) : 'Received date not recorded'].filter(Boolean).join('. ');
      v.appendChild(h('div', { class: 'batch' },
        h('div', { class: 'batch-head' }, h('h2', { text: b + ' (' + total + ')' }), h('span', { class: 'meta', text: meta })),
        cards));
    });
    if (!any) v.appendChild(h('div', { class: 'empty', text: 'No positions match these filters.' }));
  }

  function renderHeader() {
    var u = S.user, w = canWrite();
    $('who').hidden = !u; $('who').textContent = u ? u.email : '';
    $('rolechip').hidden = !u || w; $('rolechip').textContent = u && !w ? 'Signed in, view only' : '';
    $('btn-in').hidden = !!u; $('btn-out').hidden = !u;
    $('btn-add').hidden = !w; $('btn-export').hidden = !isAdmin(); $('btn-import').hidden = !isAdmin();
    $('seedbar').hidden = !(isAdmin() && S.loaded.req && !S.reqs.length);
    var last = '';
    S.reqs.forEach(function (r) { if (r.updatedAt > last) last = r.updatedAt; });
    Object.keys(S.slots).forEach(function (k) { var t = S.slots[k].updatedAt || ''; if (t > last) last = t; });
    $('updated').textContent = last ? 'Last updated ' + new Date(last).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' IST.' : '';
  }

  function renderTabs() {
    var sum = S.tab === 'summary';
    $('tab-summary').setAttribute('aria-selected', sum ? 'true' : 'false');
    $('tab-details').setAttribute('aria-selected', sum ? 'false' : 'true');
    $('pane-summary').hidden = !(sum || S.printing);
    $('pane-details').hidden = !(!sum || S.printing);
    var every = S.reqs.length && S.reqs.every(function (r) { return S.open[r.id]; });
    $('btn-expand').textContent = every ? 'Collapse all' : 'Expand all';
    $('btn-expand').hidden = filtering();
  }

  function render() {
    var a = document.activeElement, key = a && a.getAttribute ? a.getAttribute('data-k') : null;
    var pos = (a && typeof a.selectionStart === 'number' && a.type === 'text') ? a.selectionStart : null;
    renderHeader(); renderTabs();
    if (S.tab === 'summary' || S.printing) { renderTiles(); renderSummary(); }
    if (S.tab === 'details' || S.printing) { renderFilters(); renderView(); }
    if (key) {
      var el = document.querySelector('[data-k="' + key.replace(/"/g, '') + '"]');
      if (el && el !== document.activeElement) { el.focus(); if (pos != null && el.setSelectionRange) { try { el.setSelectionRange(pos, pos); } catch (e) { /* ignore */ } } }
    }
  }

  // ---------- requirement form ----------
  function openForm(r) {
    S.editing = r || null;
    var isNew = !r, d = r || { batch: '', stream: '', designation: '', level: '', nos: 1, minExp: '', qualification: '', specificExp: '', source: '', receivedOn: '', toShare: '', jd: [] };
    var batches = []; S.reqs.forEach(function (x) { if (batches.indexOf(x.batch) < 0) batches.push(x.batch); });
    var streams = []; S.reqs.forEach(function (x) { if (streams.indexOf(x.stream) < 0) streams.push(x.stream); });
    function fld(label, input, span) { return h('div', { class: 'fld' + (span ? ' span2' : '') }, h('label', { text: label }), input); }
    var g = $('form-grid'); g.textContent = '';
    g.appendChild(fld('Batch (who asked, when)', h('input', { id: 'x-batch', type: 'text', list: 'dl-batch', value: d.batch, placeholder: 'e.g. Additional requirement 4' }), true));
    g.appendChild(h('datalist', { id: 'dl-batch' }, batches.map(function (b) { return h('option', { value: b }); })));
    g.appendChild(fld('Stream', h('input', { id: 'x-stream', type: 'text', list: 'dl-stream', value: d.stream })));
    g.appendChild(h('datalist', { id: 'dl-stream' }, streams.map(function (b) { return h('option', { value: b }); })));
    g.appendChild(fld('Designation', h('input', { id: 'x-des', type: 'text', value: d.designation })));
    g.appendChild(fld('Level (optional)', h('input', { id: 'x-level', type: 'text', value: d.level || '', placeholder: 'Senior, Mid-level' })));
    g.appendChild(fld('Number of positions', h('input', { id: 'x-nos', type: 'number', min: '1', max: '50', value: String(d.nos) })));
    g.appendChild(fld('Minimum experience', h('input', { id: 'x-exp', type: 'text', value: d.minExp, placeholder: '5+ years' })));
    g.appendChild(fld('Requirement received on', h('input', { id: 'x-recv', type: 'date', value: d.receivedOn || '' })));
    g.appendChild(fld('Source', h('input', { id: 'x-src', type: 'text', value: d.source, placeholder: 'Email from ..., TUMC, date' })));
    g.appendChild(fld('Qualification', h('input', { id: 'x-qual', type: 'text', value: d.qualification }), true));
    g.appendChild(fld('Experience wanted (specific)', h('textarea', { id: 'x-spec', rows: '3', text: d.specificExp || '' }), true));
    g.appendChild(fld('K&P to share', h('input', { id: 'x-share', type: 'text', value: d.toShare || '' }), true));
    g.appendChild(fld('Job description (one point per line)', h('textarea', { id: 'x-jd', rows: '4', text: (d.jd || []).join('\n') }), true));
    g.appendChild(h('div', { class: 'err', id: 'x-err', hidden: true }));
    $('m-title').textContent = isNew ? 'Add requirement' : 'Edit requirement';
    $('m-del').hidden = isNew || !isAdmin();
    $('modal').hidden = false;
    $('x-batch').focus();
  }
  function closeForm() { $('modal').hidden = true; S.editing = null; }
  function formErr(t) { var e = $('x-err'); e.textContent = t; e.hidden = !t; }
  function val(id) { return $(id).value.trim(); }

  function saveForm() {
    var r = S.editing, nos = parseInt($('x-nos').value, 10);
    if (!val('x-batch') || !val('x-stream') || !val('x-des')) { formErr('Batch, stream and designation are required.'); return; }
    if (!(nos >= 1 && nos <= 50)) { formErr('Number of positions must be between 1 and 50.'); return; }
    if (r) {
      for (var n = nos + 1; n <= r.nos; n++) {
        if (slotOf(r, n).candidate) { formErr('Position ' + n + ' has a candidate. Clear it before reducing the number of positions.'); return; }
      }
    }
    var batch = val('x-batch'), same = S.reqs.filter(function (x) { return x.batch === batch; });
    var maxBatch = S.reqs.reduce(function (a, x) { return Math.max(a, x.batchOrder || 0); }, 0);
    var data = {
      batch: batch, stream: val('x-stream'), designation: val('x-des'), level: val('x-level'), nos: nos, minExp: val('x-exp'),
      qualification: val('x-qual'), specificExp: val('x-spec'), source: val('x-src'), receivedOn: $('x-recv').value, toShare: val('x-share'),
      jd: $('x-jd').value.split('\n').map(function (t) { return t.trim(); }).filter(Boolean)
    };
    if (r && r.batch === batch) { data.batchOrder = r.batchOrder; data.order = r.order; }
    else {
      data.batchOrder = same.length ? same[0].batchOrder : maxBatch + 1;
      data.order = same.reduce(function (a, x) { return Math.max(a, x.order || 0); }, 0) + 1;
    }
    Object.assign(data, stamp());
    var ref = S.db.collection('tumc_req').doc(r ? r.id : undefined);
    ref.set(data).then(function () { toast('Saved.'); }).catch(function (e) { toast('Save failed: ' + ((e && e.message) || e)); });
    closeForm();
  }

  function deleteReq() {
    var r = S.editing; if (!r) return;
    if (!window.confirm('Delete "' + title(r) + '" and all its position records? This cannot be undone.')) return;
    var ids = Object.keys(S.slots).filter(function (k) { return S.slots[k].reqId === r.id; });
    Promise.all(ids.map(function (k) { return S.db.collection('tumc_slots').doc(k).delete(); }))
      .then(function () { return S.db.collection('tumc_req').doc(r.id).delete(); })
      .then(function () { toast('Deleted.'); })
      .catch(function (e) { toast('Delete failed: ' + ((e && e.message) || e)); });
    closeForm();
  }

  // ---------- seed, import, export ----------
  function seed() {
    var list = window.TUMC_SEED || [];
    if (!window.confirm('Load ' + list.length + ' requirement lines?')) return;
    Promise.all(list.map(function (r) { return S.db.collection('tumc_req').doc(r.id).set(Object.assign({}, r, stamp())); }))
      .then(function () { toast('Requirements loaded.'); })
      .catch(function (e) { toast('Load failed: ' + ((e && e.message) || e)); });
  }
  function download(name, mime, text) {
    var a = h('a', { href: URL.createObjectURL(new Blob([text], { type: mime })), download: name });
    document.body.appendChild(a); a.click(); a.remove();
  }
  function csvCell(v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function exportCsv() {
    var rows = [['Batch', 'Stream', 'Designation', 'Level', 'Minimum experience', 'Qualification', 'Requirement received on', 'Position no', 'Candidate', 'Status', 'Date of joining', 'Tentative', 'Remarks']];
    allSlots().forEach(function (x) {
      rows.push([x.r.batch, x.r.stream, x.r.designation, x.r.level, x.r.minExp, x.r.qualification, x.r.receivedOn, x.n, x.s.candidate, x.s.status, x.s.doj, x.s.tentative ? 'Yes' : '', x.s.remarks]);
    });
    download('tumc-tracker-' + todayIso() + '.csv', 'text/csv;charset=utf-8', '﻿' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n'));
  }
  function exportJson() {
    var slots = Object.keys(S.slots).map(function (k) { var d = Object.assign({}, S.slots[k]); return d; });
    download('tumc-backup-' + todayIso() + '.json', 'application/json', JSON.stringify({ exportedAt: new Date().toISOString(), requirements: S.reqs, slots: slots }, null, 2));
  }
  function importJson(file) {
    var fr = new FileReader();
    fr.onload = function () {
      var data;
      try { data = JSON.parse(fr.result); } catch (e) { toast('That file is not valid JSON.'); return; }
      var reqs = Array.isArray(data.requirements) ? data.requirements : [], slots = Array.isArray(data.slots) ? data.slots : [];
      slots = slots.filter(function (s) { return s && s.reqId && s.n; });
      if (!reqs.length && !slots.length) { toast('Nothing to import in that file.'); return; }
      if (!window.confirm('Import ' + reqs.length + ' requirement lines and ' + slots.length + ' position records? Existing records with the same id are overwritten.')) return;
      var jobs = reqs.filter(function (r) { return r.id; }).map(function (r) { return S.db.collection('tumc_req').doc(r.id).set(Object.assign({}, r, stamp())); })
        .concat(slots.map(function (s) { return S.db.collection('tumc_slots').doc(s.reqId + '_' + s.n).set(Object.assign({}, s, stamp()), true); }));
      Promise.all(jobs).then(function () { toast('Import complete.'); }).catch(function (e) { toast('Import failed: ' + ((e && e.message) || e)); });
    };
    fr.readAsText(file);
  }

  // ---------- wiring ----------
  function wire() {
    $('q').addEventListener('input', function (e) { S.f.q = e.target.value; render(); });
    $('f-batch').addEventListener('change', function (e) { S.f.batch = e.target.value; render(); });
    $('f-stream').addEventListener('change', function (e) { S.f.stream = e.target.value; render(); });
    $('f-status').addEventListener('change', function (e) { S.f.status = e.target.value; render(); });
    $('tab-summary').addEventListener('click', function () { setTab('summary'); });
    $('tab-details').addEventListener('click', function () { setTab('details'); });
    $('btn-expand').addEventListener('click', function () {
      var every = S.reqs.every(function (r) { return S.open[r.id]; });
      S.open = {}; if (!every) S.reqs.forEach(function (r) { S.open[r.id] = true; });
      render();
    });
    window.addEventListener('beforeprint', function () { S.printing = true; render(); });
    window.addEventListener('afterprint', function () { S.printing = false; render(); });
    $('btn-add').addEventListener('click', function () { openForm(null); });
    $('btn-csv').addEventListener('click', exportCsv);
    $('btn-print').addEventListener('click', function () { window.print(); });
    $('btn-export').addEventListener('click', exportJson);
    $('btn-import').addEventListener('click', function () { $('file-import').click(); });
    $('file-import').addEventListener('change', function (e) { if (e.target.files[0]) importJson(e.target.files[0]); e.target.value = ''; });
    $('btn-seed').addEventListener('click', seed);
    $('btn-in').addEventListener('click', function () { if (S.api) S.api.signIn(); });
    $('btn-out').addEventListener('click', function () { if (S.api) S.api.signOut(); });
    $('m-x').addEventListener('click', closeForm);
    $('m-cancel').addEventListener('click', closeForm);
    $('m-save').addEventListener('click', saveForm);
    $('m-del').addEventListener('click', deleteReq);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('modal').hidden) closeForm(); });
  }

  window.TUMC = {
    start: function (api) {
      S.api = api; S.db = api.db;
      api.db.collection('tumc_req').onSnapshot(onReqSnap, onErr);
      api.db.collection('tumc_slots').onSnapshot(onSlotSnap, onErr);
    },
    setUser: function (u) {
      if (u && ['admin', 'editor', 'viewer'].indexOf(u.role) < 0) {
        toast(u.email + ' is not on the K&P access list, so the tracker stays view only.');
        u = { email: u.email, role: 'none' };
      }
      S.user = u; render();
    },
    fail: function (text) { S.failed = true; showBanner(text); },
    toast: toast,
    _state: S
  };
  wire();
  render();
})();
