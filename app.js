(function(){
'use strict';

var STAGES=[
  {k:'radar',n:'Radar'},
  {k:'relationship',n:'Relationship building'},
  {k:'rfp',n:'RFP'},
  {k:'prep',n:'Accepted / Proposal in prep'},
  {k:'submitted',n:'Proposal submitted'},
  {k:'presented',n:'Presentation delivered'},
  {k:'won',n:'Won'},
  {k:'lost',n:'Lost'}
];
var STAGE_NAME={}; STAGES.forEach(function(s){STAGE_NAME[s.k]=s.n;});
var OPEN=['radar','relationship','rfp','prep','submitted','presented'];
var ROUTES=['Seeded by K&P','Panel invitation','Open RFP','Relationship-led','Direct nomination'];
var METHODS=['QCBS','QBS','LCS','FBS','SSS','CQS','Not known yet'];
var DATE_KINDS=['Submission deadline','Presentation','Meeting','Pre-bid meeting','Event','Other'];
var STALE_DAYS=14, SOON_DAYS=7;

var db=null,user=null,deals=[],readOnly=false,isAdmin=false,myId=null,loaded=false;
var view='board',editingId=null,openerEl=null,confirmDel=false;
var filters={q:'',owner:'',route:'',closed:true};
var sort={key:'hard',dir:1};
var chains={},attnInit=false;

function $(s){return document.querySelector(s);}
function el(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;}
function pad(n){return String(n).padStart(2,'0');}
function today(){var d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
function diffDays(a,b){return Math.round((Date.parse(a+'T00:00:00Z')-Date.parse(b+'T00:00:00Z'))/86400000);}
function fmtDate(s){if(!s)return '';var d=new Date(s+'T00:00:00');return isNaN(d)?s:d.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});}
function rel(s){var n=diffDays(s,today());if(n===0)return 'today';if(n===1)return 'tomorrow';if(n>1)return 'in '+n+' days';if(n===-1)return 'yesterday';return Math.abs(n)+' days ago';}
function plural(n,w){return n+' '+w+(n===1?'':'s');}
function fmtINR(n){
  n=Number(n); if(!isFinite(n)||n<=0)return '₹0';
  if(n>=1e7)return '₹'+(n/1e7).toFixed(2).replace(/\.?0+$/,'')+' Cr';
  if(n>=1e5)return '₹'+(n/1e5).toFixed(2).replace(/\.?0+$/,'')+' L';
  return '₹'+n.toLocaleString('en-IN');
}
function isOpen(d){return OPEN.indexOf(d.stage)>=0;}
function orgLine(d){return [d.ministry,d.department,d.board].filter(Boolean).join(' · ');}
function hardRank(d){return d.hardDate||'9999-12-31';}
function byHard(a,b){var x=hardRank(a),y=hardRank(b);return x<y?-1:x>y?1:String(a.name||'').localeCompare(String(b.name||''));}

function flags(d){
  var out=[];if(!isOpen(d))return out;var t=today(),n;
  if(d.hardDate){
    n=diffDays(d.hardDate,t);
    if(n<0)out.push({lvl:'bad',txt:(d.hardKind||'Hard date')+' passed '+plural(-n,'day')+' ago'});
    else if(n<=SOON_DAYS)out.push({lvl:n<=2?'bad':'warn',txt:(d.hardKind||'Hard date')+' '+rel(d.hardDate)});
  }
  if(d.actionDue&&d.nextAction){
    n=diffDays(d.actionDue,t);
    if(n<0)out.push({lvl:'bad',txt:'Action overdue by '+plural(-n,'day')});
    else if(n===0)out.push({lvl:'warn',txt:'Action due today'});
  }
  if(d.updatedAt){
    n=diffDays(t,String(d.updatedAt).slice(0,10));
    if(n>STALE_DAYS)out.push({lvl:'muted',txt:'No update in '+n+' days'});
  }
  return out;
}

/* ---------- writes ---------- */
function toast(msg){var t=$('#toast');t.textContent=msg;t.hidden=false;clearTimeout(toast.h);toast.h=setTimeout(function(){t.hidden=true;},4200);}
function writeError(e){
  var code=e&&e.code;
  if((code==='invalid_argument'||code==='permission-denied')&&!readOnly){toast('Could not save. You may have view-only access.');}
  else if(code==='quota_exceeded'||code==='resource-exhausted'){toast('The database limit was reached. Try again later or delete old opportunities.');}
  else toast('Could not save'+(e&&e.message?': '+e.message:'.'));
}
function queue(id,fn){
  var prev=chains[id]||Promise.resolve();
  var next=prev.catch(function(){}).then(fn).catch(writeError);
  chains[id]=next;return next;
}
function saveDoc(id,patch,isNew){
  return queue(id,function(){return isNew?db.collection('deals').doc(id).set(patch):db.doc('deals/'+id).update(patch);});
}
function stagePatch(d,stage){
  var t=today(),log=(d.log||[]).slice(-19);
  log.push({d:t,from:d.stage||null,to:stage});
  var p={stage:stage,stageSince:t,log:log};
  if(stage==='won')p.probability=100;
  if(stage==='lost')p.probability=0;
  return p;
}
function stamp(p){p.updatedAt=new Date().toISOString();p.updatedBy=myId||null;return p;}
function moveTo(id,stage){
  var d=deals.find(function(x){return x.id===id;});
  if(!d||d.stage===stage||readOnly)return;
  saveDoc(id,stamp(stagePatch(d,stage)),false);
  if(stage==='lost')openModal(id,{focus:'lossReason'});
}

/* ---------- rendering ---------- */
function tile(label,big,sub){
  var t=el('div','tile');t.append(el('div','lbl',label),el('div','big',big),el('div','sm',sub));return t;
}
function renderTiles(){
  var box=$('#tiles');box.textContent='';
  var open=deals.filter(isOpen),won=deals.filter(function(d){return d.stage==='won';});
  var weighted=0,gross=0,noVal=0,hot=0,stale=0;
  open.forEach(function(d){
    var v=Number(d.value)||0,p=Number(d.probability)||0;
    weighted+=v*p/100;gross+=v;if(!v)noVal++;
    var f=flags(d);
    if(f.some(function(x){return x.lvl!=='muted';}))hot++;else if(f.length)stale++;
  });
  var wonVal=won.reduce(function(s,d){return s+(Number(d.value)||0);},0);
  var late=open.filter(function(d){return d.stage==='prep'||d.stage==='submitted'||d.stage==='presented';}).length;
  box.append(
    tile('Open opportunities',String(open.length),late+' at proposal or presentation stage'),
    tile('Weighted pipeline',fmtINR(weighted),gross?('Unweighted '+fmtINR(gross)+(noVal?', '+noVal+' without a value':'')):'No values entered yet'),
    tile('Won',String(won.length),wonVal?fmtINR(wonVal)+' recorded':'No value recorded'),
    tile('Needs attention',String(hot),stale?('plus '+stale+' with no recent update'):'Dates and actions due soon')
  );
}
function renderAttn(){
  var list=$('#attn-list');list.textContent='';
  var rows=[];
  deals.filter(isOpen).forEach(function(d){
    var f=flags(d);if(!f.length)return;
    var rank=f.some(function(x){return x.lvl==='bad';})?0:f.some(function(x){return x.lvl==='warn';})?1:2;
    rows.push({d:d,f:f,rank:rank});
  });
  rows.sort(function(a,b){return a.rank-b.rank||byHard(a.d,b.d);});
  var hot=rows.filter(function(r){return r.rank<2;}).length;
  $('#attn-sum').textContent='Needs attention ('+rows.length+')'+(hot?' · '+hot+' due soon or overdue':'');
  if(!attnInit&&loaded){attnInit=true;$('#attn').open=hot>0;}
  if(!rows.length){var li=el('li',null,'Nothing overdue or due in the next '+SOON_DAYS+' days.');li.style.cursor='default';list.append(li);return;}
  rows.slice(0,60).forEach(function(r){
    var li=el('li');li.tabIndex=0;
    li.append(el('span','dot '+(r.rank===0?'bad':r.rank===1?'warn':'')),el('span','an',r.d.name||'Untitled'),el('span','why',r.f.map(function(x){return x.txt;}).join(' · ')));
    li.addEventListener('click',function(){openModal(r.d.id);});
    li.addEventListener('keydown',function(e){if(e.key==='Enter'){openModal(r.d.id);}});
    list.append(li);
  });
}
function uniq(key){
  var m={};deals.forEach(function(d){if(d[key])m[d[key]]=1;});return Object.keys(m).sort(function(a,b){return a.localeCompare(b);});
}
function setOptions(sel,first,vals){
  var cur=sel.value;sel.textContent='';
  var o=el('option',null,first);o.value='';sel.append(o);
  vals.forEach(function(v){var x=el('option',null,v);x.value=v;sel.append(x);});
  sel.value=vals.indexOf(cur)>=0?cur:'';
  if(sel.value==='')filters[sel.id==='flt-owner'?'owner':'route']='';
}
function renderFilters(){
  setOptions($('#flt-owner'),'All owners',uniq('owner'));
  setOptions($('#flt-route'),'All entry routes',ROUTES);
  var lists={ministry:[],department:[],board:['MPCB','MMRDA'],owner:['Suyog','Mangesh'],leadPartner:['Mangesh Ghanekar','Sandeep Welling','Akshay Purandare']};
  Object.keys(lists).forEach(function(k){
    var id='dl-'+k,dl=document.getElementById(id);
    if(!dl){dl=el('datalist');dl.id=id;$('#dls').append(dl);}
    dl.textContent='';
    var seen={};
    lists[k].concat(uniq(k)).forEach(function(v){if(seen[v])return;seen[v]=1;var o=el('option');o.value=v;dl.append(o);});
  });
}
function renderRole(){
  $('#rolechip').hidden=!readOnly;
  $('#btn-new').disabled=readOnly||!db;
}
function visible(){
  var q=filters.q.toLowerCase();
  return deals.filter(function(d){
    if(!filters.closed&&!isOpen(d))return false;
    if(filters.owner&&d.owner!==filters.owner)return false;
    if(filters.route&&d.entryRoute!==filters.route)return false;
    if(q){
      var hay=[d.name,d.ministry,d.department,d.board,d.notes,d.contacts,d.nextAction,d.leadPartner].join(' ').toLowerCase();
      if(hay.indexOf(q)<0)return false;
    }
    return true;
  });
}
function hardChip(d){
  if(!d.hardDate)return null;
  var cls='chip mono';
  if(isOpen(d)){var n=diffDays(d.hardDate,today());if(n<0)cls+=' bad';else if(n<=SOON_DAYS)cls+=' warn';}
  var c=el('span',cls,(d.hardKind||'Date')+' · '+fmtDate(d.hardDate));c.title=rel(d.hardDate);return c;
}
function cardEl(d){
  var c=el('div','card');c.tabIndex=0;c.dataset.id=d.id;
  if(!readOnly){
    c.draggable=true;
    c.addEventListener('dragstart',function(e){e.dataTransfer.setData('text/plain',d.id);e.dataTransfer.effectAllowed='move';c.classList.add('drag');});
    c.addEventListener('dragend',function(){c.classList.remove('drag');});
  }
  c.addEventListener('click',function(){openModal(d.id);});
  c.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();openModal(d.id);}});
  var top=el('div','card-top');top.append(el('div','card-name',d.name||'Untitled'));
  if(d.verify)top.append(el('span','chip verify','Verify'));
  c.append(top);
  var org=orgLine(d);if(org)c.append(el('div','card-org',org));
  var hc=hardChip(d);if(hc){var r=el('div','card-foot');r.append(hc);c.append(r);}
  if(d.nextAction){
    var t='Next: '+d.nextAction+(d.owner?' ('+d.owner+')':'')+(d.actionDue?', due '+fmtDate(d.actionDue):'');
    c.append(el('div','card-next',t));
  }else if(isOpen(d)){c.append(el('div','card-next none','No next action set'));}
  var f=el('div','card-foot');
  if(d.value)f.append(el('span','chip mono',fmtINR(d.value)));
  if(d.probability!=null&&d.probability!=='')f.append(el('span','chip mono',d.probability+'%'));
  if(d.entryRoute)f.append(el('span','chip',d.entryRoute));
  if(d.method&&d.method!=='Not known yet')f.append(el('span','chip',d.method));
  if(f.childNodes.length)c.append(f);
  return c;
}
function renderBoard(host,prev){
  var board=el('div','board');
  var rows=visible();
  STAGES.forEach(function(s,i){
    var col=el('section','col'+(s.k==='won'||s.k==='lost'?' '+s.k:''));
    col.style.setProperty('--i',String(i));
    var items=rows.filter(function(d){return d.stage===s.k;}).sort(byHard);
    var head=el('div','col-head');
    var h=el('h2',null,s.n);h.append(el('span','n',String(items.length)));
    var right=el('span');
    var sum=items.reduce(function(a,d){return a+(Number(d.value)||0);},0);
    if(sum){var sp=el('span','sum',fmtINR(sum));right.append(sp);}
    if(!readOnly&&s.k!=='won'&&s.k!=='lost'){
      var add=el('button','add','+');add.type='button';add.title='Add to '+s.n;add.setAttribute('aria-label','Add opportunity to '+s.n);
      add.addEventListener('click',function(){openModal(null,{stage:s.k});});
      right.append(add);
    }
    head.append(h,right);
    var body=el('div','col-body');
    items.forEach(function(d){body.append(cardEl(d));});
    if(!items.length)body.append(el('div','drop',readOnly?'Empty':'Drop a card here'));
    if(prev&&prev.tops[s.k])setTimeout(function(){body.scrollTop=prev.tops[s.k];},0);
    col.append(head,body);
    col.addEventListener('dragover',function(e){if(readOnly)return;e.preventDefault();col.classList.add('over');});
    col.addEventListener('dragleave',function(e){if(!col.contains(e.relatedTarget))col.classList.remove('over');});
    col.addEventListener('drop',function(e){
      e.preventDefault();col.classList.remove('over');
      var id=e.dataTransfer.getData('text/plain');if(id)moveTo(id,s.k);
    });
    col.dataset.stage=s.k;
    board.append(col);
  });
  host.append(board);
  if(prev)board.scrollLeft=prev.left;
}
var COLS=[
  {k:'name',l:'Project',g:function(d){return d.name||'';}},
  {k:'org',l:'Ministry · Department · Board',g:orgLine},
  {k:'stage',l:'Stage',g:function(d){return STAGES.findIndex(function(s){return s.k===d.stage;});},t:function(d){return STAGE_NAME[d.stage]||'';}},
  {k:'route',l:'Entry route',g:function(d){return d.entryRoute||'';}},
  {k:'method',l:'Method',g:function(d){return d.method||'';}},
  {k:'value',l:'Value',num:1,g:function(d){return Number(d.value)||0;},t:function(d){return d.value?fmtINR(d.value):'';}},
  {k:'prob',l:'Prob.',num:1,g:function(d){return d.probability==null||d.probability===''?-1:Number(d.probability);},t:function(d){return d.probability==null||d.probability===''?'':d.probability+'%';}},
  {k:'hard',l:'Next hard date',g:function(d){return d.hardDate||'';},t:function(d){return d.hardDate?(d.hardKind?d.hardKind+' · ':'')+fmtDate(d.hardDate):'';}},
  {k:'action',l:'Next action',g:function(d){return d.nextAction||'';}},
  {k:'owner',l:'Owner',g:function(d){return d.owner||'';}}
];
function renderTable(host){
  var wrap=el('div','scroll');var tbl=el('table');
  var thead=el('thead'),tr=el('tr');
  COLS.forEach(function(c){
    var th=el('th',null,c.l);th.tabIndex=0;
    if(sort.key===c.k){th.setAttribute('aria-sort',sort.dir>0?'ascending':'descending');th.textContent=c.l+(sort.dir>0?' ▲':' ▼');}
    var go=function(){if(sort.key===c.k)sort.dir=-sort.dir;else{sort.key=c.k;sort.dir=1;}renderView();};
    th.addEventListener('click',go);th.addEventListener('keydown',function(e){if(e.key==='Enter')go();});
    tr.append(th);
  });
  thead.append(tr);tbl.append(thead);
  var col=COLS.find(function(c){return c.k===sort.key;})||COLS[7];
  var rows=visible().slice().sort(function(a,b){
    var x=col.g(a),y=col.g(b);
    var ex=(x===''||x==null),ey=(y===''||y==null);
    if(ex&&!ey)return 1;if(ey&&!ex)return -1;
    var r=typeof x==='number'?x-y:String(x).localeCompare(String(y));
    return r*sort.dir||byHard(a,b);
  });
  var tb=el('tbody');
  rows.forEach(function(d){
    var r=el('tr');r.tabIndex=0;
    COLS.forEach(function(c){
      var td=el('td',c.num?'num':null,c.t?c.t(d):c.g(d));
      if(c.k==='name'){td.style.fontWeight='500';if(d.verify){td.append(document.createTextNode(' '));td.append(el('span','chip verify','Verify'));}}
      r.append(td);
    });
    r.addEventListener('click',function(){openModal(d.id);});
    r.addEventListener('keydown',function(e){if(e.key==='Enter')openModal(d.id);});
    tb.append(r);
  });
  tbl.append(tb);wrap.append(tbl);host.append(wrap);
  if(!rows.length)host.append(el('div','empty','No opportunities match these filters.'));
}
function bucket(dateStr){
  var n=diffDays(dateStr,today());
  if(n<0)return 0;if(n===0)return 1;if(n<=7)return 2;if(n<=30)return 3;return 4;
}
var BUCKETS=['Overdue','Today','Next 7 days','Next 30 days','Later'];
function dateSection(root,title,items,dateKey,kindFn,textFn){
  root.append(el('h3',null,title));
  if(!items.length){root.append(el('div','ds','Nothing set.'));return;}
  var groups=[[],[],[],[],[]];
  items.forEach(function(d){groups[bucket(d[dateKey])].push(d);});
  groups.forEach(function(g,i){
    if(!g.length)return;
    g.sort(function(a,b){return a[dateKey]<b[dateKey]?-1:a[dateKey]>b[dateKey]?1:0;});
    root.append(el('h4',null,BUCKETS[i]+' ('+g.length+')'));
    g.forEach(function(d){
      var row=el('div','dl-row');row.tabIndex=0;
      var left=el('div','mono',fmtDate(d[dateKey]));left.append(el('div','ds',kindFn(d)));
      var right=el('div');right.append(el('div','dn',d.name||'Untitled'),el('div','ds',textFn(d)));
      row.append(left,right);
      row.addEventListener('click',function(){openModal(d.id);});
      row.addEventListener('keydown',function(e){if(e.key==='Enter')openModal(d.id);});
      root.append(row);
    });
  });
}
function renderDates(host){
  var wrap=el('div','scroll');var root=el('div','dl');
  var rows=visible().filter(isOpen);
  dateSection(root,'Hard dates',rows.filter(function(d){return d.hardDate;}),'hardDate',function(d){return d.hardKind||'Date';},function(d){return [orgLine(d),STAGE_NAME[d.stage]].filter(Boolean).join(' · ');});
  dateSection(root,'Next actions',rows.filter(function(d){return d.actionDue&&d.nextAction;}),'actionDue',function(d){return d.owner||'No owner';},function(d){return d.nextAction;});
  wrap.append(root);host.append(wrap);
}
function renderView(){
  var host=$('#view');
  var prev=null,old=host.querySelector('.board');
  if(old){prev={left:old.scrollLeft,tops:{}};old.querySelectorAll('.col').forEach(function(c){prev.tops[c.dataset.stage]=c.querySelector('.col-body').scrollTop;});}
  host.textContent='';
  if(!db){return;}
  if(!loaded){host.append(el('div','empty','Loading pipeline…'));return;}
  if(!deals.length){
    var e=el('div','empty','No opportunities yet. '+(readOnly?'':'Use New opportunity to add the first one'+(isAdmin?', or Import to load a JSON file.':'.')));host.append(e);return;
  }
  if(view==='board')renderBoard(host,prev);else if(view==='table')renderTable(host);else renderDates(host);
}
function renderAll(){renderTiles();renderAttn();renderFilters();renderRole();renderView();}

