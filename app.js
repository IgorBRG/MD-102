// Colocando toda a lógica principal aqui para separar as responsabilidades
const Q = DATA.questions, SCEN = DATA.scenarios, FAM = DATA.families;
const byN = {}; Q.forEach(q => byN[q.n] = q);
const gradeable = q => q.a.length > 0 && q.o.length > 0;

const DAY = 864e5;
const INTERVAL = [0, 1, 3, 7, 21];        // dias por caixa 1..5
const PROG_KEY = 'md102console:progress:v1';
const FLAG_KEY = 'md102console:flags:v1';

let prog = {};        // n -> {box:1..5, due:ms, hits:int, miss:int}
let flags = {};        // n -> true
let mode = 'due';
let order = [], pos = 0, revealed = {};
let sess = {done:0, ok:0};

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const now = () => Date.now();

/* ---------------- persistência ---------------- */
let canStore = false;
async function loadState(){
  try{
    if (window.storage && window.storage.get){
      canStore = true;
      try{ const r = await window.storage.get(PROG_KEY); if (r && r.value) prog = JSON.parse(r.value); }catch(e){}
      try{ const r2 = await window.storage.get(FLAG_KEY); if (r2 && r2.value) flags = JSON.parse(r2.value); }catch(e){}
      $('save-state').textContent = 'progresso salvo automaticamente';
      return;
    }
  }catch(e){}
  $('save-state').textContent = 'sem salvamento automático aqui — exporte antes de sair';
}
let saveTimer = null;
function saveProgress(){
  if (!canStore) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try{ await window.storage.set(PROG_KEY, JSON.stringify(prog)); }catch(e){}
    try{ await window.storage.set(FLAG_KEY, JSON.stringify(flags)); }catch(e){}
  }, 500);
}

/* ---------------- agendamento (Leitner) ---------------- */
function rec(n){ return prog[n] || null; }
function boxOf(n){ const r = rec(n); return r ? r.box : 0; }
function isDue(n){ const r = rec(n); return !r || r.due <= now(); }
function schedule(n, correct){
  const r = prog[n] || {box:1, due:0, hits:0, miss:0};
  if (correct){ r.box = Math.min(5, r.box + 1); r.hits++; }
  else { r.box = 1; r.miss++; }
  r.due = now() + INTERVAL[r.box - 1] * DAY;
  prog[n] = r; saveProgress();
  return r;
}
function dueLabel(r){
  const d = INTERVAL[r.box - 1];
  if (d === 0) return 'volta ainda nesta sessão';
  if (d === 1) return 'volta amanhã';
  return 'volta em ' + d + ' dias';
}
function toggleFlag(n){ if (flags[n]) delete flags[n]; else flags[n] = true; saveProgress(); }

/* ---------------- seleção de conjunto ---------------- */
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
    set.sort((a, b) => a.fam - b.fam || a.n - b.n);
  } else if (mode === 'flag'){
    set = set.filter(x => flags[x.n]);
  }
  order = set.map(x => x.n);
  pos = keep ? Math.max(0, order.indexOf(cur)) : 0;
  render();
}

