// Colocando toda a lógica principal aqui para separar as responsabilidades
const Q = DATA.questions, SCEN = DATA.scenarios, FAM = DATA.families;
const byN = {}; Q.forEach(q => byN[q.n] = q);
const gradeable = q => q.a.length > 0 && q.o.length > 0;

const DAY = 864e5;
const INTERVAL = [0, 1, 3, 7, 21];       // dias por caixa 1..5
const KEY = 'md102:progress:v2';

let prog = {};       // n -> {box:1..5, due:ms, hits:int, miss:int}
let mode = 'due';
let order = [], pos = 0, revealed = {};
let sess = {done:0, ok:0};

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const today = () => Date.now();

/* ---------------- persistência ---------------- */
let canStore = false;
async function loadProgress(){
  try{
    if (window.storage && window.storage.get){
      const r = await window.storage.get(KEY);
      canStore = true;
      if (r && r.value) prog = JSON.parse(r.value);
      $('save-state').textContent = 'progresso salvo automaticamente';
      return;
    }
  }catch(e){ canStore = !!(window.storage && window.storage.set); }
  $('save-state').textContent = canStore ? 'progresso salvo automaticamente'
    : 'sem salvamento automático aqui — baixe o progresso antes de fechar';
}
let saveTimer = null;
function saveProgress(){
  if (!canStore) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try{ await window.storage.set(KEY, JSON.stringify(prog)); }catch(e){}
  }, 600);
}

/* ---------------- agendamento ---------------- */
function rec(n){ return prog[n] || null; }
function boxOf(n){ const r = rec(n); return r ? r.box : 0; }
function isDue(n){ const r = rec(n); return !r || r.due <= today(); }
function schedule(n, correct){
  const r = prog[n] || {box:1, due:0, hits:0, miss:0};
  if (correct){ r.box = Math.min(5, r.box + 1); r.hits++; }
  else { r.box = 1; r.miss++; }
  r.due = today() + INTERVAL[r.box - 1] * DAY;
  prog[n] = r; saveProgress();
  return r;
}
function dueLabel(r){
  const d = INTERVAL[r.box - 1];
  if (d === 0) return 'volta ainda nesta sessão';
  if (d === 1) return 'volta amanhã';
  return 'volta em ' + d + ' dias';
}

/* ---------------- seleção ---------------- */
function baseSet(){
  const tp = $('f-topic').value, ty = $('f-type').value;
  const s = $('f-search').value.trim().toLowerCase(), only = $('f-only').checked;
  return Q.filter(x => {
    if (tp && x.tp !== tp) return false;
    if (ty && x.t !== ty) return false;
    if (only && !gradeable(x)) return false;
    if (s){
      const hay = (x.q.join(' ') + ' ' + x.o.map(o => o.x).join(' ') + ' ' + x.ar).toLowerCase();
      if (!hay.includes(s)) return false;
    }
    return true;
  });
}
function buildOrder(keep){
  const cur = order[pos];
  let set = baseSet();
  if (mode === 'due'){
    set = set.filter(x => isDue(x.n));
    set.sort((a, b) => boxOf(a.n) - boxOf(b.n) || (rec(a.n)?rec(a.n).due:0) - (rec(b.n)?rec(b.n).due:0));
  } else if (mode === 'trap'){
    set = set.filter(x => x.fam && FAM[x.fam] && FAM[x.fam].d);
    set.sort((a, b) => a.fam - b.fam || a.n - b.n);   // famílias em bloco
  }
  order = set.map(x => x.n);
  pos = keep ? Math.max(0, order.indexOf(cur)) : 0;
  render();
}