/* ---------- form ---------- */
function opts(list,blank){var o=blank?[{v:'',l:'Not set'}]:[];list.forEach(function(x){o.push({v:x,l:x});});return o;}
var FIELDS=[
  {k:'name',l:'Project name',t:'text',span:2,ph:'The name we use informally'},
  {k:'ministry',l:'Ministry',t:'text',list:1},
  {k:'department',l:'Department',t:'text',list:1},
  {k:'board',l:'Board / mandal',t:'text',list:1,span:2,ph:'e.g. MPCB, MMRDA'},
  {k:'stage',l:'Stage',t:'select',o:STAGES.map(function(s){return {v:s.k,l:s.n};})},
  {k:'entryRoute',l:'Entry route',t:'select',o:opts(ROUTES,true)},
  {k:'method',l:'Selection method',t:'select',o:opts(METHODS,true)},
  {k:'value',l:'Estimated value (₹, excl. GST)',t:'number'},
  {k:'probability',l:'Probability (%)',t:'number',max:100},
  {k:'leadPartner',l:'K&P lead partner',t:'text',list:1},
  {k:'hardDate',l:'Next hard date',t:'date'},
  {k:'hardKind',l:'What the date is',t:'select',o:opts(DATE_KINDS,true)},
  {k:'nextAction',l:'Next action',t:'text',span:2},
  {k:'owner',l:'Action owner',t:'text',list:1},
  {k:'actionDue',l:'Action due date',t:'date'},
  {k:'contacts',l:'Key contacts',t:'textarea',span:2,rows:2},
  {k:'links',l:'Document link (URL)',t:'text',span:2,ph:'https://'},
  {k:'notes',l:'Notes',t:'textarea',span:2,rows:4},
  {k:'lossReason',l:'Reason lost, or why we did not bid',t:'textarea',span:2,rows:2}
];
function buildForm(){
  var g=$('#form-grid');
  FIELDS.forEach(function(s){
    var w=el('div','fld'+(s.span===2?' span2':''));w.dataset.k=s.k;
    var lab=el('label',null,s.l);lab.htmlFor='f-'+s.k;
    var inp;
    if(s.t==='select'){inp=el('select');s.o.forEach(function(o){var op=el('option',null,o.l);op.value=o.v;inp.append(op);});}
    else if(s.t==='textarea'){inp=el('textarea');inp.rows=s.rows||3;}
    else{
      inp=el('input');inp.type=s.t;
      if(s.list)inp.setAttribute('list','dl-'+s.k);
      if(s.t==='number'){inp.min='0';if(s.max)inp.max=String(s.max);inp.step='any';inp.inputMode='decimal';}
    }
    inp.id='f-'+s.k;if(s.ph)inp.placeholder=s.ph;
    w.append(lab,inp);g.append(w);
  });
  var link=el('div','note');link.id='m-link';link.hidden=true;g.append(link);
  var vr=el('label','verifyrow');vr.id='m-verify';vr.hidden=true;
  var cb=el('input');cb.type='checkbox';cb.id='f-verify';
  vr.append(cb,document.createTextNode('This card was migrated from earlier notes. Tick once the details are confirmed to remove the Verify tag.'));
  g.append(vr);
  var er=el('div','err');er.id='m-err';er.hidden=true;g.append(er);
  $('#f-stage').addEventListener('change',toggleLoss);
  $('#f-links').addEventListener('input',showLink);
}
function toggleLoss(){
  document.querySelector('.fld[data-k="lossReason"]').classList.toggle('hide',$('#f-stage').value!=='lost');
}
function showLink(){
  var v=$('#f-links').value.trim(),n=$('#m-link');n.textContent='';
  if(/^https?:\/\//i.test(v)){var a=el('a',null,'Open link');a.href=v;a.target='_blank';a.rel='noopener noreferrer';n.append(a);n.hidden=false;}else n.hidden=true;
}
function histText(d){
  var l=(d.log||[]).slice(-4);if(!l.length)return '';
  return 'Moves: '+l.map(function(x){return fmtDate(x.d)+' '+(x.from?STAGE_NAME[x.from]+' → ':'')+STAGE_NAME[x.to];}).join('; ');
}
function openModal(id,o){
  o=o||{};editingId=id;confirmDel=false;openerEl=document.activeElement;
  var d=id?deals.find(function(x){return x.id===id;}):null;
  if(id&&!d)return;
  d=d||{stage:o.stage||'radar'};
  FIELDS.forEach(function(s){
    var v=d[s.k];$('#f-'+s.k).value=(v==null?'':String(v));
    $('#f-'+s.k).disabled=readOnly;
  });
  $('#m-title').textContent=id?(d.name||'Opportunity'):'New opportunity';
  toggleLoss();showLink();
  $('#m-err').hidden=true;
  $('#m-verify').hidden=!(id&&d.verify)||readOnly;$('#f-verify').checked=false;
  $('#m-save').hidden=readOnly;
  var del=$('#m-del');del.hidden=!(id&&isAdmin&&!readOnly);del.textContent='Delete';
  var meta=[];
  if(d.updatedAt)meta.push('Updated '+fmtDate(String(d.updatedAt).slice(0,10)));
  var h=histText(d);if(h)meta.push(h);
  $('#m-meta').textContent=meta.join(' · ');
  $('#modal').hidden=false;
  var focusId=o.focus?'f-'+o.focus:'f-name';
  setTimeout(function(){var f=document.getElementById(focusId);if(f)f.focus();},0);
}
function closeModal(){$('#modal').hidden=true;editingId=null;if(openerEl&&openerEl.focus&&document.contains(openerEl))openerEl.focus();}
function readForm(){
  var o={};
  FIELDS.forEach(function(s){
    var v=$('#f-'+s.k).value.trim();
    o[s.k]=s.t==='number'?(v===''?null:Number(v)):(v===''?null:v);
  });
  if(o.probability!=null)o.probability=Math.max(0,Math.min(100,o.probability));
  if(o.value!=null&&!(o.value>=0))o.value=null;
  return o;
}
function submit(){
  if(readOnly)return;
  var f=readForm(),err=$('#m-err');
  if(!f.name){err.textContent='Enter a project name.';err.hidden=false;$('#f-name').focus();return;}
  if(f.stage==='lost'&&f.probability==null)f.probability=0;
  var save=$('#m-save');save.disabled=true;
  if(editingId){
    var d=deals.find(function(x){return x.id===editingId;});
    var patch=f,newStage=f.stage;
    if(d&&d.stage!==newStage){
      var sp=stagePatch(d,newStage),pr=f.probability;
      Object.assign(patch,sp);
      if(pr!=null&&pr!==d.probability)patch.probability=pr;
    }
    if(d&&d.verify&&$('#f-verify').checked)patch.verify=false;
    saveDoc(editingId,stamp(patch),false).then(function(){save.disabled=false;closeModal();});
  }else{
    var nid=db.collection('deals').doc().id,t=today();
    var p=Object.assign({},f,{stageSince:t,log:[],verify:false,createdAt:new Date().toISOString(),createdBy:myId||null});
    if(p.stage==='won'&&p.probability==null)p.probability=100;
    saveDoc(nid,stamp(p),true).then(function(){save.disabled=false;closeModal();});
  }
}
function removeDeal(){
  if(!editingId||!isAdmin||readOnly)return;
  var b=$('#m-del');
  if(!confirmDel){confirmDel=true;b.textContent='Click again to delete for good';return;}
  var id=editingId;
  queue(id,function(){return db.doc('deals/'+id).delete();}).then(function(){closeModal();toast('Opportunity deleted.');});
}

/* ---------- import / export (admins) ---------- */
function exportJson(){
  var out=deals.map(function(d){return d;});
  var blob=new Blob([JSON.stringify(out,null,2)],{type:'application/json'});
  var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='gpsc-bd-pipeline-'+today()+'.json';
  document.body.append(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(a.href);},2000);
}
function importJson(file){
  if(!file)return;
  var rd=new FileReader();
  rd.onload=function(){
    var list;
    try{list=JSON.parse(rd.result);}catch(e){toast('That file is not valid JSON.');return;}
    if(!Array.isArray(list)||!list.length){toast('The file has no opportunities.');return;}
    var n=0;
    list.reduce(function(p,item){
      return p.then(function(){
        var id=String(item.id||'').replace(/[^A-Za-z0-9_\-.~:@+]/g,'');
        if(!id)id=db.collection('deals').doc().id;
        var data=Object.assign({},item);delete data.id;
        return db.doc('deals/'+id).set(data).then(function(){n++;});
      });
    },Promise.resolve()).then(function(){toast('Imported '+n+' opportunities.');}).catch(writeError);
  };
  rd.readAsText(file);
}