/* ---------------- frota (elemento assinatura) ---------------- */
function buildFleet(){
  $('fleet').innerHTML = Q.map(q =>
    `<button class="cell" data-n="${q.n}" title="Questão ${q.n}" aria-label="Questão ${q.n}"></button>`).join('');
  $('fleet').addEventListener('click', e => {
    const b = e.target.closest('.cell'); if (!b) return;
    const n = +b.dataset.n, i = order.indexOf(n);
    if (i === -1){ order = Q.map(x => x.n); pos = order.indexOf(n); }
    else pos = i;
    render(); window.scrollTo({top:0, behavior:'smooth'});
  });
}
function paintFleet(){
  const cur = order[pos];
  [...$('fleet').children].forEach(c => {
    const n = +c.dataset.n, b = boxOf(n);
    c.className = 'cell' + (b ? ' b' + b : '') + (b && isDue(n) ? ' due' : '') +
      (n === cur ? ' cur' : '') + (flags[n] ? ' flagged' : '');
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
  $('hd-mastered').textContent = mast;
  $('hd-due').textContent = Q.filter(q => isDue(q.n)).length;
  $('hd-streak').textContent = sess.done ? Math.round(sess.ok / sess.done * 100) + '%' : '0%';
  $('m-due').textContent = Q.filter(q => isDue(q.n)).length;
  $('m-trap').textContent = Q.filter(q => q.fam && FAM[q.fam] && FAM[q.fam].d).length;
  $('m-flag').textContent = Object.keys(flags).length;
}
function paintWeak(){
  const agg = {};
  Q.forEach(q => {
    const r = rec(q.n); if (!r || (!r.hits && !r.miss)) return;
    const a = agg[q.tp] || (agg[q.tp] = {h:0, m:0});
    a.h += r.hits; a.m += r.miss;
  });
  const rows = Object.entries(agg).map(([t, a]) => ({t, pc: a.m / (a.h + a.m), n: a.h + a.m}))
    .filter(r => r.n >= 3).sort((a, b) => b.pc - a.pc).slice(0, 6);
  if (!rows.length){
    $('weak').innerHTML = '<h4>Onde você mais erra</h4><p style="color:var(--ink-3);font-size:13px;margin:0">Responda algumas questões e o ranking por tópico aparece aqui.</p>';
    return;
  }
  $('weak').innerHTML = '<h4>Onde você mais erra</h4>' + rows.map(r =>
    `<div class="wrow"><span class="nm">${esc(r.t)}</span>
     <span class="wbar"><i style="width:${Math.round(r.pc*100)}%"></i></span>
     <span class="pc">${Math.round(r.pc*100)}%</span></div>`).join('');
}

/* ---------------- render questão ---------------- */
function render(){
  const stage = $('stage');
  if (!order.length){
    const msgs = {
      due: ['Nada vencido por agora.', 'Tudo que você revisou já foi reagendado. Vá para <b>Armadilhas</b> ou <b>Livre</b> para continuar estudando.'],
      trap: ['Nenhuma armadilha nos filtros atuais.', 'Armadilhas são grupos de questões quase idênticas com gabaritos diferentes. Afrouxe os filtros de tópico ou tipo.'],
      flag: ['Nenhuma questão marcada.', 'Clique na estrela ☆ no topo de uma questão para guardá-la aqui.'],
      free: ['Nenhuma questão com esses filtros.', 'Afrouxe um dos filtros acima.']
    };
    const [h,p] = msgs[mode] || msgs.free;
    stage.innerHTML = `<div class="qcard empty"><h3>${h}</h3><p>${p}</p></div>`;
    $('pos-label').textContent = '—';
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
  if (multi) h += `<span class="tag amber">Marque ${q.a.length}</span>`;
  h += r ? `<span class="tag">Caixa ${r.box}/5</span>` : '<span class="tag">Nova</span>';
  h += `<button class="flagbtn ${flags[q.n]?'on':''}" id="btn-flag" title="Marcar questão">${flags[q.n]?'★':'☆'}</button>`;
  h += `<span class="topic">${esc(q.tp)}</span></div>`;

  if (q.fam && FAM[q.fam] && FAM[q.fam].d){
    const sib = FAM[q.fam].m.filter(m => m !== q.n);
    h += `<div class="warn"><b>Cenário repetido, resposta diferente</b>
      Existe(m) ${sib.length} questão(ões) quase idêntica(s) a esta, com gabarito diferente: ${
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
  on('btn-flag', () => { toggleFlag(q.n); render(); });
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
  $('pos-label').textContent = (pos + 1) + ' de ' + order.length;
  $('fleet-label').textContent = '— questão ' + q.n + ' de 409';
  paintFleet(); paintCounts(); paintWeak();
}

/* ================= SIMULADO CRONOMETRADO ================= */
let exam = null; // {order, answers:{}, flags:{}, startedAt, durationSec, pos}
let examTimerId = null;

function examSetupScreen(){
  $('exam-hd-bar').style.display = 'none';
  const topics = [...new Set(Q.map(q => q.tp))];
  $('exam-body').innerHTML = `
    <div class="exam-setup">
      <h2>Simulado cronometrado</h2>
      <p>Um bloco de questões aleatórias, sem feedback imediato — como na prova real. Veja seu placar e os pontos fracos ao final.</p>
      <div class="exam-opts">
        <div>
          <label>Quantidade de questões</label>
          <select id="ex-n">
            <option value="20">20 questões (rápido)</option>
            <option value="40" selected>40 questões (padrão)</option>
            <option value="80">80 questões (intensivo)</option>
            <option value="409">409 questões (tudo)</option>
          </select>
        </div>
        <div>
          <label>Tópico</label>
          <select id="ex-topic"><option value="">Todos os tópicos</option>${topics.map(t=>`<option>${esc(t)}</option>`).join('')}</select>
        </div>
        <div>
          <label>Tempo por questão</label>
          <select id="ex-time">
            <option value="0">Sem cronômetro</option>
            <option value="72" selected>72 segundos (ritmo da prova real)</option>
            <option value="60">60 segundos</option>
            <option value="45">45 segundos</option>
          </select>
        </div>
        <button class="b primary" id="ex-start" style="margin-top:4px">Começar simulado</button>
      </div>
    </div>`;
  $('ex-start').addEventListener('click', startExam);
}
function startExam(){
  const n = +$('ex-n').value, tp = $('ex-topic').value, perQ = +$('ex-time').value;
  let pool = Q.filter(gradeable);
  if (tp) pool = pool.filter(q => q.tp === tp);
  pool = [...pool];
  for (let i = pool.length-1; i>0; i--){ const j = Math.floor(Math.random()*(i+1)); [pool[i],pool[j]]=[pool[j],pool[i]]; }
  pool = pool.slice(0, Math.min(n, pool.length));
  exam = {
    order: pool.map(q=>q.n), answers:{}, flags:{}, pos:0,
    startedAt: now(), durationSec: perQ ? perQ * pool.length : 0, perQ
  };
  $('exam-hd-bar').style.display = 'flex';
  renderExam();
  if (exam.durationSec){
    clearInterval(examTimerId);
    examTimerId = setInterval(tickExam, 250);
  }
}
function tickExam(){
  const elapsed = (now() - exam.startedAt) / 1000;
  const left = Math.max(0, exam.durationSec - elapsed);
  const m = Math.floor(left/60), s = Math.floor(left%60);
  $('exam-timer').textContent = String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
  if (left <= 0){ clearInterval(examTimerId); finishExam(); }
}
function renderExam(){
  if (!exam) return;
  const n = exam.order[exam.pos], q = byN[n];
  const multi = q.a.length > 1;
  const picked = exam.answers[n] || [];
  $('exam-progress').textContent = 'Questão ' + (exam.pos+1) + ' de ' + exam.order.length;

  let h = '<div class="qcard">';
  h += `<div class="qtop"><span class="qn">${q.n}</span><span class="tag">${esc(q.t)}</span>`;
  if (multi) h += `<span class="tag amber">Marque ${q.a.length}</span>`;
  h += `<button class="flagbtn ${exam.flags[n]?'on':''}" id="ex-flag" title="Marcar para revisão">${exam.flags[n]?'★':'☆'}</button>`;
  h += `<span class="topic">${esc(q.tp)}</span></div>`;
  if (q.cs && SCEN[q.cs])
    h += '<details class="scen"><summary>Ver o cenário completo</summary>' +
         SCEN[q.cs].map(p => `<p>${esc(p)}</p>`).join('') + '</details>';
  h += '<div class="qtext">' + q.q.map(p => `<p>${esc(p)}</p>`).join('') + '</div>';
  h += '<div class="opts">';
  q.o.forEach(o => {
    const sel = picked.includes(o.l);
    h += `<label class="opt${sel?' sel':''}"><input type="${multi?'checkbox':'radio'}" name="exopt" value="${o.l}" ${sel?'checked':''}>
      <span class="lt">${o.l}</span><span>${esc(o.x)}</span></label>`;
  });
  h += '</div>';
  h += `<div class="acts">
      <button class="b ghost" id="ex-prev" ${exam.pos===0?'disabled':''}>‹ Anterior</button>
      <div class="spacer"></div>
      ${exam.pos < exam.order.length-1 ? '<button class="b primary" id="ex-next">Próxima ›</button>' : '<button class="b primary" id="ex-finish">Finalizar simulado</button>'}
    </div>`;
  h += '</div>';

  h += `<div class="exam-grid">` + exam.order.map((qn,i) => {
    const cls = ['egrid-cell'];
    if (exam.answers[qn]) cls.push('answered');
    if (exam.flags[qn]) cls.push('flag');
    if (i === exam.pos) cls.push('cur');
    return `<button class="${cls.join(' ')}" data-i="${i}">${i+1}</button>`;
  }).join('') + '</div>';

  $('exam-body').innerHTML = h;
  $('exam-body').querySelectorAll('input[name=exopt]').forEach(inp => inp.addEventListener('change', () => {
    const checked = [...$('exam-body').querySelectorAll('input[name=exopt]:checked')].map(i=>i.value);
    exam.answers[n] = checked; renderExam();
  }));
  $('exam-body').querySelectorAll('.egrid-cell').forEach(b => b.addEventListener('click', () => {
    exam.pos = +b.dataset.i; renderExam();
  }));
  const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
  on('ex-flag', () => { if (exam.flags[n]) delete exam.flags[n]; else exam.flags[n] = true; renderExam(); });
  on('ex-prev', () => { exam.pos--; renderExam(); });
  on('ex-next', () => { exam.pos++; renderExam(); });
  on('ex-finish', () => { if (confirm('Finalizar o simulado agora?')) finishExam(); });
}
function finishExam(){
  clearInterval(examTimerId);
  $('exam-hd-bar').style.display = 'none';
  let okCount = 0;
  const byTopic = {};
  const missed = [];
  exam.order.forEach(n => {
    const q = byN[n];
    const picked = exam.answers[n] || [];
    const correct = picked.length === q.a.length && picked.every(p => q.a.includes(p)) && picked.length > 0;
    schedule(n, correct);
    if (correct) okCount++; else missed.push(n);
    const t = byTopic[q.tp] || (byTopic[q.tp] = {h:0,total:0});
    t.total++; if (correct) t.h++;
  });
  sess.done += exam.order.length; sess.ok += okCount;
  const pct = Math.round(okCount / exam.order.length * 100);
  const verdict = pct >= 70 ? 'Nível de aprovação — mantenha o ritmo.' : 'Abaixo do corte de aprovação (~700/1000) — foque nas questões erradas abaixo.';
  let h = `<div class="exam-results">
    <div class="score">${pct}%</div>
    <div class="verdict">${okCount} de ${exam.order.length} corretas · ${verdict}</div>
    <div class="panel" style="box-shadow:none;border:1px solid var(--line)">
      <h4>Desempenho por tópico</h4>
      ${Object.entries(byTopic).map(([t,a]) => `<div class="res-row"><span class="nm">${esc(t)}</span>
        <span class="bar"><i style="width:${Math.round(a.h/a.total*100)}%"></i></span>
        <span class="pc">${Math.round(a.h/a.total*100)}%</span></div>`).join('')}
    </div>`;
  if (missed.length){
    h += `<div class="panel" style="box-shadow:none;border:1px solid var(--line)">
      <h4>Questões para revisar (${missed.length})</h4>
      <div class="miss-list">${missed.map(n=>`<button data-review="${n}">nº ${n}</button>`).join('')}</div>
    </div>`;
  }
  h += `<div class="acts" style="justify-content:center;margin-top:18px">
    <button class="b ghost" id="ex-again">Novo simulado</button>
    <button class="b primary" id="ex-close">Voltar ao console</button>
  </div></div>`;
  $('exam-body').innerHTML = h;
  $('exam-body').querySelectorAll('[data-review]').forEach(b => b.addEventListener('click', () => {
    const n = +b.dataset.review;
    closeExam();
    order = Q.map(x=>x.n); pos = order.indexOf(n); render();
    window.scrollTo({top:0,behavior:'smooth'});
  }));
  $('ex-again').addEventListener('click', examSetupScreen);
  $('ex-close').addEventListener('click', closeExam);
}
function closeExam(){
  clearInterval(examTimerId);
  exam = null;
  $('exam-overlay').classList.remove('show');
  buildOrder(false);
}

/* ---------------- wiring geral ---------------- */
function fillSelects(){
  const topics = [...new Set(Q.map(q => q.tp))].filter(Boolean);
  $('f-topic').innerHTML = '<option value="">Todos os tópicos</option>' + topics.map(t => `<option>${esc(t)}</option>`).join('');
  const types = [...new Set(Q.map(q => q.t))];
  $('f-type').innerHTML = '<option value="">Todos os tipos</option>' + types.map(t => `<option>${esc(t)}</option>`).join('');
}
document.querySelectorAll('.mode[data-mode]').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.mode[data-mode]').forEach(x => x.classList.remove('on'));
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
  const blob = new Blob([JSON.stringify({prog, flags})], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'md102-progresso-' + new Date().toISOString().slice(0,10) + '.json';
  a.click(); URL.revokeObjectURL(a.href);
});
$('btn-import').addEventListener('click', () => $('file-in').click());
$('file-in').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    try{
      const data = JSON.parse(rd.result);
      if (data.prog){ prog = data.prog; flags = data.flags || {}; } else { prog = data; }
      saveProgress(); buildOrder(false);
    } catch(err){ alert('Arquivo de progresso inválido.'); }
  };
  rd.readAsText(f);
});
$('btn-reset').addEventListener('click', () => {
  if (!confirm('Apagar todo o progresso e o agendamento? Essa ação não pode ser desfeita.')) return;
  prog = {}; flags = {}; revealed = {}; sess = {done:0, ok:0}; saveProgress(); buildOrder(false);
});
$('btn-open-exam').addEventListener('click', () => {
  $('exam-overlay').classList.add('show');
  examSetupScreen();
  window.scrollTo({top:0});
});
$('btn-exam-exit').addEventListener('click', () => {
  if (exam && confirm('Sair do simulado sem terminar? Seu progresso no simulado será perdido.')) closeExam();
});
document.addEventListener('keydown', e => {
  if (['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)) return;
  if ($('exam-overlay').classList.contains('show')) return;
  if (e.key === 'ArrowRight'){ $('btn-next').click(); return; }
  if (e.key === 'ArrowLeft'){ $('btn-prev').click(); return; }
  if (e.key.toLowerCase() === 'f'){ const b = $('btn-flag'); if (b) b.click(); return; }
  if (e.key === 'Enter'){ const b = $('btn-check') || $('btn-show') || $('btn-reveal') || $('btn-next'); if (b) b.click(); return; }
  if (/^[1-6]$/.test(e.key)){
    const inputs = [...document.querySelectorAll('input[name=opt]')];
    const t = inputs[+e.key - 1];
    if (t){ t.checked = !t.checked || t.type === 'radio'; t.dispatchEvent(new Event('change', {bubbles:true})); }
  }
});

fillSelects(); buildFleet();
loadState().then(() => buildOrder(false));



// Lógica para controle do Modo Escuro com Segmented Control
const btnLight = document.getElementById('btn-theme-light');
const btnDark = document.getElementById('btn-theme-dark');
if (btnLight && btnDark) {
  let currentTheme = localStorage.getItem('theme');
  if (!currentTheme) {
    currentTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  const applyTheme = (theme) => {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      btnDark.classList.add('active');
      btnLight.classList.remove('active');
    } else {
      document.documentElement.removeAttribute('data-theme');
      btnLight.classList.add('active');
      btnDark.classList.remove('active');
    }
    localStorage.setItem('theme', theme);
  };

  applyTheme(currentTheme);

  btnLight.addEventListener('click', () => applyTheme('light'));
  btnDark.addEventListener('click', () => applyTheme('dark'));
}