/* ---------------- fleet ---------------- */
function buildFleet(){
  $('fleet').innerHTML = Q.map(q =>
    `<button class="cell" data-n="${q.n}" title="Questão ${q.n}" aria-label="Questão ${q.n}"></button>`).join('');
  $('fleet').addEventListener('click', e => {
    const b = e.target.closest('.cell'); if (!b) return;
    const n = +b.dataset.n, i = order.indexOf(n);
    if (i === -1){ order = Q.map(x => x.n); pos = order.indexOf(n); }
    else pos = i;
    render();
  });
}
function paintFleet(){
  const cur = order[pos];
  [...$('fleet').children].forEach(c => {
    const n = +c.dataset.n, b = boxOf(n);
    c.className = 'cell' + (b ? ' b' + b : '') + (b && isDue(n) ? ' due' : '') + (n === cur ? ' cur' : '');
  });
  $('fleet-count').textContent = order.length + ' nesta fila';
}

/* ---------------- contadores ---------------- */
function paintCounts(){
  const mast = Q.filter(q => boxOf(q.n) === 5).length;
  const learn = Q.filter(q => { const b = boxOf(q.n); return b >= 1 && b <= 4; }).length;
  const nw = Q.filter(q => boxOf(q.n) === 0).length;
  $('s-mastered').textContent = mast;
  $('s-learning').textContent = learn;
  $('s-new').textContent = nw;
  $('s-sess').textContent = sess.done;
  $('s-pct').textContent = sess.done ? Math.round(sess.ok / sess.done * 100) + '%' : '—';
  $('m-due').textContent = Q.filter(q => isDue(q.n)).length + ' na fila';
  $('m-trap').textContent = Q.filter(q => q.fam && FAM[q.fam] && FAM[q.fam].d).length + ' questões';
  $('m-free').textContent = '409 questões';
}
function paintWeak(){
  const agg = {};
  Q.forEach(q => {
    const r = rec(q.n); if (!r || (!r.hits && !r.miss)) return;
    const a = agg[q.tp] || (agg[q.tp] = {h:0, m:0});
    a.h += r.hits; a.m += r.miss;
  });
  const rows = Object.entries(agg).map(([t, a]) => ({t, pc: a.m / (a.h + a.m), n: a.h + a.m}))
    .filter(r => r.n >= 3).sort((a, b) => b.pc - a.pc).slice(0, 5);
  if (!rows.length){ $('weak').innerHTML = '<h4>Onde você mais erra</h4><div class="wrow"><span class="nm" style="color:var(--ink-3)">Responda algumas questões e o ranking aparece aqui.</span></div>'; return; }
  $('weak').innerHTML = '<h4>Onde você mais erra</h4>' + rows.map(r =>
    `<div class="wrow"><span class="nm">${esc(r.t)}</span>
     <span class="wbar"><i style="width:${Math.round(r.pc*100)}%"></i></span>
     <span class="pc">${Math.round(r.pc*100)}%</span></div>`).join('');
}