/* ---------- start ---------- */
function status(msg){var h=$('#view');h.textContent='';h.append(el('div','empty',msg));}
function wire(){
  buildForm();
  $('#btn-new').addEventListener('click',function(){openModal(null,{});});
  $('#m-x').addEventListener('click',closeModal);
  $('#m-cancel').addEventListener('click',closeModal);
  $('#m-save').addEventListener('click',submit);
  $('#m-del').addEventListener('click',removeDeal);
  $('#modal').addEventListener('mousedown',function(e){if(e.target===$('#modal'))closeModal();});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!$('#modal').hidden)closeModal();});
  document.querySelectorAll('.tab').forEach(function(t){
    t.addEventListener('click',function(){
      view=t.dataset.v;
      document.querySelectorAll('.tab').forEach(function(x){x.setAttribute('aria-selected',x===t?'true':'false');});
      renderView();
    });
  });
  $('#q').addEventListener('input',function(e){filters.q=e.target.value;renderView();});
  $('#flt-owner').addEventListener('change',function(e){filters.owner=e.target.value;renderView();});
  $('#flt-route').addEventListener('change',function(e){filters.route=e.target.value;renderView();});
  $('#flt-closed').addEventListener('change',function(e){filters.closed=e.target.checked;renderView();});
  $('#btn-export').addEventListener('click',exportJson);
  $('#btn-import').addEventListener('click',function(){$('#file-import').click();});
  $('#file-import').addEventListener('change',function(e){importJson(e.target.files[0]);e.target.value='';});
}
var started=false,timer=null;
function start(ctx){
  db=ctx.db;readOnly=!ctx.canWrite;isAdmin=!!ctx.isAdmin;myId=ctx.uid||null;
  var who=$('#who');who.textContent=ctx.email||'';who.hidden=!ctx.email;
  var out=$('#btn-out');out.hidden=false;out.onclick=ctx.signOut;
  $('#btn-export').hidden=!isAdmin;$('#btn-import').hidden=!(isAdmin&&!readOnly);
  renderAll();
  if(started)return;started=true;
  timer=setTimeout(function(){if(!loaded)toast('Still connecting to the database. Check your connection.');},10000);
  db.collection('deals').onSnapshot(function(snap){
    deals=snap.docs.map(function(x){var o=Object.assign({},x.data());o.id=x.id;return o;});
    if(snap.metadata.fromCache&&!deals.length&&!loaded)return;
    loaded=true;clearTimeout(timer);
    renderAll();
  },function(e){
    clearTimeout(timer);
    status('Could not read the database'+(e&&e.message?': '+e.message:'.'));
  });
}
window.GPSC={start:start};
wire();renderAll();
})();
