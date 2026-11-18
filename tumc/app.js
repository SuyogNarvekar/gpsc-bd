(function () {
  'use strict';

  var STATUSES = ['Open', 'Profile shared', 'Selected by TUMC', 'Offer shared', 'Offer accepted', 'Joined'];
  var ACCEPTED = STATUSES.indexOf('Offer accepted');
  var $ = function (id) { return document.getElementById(id); };

  var S = {
    db: null, api: null, reqs: [], slots: {}, user: null, loaded: { req: false, slot: false },
    f: { q: '', batch: '', stream: '', status: '' }, editing: null, failed: false
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
    var tot = 0, filled = 0, joined = 0, offers = 0, prog = 0, open = 0;
    allSlots().forEach(function (x) {
      var st = x.s.status; tot++;
      if (st === 'Joined') { joined++; filled++; } else if (st === 'Offer accepted') filled++;
      else if (st === 'Offer shared') offers++;
      else if (st === 'Open') open++; else prog++;
    });
    var tiles = $('tiles'); tiles.textContent = '';
    function tile(l, big, sm) { return h('div', { class: 'tile' }, h('div', { class: 'lbl', text: l }), h('div', { class: 'big', text: String(big) }), sm ? h('div', { class: 'sm', text: sm }) : null); }
    var pj = tot ? (joined / tot * 100) : 0, pf = tot ? ((filled - joined) / tot * 100) : 0;
    tiles.appendChild(h('div', { class: 'tile' }, h('div', { class: 'lbl', text: 'Positions filled' }), h('div', { class: 'big', text: filled + ' / ' + tot }),
      h('div', { class: 'prog', 'aria-hidden': 'true' }, h('i', { class: 'j', style: 'width:' + pj + '%' }), h('i', { class: 'f', style: 'width:' + pf + '%' }))));
    tiles.appendChild(tile('Joined', joined));
    tiles.appendChild(tile('Offers awaiting acceptance', offers));
    tiles.appendChild(tile('Profiles in progress', prog, 'Shared or selected, no offer yet'));
    tiles.appendChild(tile('Open positions', open, 'No candidate yet'));
  }

  function renderSchedule() {
    var rows = allSlots().filter(function (x) { return x.s.doj && x.s.candidate; })
      .sort(function (a, b) { return a.s.doj < b.s.doj ? -1 : a.s.doj > b.s.doj ? 1 : 0; });
    $('sched-sum').textContent = 'Joining schedule (' + rows.length + ')';
    var body = $('sched-body'); body.textContent = '';
    if (!rows.length) { body.appendChild(h('div', { class: 'empty', text: 'No joining dates recorded yet.' })); return; }
    var today = todayIso();
    body.appendChild(h('table', null,
      h('thead', null, h('tr', null, ['Date of joining', 'Candidate', 'Position', 'Status'].map(function (t) { return h('th', { text: t }); }))),
      h('tbody', null, rows.map(function (x) {
        var late = x.s.status === 'Offer accepted' && x.s.doj < today;
        return h('tr', null,
          h('td', { text: fmtDate(x.s.doj) + (x.s.tentative ? ' (tentative)' : '') }),
          h('td', { text: x.s.candidate }),
          h('td', { text: x.r.stream + ': ' + title(x.r) }),
          h('td', null, chip(x.s.status, x.s.status === 'Joined' ? 'good' : ''), late ? [' ', chip('Date passed, confirm joining', 'warn')] : null));
      }))));
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

  function line(r) {
    var shown = [], n, filled = 0;
    for (n = 1; n <= r.nos; n++) { var s = slotOf(r, n); if (rank(s.status) >= ACCEPTED) filled++; if (matches(r, n, s)) shown.push(n); }
    if (filtering() && !shown.length) return null;
    var facts = [chip(r.nos + (r.nos === 1 ? ' position' : ' positions'), 'acc'), chip('Experience: ' + (r.minExp || 'Not specified'))];
    var want = h('div', { class: 'want' },
      h('div', null, h('span', { class: 'k', text: 'Qualification: ' }), r.qualification || 'Not specified'),
      r.specificExp ? h('div', null, h('span', { class: 'k', text: 'Experience wanted: ' }), r.specificExp) : null,
      r.toShare ? h('div', null, h('span', { class: 'k', text: 'K&P to share: ' }), r.toShare) : null,
      (r.jd && r.jd.length) ? h('details', null, h('summary', { text: 'Job description from TUMC' }), h('ul', null, r.jd.map(function (t) { return h('li', { text: t }); }))) : null);
    return h('section', { class: 'box line' },
      h('div', { class: 'line-head' },
        h('div', null,
          h('div', { class: 'line-title' }, chip(r.stream, 'acc'), title(r), levelChip(r) ? chip(levelChip(r)) : null),
          h('div', { class: 'facts' }, facts)),
        h('div', { class: 'line-right' },
          h('span', { class: 'count', text: filled + ' of ' + r.nos + ' filled' }),
          canWrite() ? h('button', { class: 'btn sm noprint', type: 'button', text: 'Edit', onclick: function () { openForm(r); } }) : null)),
      want,
      h('div', { class: 'scroll' }, h('table', null,
        h('thead', null, h('tr', null, ['#', 'Filled', 'Candidate', 'Status', 'Date of joining', 'Remarks'].map(function (t) { return h('th', { text: t }); }))),
        h('tbody', null, shown.map(function (x) { return slotRow(r, x); })))));
  }

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

  function render() {
    var a = document.activeElement, key = a && a.getAttribute ? a.getAttribute('data-k') : null;
    var pos = (a && typeof a.selectionStart === 'number' && a.type === 'text') ? a.selectionStart : null;
    renderHeader(); renderFilters(); renderTiles(); renderSchedule(); renderView();
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