/* ---------------- render ---------------- */
function render(){
  const stage = $('stage');
  if (!order.length){
    stage.innerHTML = mode === 'due'
      ? `<div class="qcard empty"><h3>Nada vencido por agora.</h3>
         <p>Tudo que você revisou hoje já foi reagendado. Passe para <b>Armadilhas</b> ou <b>Livre</b> para seguir estudando.</p></div>`
      : `<div class="qcard empty"><h3>Nenhuma questão com esses filtros.</h3><p>Afrouxe um dos filtros acima.</p></div>`;
    paintFleet(); paintCounts(); paintWeak(); return;
  }
  if (pos >= order.length) pos = order.length - 1;
  const q = byN[order[pos]];
  const st = revealed[q.n] || (revealed[q.n] = {picked:[], checked:false, correct:null, shown:false});
  const multi = q.a.length > 1, grad = gradeable(q);
  const recall = $('f-recall').checked && !st.checked && !st.shown;
  const r = rec(q.n);

  let h = '<div class="qcard">';
  h += `<div class="qtop"><span class="qn">${q.n}</span><span class="tag">${esc(q.t)}</span>`;
  if (q.cs) h += '<span class="tag teal">Estudo de caso</span>';
  if (q.lab) h += '<span class="tag amber">Laboratório</span>';
  if (multi) h += `<span class="tag amber">Marque ${q.a.length}</span>`;
  h += r ? `<span class="tag">Caixa ${r.box}</span>` : '<span class="tag">Nova</span>';
  h += `<span class="topic">${esc(q.tp)}</span></div>`;

  if (q.fam && FAM[q.fam] && FAM[q.fam].d){
    const sib = FAM[q.fam].m.filter(m => m !== q.n);
    h += `<div class="warn"><b>Cenário repetido, resposta diferente</b>
      Existem ${sib.length} questão(ões) quase idênticas a esta, com gabarito diferente: ${
      sib.map(m => `<button data-go="${m}">nº ${m}</button>`).join(', ')}.
      Decore a diferença entre elas, não o enunciado.</div>`;
  }
  if (q.ser) h += `<div class="warn"><b>Série "does this meet the goal"</b>
      O enunciado é o mesmo de outras questões; só a solução proposta muda. Leia a solução, não o cenário.</div>`;

  if (q.cs && SCEN[q.cs])
    h += '<details class="scen"><summary>Ver o cenário completo</summary>' +
         SCEN[q.cs].map(p => `<p>${esc(p)}</p>`).join('') + '</details>';

  h += '<div class="qtext">' + q.q.map(p => `<p>${esc(p)}</p>`).join('') + '</div>';

  if (recall){
    h += `<div class="recall"><p>Responda de cabeça primeiro. Lembrar sem ver as opções fixa muito mais do que reconhecer a alternativa certa numa lista.</p>
      <button class="b primary" id="btn-show">${grad ? 'Mostrar as alternativas' : 'Mostrar o gabarito'}</button></div>`;
  } else if (grad){
    h += '<div class="opts">';
    q.o.forEach(o => {
      const sel = st.picked.includes(o.l);
      let cls = 'opt' + (sel ? ' sel' : '') + (st.checked ? ' locked' : '');
      if (st.checked){ if (q.a.includes(o.l)) cls += ' right'; else if (sel) cls += ' wrong'; }
      h += `<label class="${cls}"><input type="${multi?'checkbox':'radio'}" name="opt" value="${o.l}"
        ${sel?'checked':''} ${st.checked?'disabled':''}><span class="lt">${o.l}</span><span>${esc(o.x)}</span></label>`;
    });
    h += '</div>';
  }

  h += '<div class="acts">';
  if (!recall && grad && !st.checked) h += '<button class="b primary" id="btn-check">Verificar resposta</button>';
  if (!recall && !grad && !st.checked) h += '<button class="b primary" id="btn-reveal">Mostrar o gabarito</button>';
  if (st.checked) h += '<button class="b ghost" id="btn-again">Refazer esta</button>';
  h += '</div>';

  if (st.checked){
    const kind = st.correct === true ? 'ok' : st.correct === false ? 'bad' : 'neutral';
    const hd = st.correct === true ? 'Acertou' : st.correct === false ? 'Errou' : 'Gabarito';
    h += `<div class="fb ${kind}"><div class="hd">${hd}</div>`;
    h += `<div class="ansline">Resposta: ${esc(q.ar)}</div>`;
    if (q.e.length) h += q.e.map(p => `<p>${esc(p)}</p>`).join('');
    if (q.r.length) h += q.r.map(u => `<p><a href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a></p>`).join('');
    if (st.correct === null){
      h += `<div class="acts"><button class="b ghost mini" id="btn-self-ok">Eu tinha acertado</button>
            <button class="b ghost mini" id="btn-self-bad">Eu tinha errado</button></div>`;
    } else if (prog[q.n]){
      h += `<div class="sched">Caixa ${prog[q.n].box} de 5 — ${dueLabel(prog[q.n])}</div>`;
    }
    h += '</div>';
  }
  h += '</div>';
  stage.innerHTML = h;

  stage.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => {
    const n = +b.dataset.go, i = order.indexOf(n);
    if (i === -1){ order = order.concat([n]); pos = order.length - 1; } else pos = i;
    render(); window.scrollTo({top:0, behavior:'smooth'});
  }));
  stage.querySelectorAll('input[name=opt]').forEach(inp => inp.addEventListener('change', () => {
    st.picked = multi ? [...stage.querySelectorAll('input[name=opt]:checked')].map(i => i.value) : [inp.value];
    render();
  }));
  const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
  on('btn-show', () => { st.shown = true; render(); });
  on('btn-check', () => {
    if (!st.picked.length) return;
    st.checked = true;
    st.correct = st.picked.length === q.a.length && st.picked.every(p => q.a.includes(p));
    schedule(q.n, st.correct); sess.done++; if (st.correct) sess.ok++;
    render();
  });
  on('btn-reveal', () => { st.checked = true; st.correct = null; render(); });
  on('btn-self-ok', () => { st.correct = true; schedule(q.n, true); sess.done++; sess.ok++; render(); });
  on('btn-self-bad', () => { st.correct = false; schedule(q.n, false); sess.done++; render(); });
  on('btn-again', () => { revealed[q.n] = {picked:[], checked:false, correct:null, shown:false}; render(); });

  $('btn-prev').disabled = pos === 0;
  $('btn-next').disabled = pos >= order.length - 1;
  $('fleet-label').textContent = (pos + 1) + ' de ' + order.length;
  paintFleet(); paintCounts(); paintWeak();
}

/* ---------------- wiring ---------------- */
function fillSelects(){
  const topics = [...new Set(Q.map(q => q.tp))].filter(Boolean);
  $('f-topic').innerHTML = '<option value="">Todos os tópicos</option>' + topics.map(t => `<option>${esc(t)}</option>`).join('');
  const types = [...new Set(Q.map(q => q.t))];
  $('f-type').innerHTML = '<option value="">Todos os tipos</option>' + types.map(t => `<option>${esc(t)}</option>`).join('');
}
document.querySelectorAll('.mode').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.mode').forEach(x => x.classList.remove('on'));
  b.classList.add('on'); mode = b.dataset.mode; buildOrder(false);
}));
['f-topic','f-type','f-only'].forEach(id => $(id).addEventListener('change', () => buildOrder(false)));
$('f-search').addEventListener('input', () => buildOrder(false));
$('f-recall').addEventListener('change', render);
$('btn-prev').addEventListener('click', () => { if (pos > 0){ pos--; render(); window.scrollTo({top:0,behavior:'smooth'}); } });
$('btn-next').addEventListener('click', () => { if (pos < order.length-1){ pos++; render(); window.scrollTo({top:0,behavior:'smooth'}); } });
$('btn-shuffle').addEventListener('click', () => {
  for (let i = order.length-1; i > 0; i--){ const j = Math.floor(Math.random()*(i+1)); [order[i],order[j]]=[order[j],order[i]]; }
  pos = 0; render();
});
$('btn-export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(prog)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'md102-progresso-' + new Date().toISOString().slice(0,10) + '.json';
  a.click(); URL.revokeObjectURL(a.href);
});
$('btn-import').addEventListener('click', () => $('file-in').click());
$('file-in').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = () => { try{ prog = JSON.parse(rd.result); saveProgress(); buildOrder(false); }
                      catch(err){ alert('Arquivo de progresso inválido.'); } };
  rd.readAsText(f);
});
$('btn-reset').addEventListener('click', () => {
  if (!confirm('Apagar todo o progresso e o agendamento?')) return;
  prog = {}; revealed = {}; sess = {done:0, ok:0}; saveProgress(); buildOrder(false);
});
document.addEventListener('keydown', e => {
  if (['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)) return;
  if (e.key === 'ArrowRight'){ $('btn-next').click(); return; }
  if (e.key === 'ArrowLeft'){ $('btn-prev').click(); return; }
  if (e.key === 'Enter'){ const b = $('btn-check') || $('btn-show') || $('btn-reveal') || $('btn-next'); if (b) b.click(); return; }
  if (/^[1-6]$/.test(e.key)){
    const inputs = [...document.querySelectorAll('input[name=opt]')];
    const t = inputs[+e.key - 1];
    if (t){ t.checked = !t.checked || t.type === 'radio'; t.dispatchEvent(new Event('change', {bubbles:true})); }
  }
});

fillSelects(); buildFleet();
loadProgress().then(() => buildOrder(false));