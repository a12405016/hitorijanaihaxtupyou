// 準備画面と発表者画面（手元）のまとめ役
import { loadPdf, renderPage } from './slides.js';
import { BuddyBrain, MODELS, detectSigns } from './buddy-ai.js';

const $ = (id) => document.getElementById(id);
const DEFAULT_CHARA = 'img/a-chan.svg';
const CHECK_EVERY_MS = 5000;   // 何秒ごとに不安のサインを見るか（5秒）
const COOLDOWN_MS = 10000;     // 声かけの最短間隔（10秒）
const SPEAK_SCORE = 0.15;      // このスコア以上で声をかける（0.15）
const BUBBLE_MS = 10000;       // ふきだしを出しておく時間（10秒）

// ふきだしを大きく・キャラを大きく跳ねさせる（style.cssを触らずに上書き）
const boost = document.createElement('style');
boost.textContent = `
  .buddy .bubble { max-width: 320px; font-size: 24px; padding: 14px 20px; border-width: 4px; box-shadow: 6px 6px 0 var(--yellow); }
  .buddy img { width: 170px; max-height: 190px; }
  .buddy img.cheer { animation: bigHop .6s cubic-bezier(.3,1.6,.5,1) 3; }
  .bubble.pop { animation: pop .45s ease-out; }
  @keyframes bigHop {
    0% { transform: translateY(0) scale(1); }
    35% { transform: translateY(-36px) scale(1.12); }
    70% { transform: translateY(0) scale(.96); }
    100% { transform: translateY(0) scale(1); }
  }
  @keyframes pop {
    0% { transform: scale(.6); }
    60% { transform: scale(1.12); }
    100% { transform: scale(1); }
  }
  @media (prefers-reduced-motion: reduce) { .buddy img.cheer, .bubble.pop { animation: none; } }
`;
document.head.append(boost);

const channel = new BroadcastChannel('hitorijanai');
const brain = new BuddyBrain();

// localStorageは使えないこともあるので、失敗しても動くようにする
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } }
};

const state = {
  pdfBytes: null, pdf: null, pdfKey: '',
  order: [], hidden: new Set(), memos: {},
  character: store.get('character', DEFAULT_CHARA),
  charName: store.get('charName', 'Aちゃん')
};

// ===================== 準備画面 =====================

// ---- キャラクター ----
function applyCharacter() {
  $('chara-preview').src = state.character;
  $('setup-chara').src = state.character;
  $('chara').src = state.character;
  $('chara-name').value = state.charName;
}
applyCharacter();

$('chara-input').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    state.character = reader.result;
    if (!store.set('character', state.character)) {
      console.info('画像が大きいので保存はせず、今回だけ使います');
    }
    applyCharacter();
  };
  reader.readAsDataURL(file);
  e.target.value = '';
});

$('chara-reset').addEventListener('click', () => {
  state.character = DEFAULT_CHARA;
  state.charName = 'Aちゃん';
  store.set('character', DEFAULT_CHARA);
  store.set('charName', 'Aちゃん');
  applyCharacter();
});

$('chara-name').addEventListener('input', (e) => {
  state.charName = e.target.value.trim() || 'Aちゃん';
  store.set('charName', state.charName);
});

// ---- スライドPDF ----
const rows = new Map(); // ページ番号 → 一覧の行

$('pdf-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  $('pdf-name').textContent = '読みこみ中…';
  try {
    state.pdfBytes = new Uint8Array(await file.arrayBuffer());
    state.pdf = await loadPdf(state.pdfBytes);
  } catch (err) {
    console.error(err);
    $('pdf-name').textContent = 'PDFを読みこめませんでした';
    return;
  }
  const n = state.pdf.numPages;
  state.pdfKey = `memos:${file.name}:${n}`;
  state.memos = store.get(state.pdfKey, {});
  state.order = Array.from({ length: n }, (_, i) => i + 1);
  state.hidden.clear();
  $('pdf-name').textContent = `${file.name}（${n}枚）`;
  buildList();
  $('start').disabled = false;
  e.target.value = '';
});

function buildList() {
  const list = $('slide-list');
  list.innerHTML = '';
  rows.clear();
  for (const p of state.order) {
    const li = document.createElement('li');
    li.className = 'slide-row';
    li.innerHTML = `
      <span class="no"></span>
      <canvas aria-label="スライド${p}"></canvas>
      <div class="ctrl">
        <button class="btn up" type="button" aria-label="上へ">↑</button>
        <button class="btn down" type="button" aria-label="下へ">↓</button>
        <label><input type="checkbox" class="hide-cb"> 非表示</label>
      </div>
      <textarea placeholder="自分だけに見える発表メモ（話すことのキーワードなど）"></textarea>`;
    li.querySelector('.up').onclick = () => move(p, -1);
    li.querySelector('.down').onclick = () => move(p, 1);
    const cb = li.querySelector('.hide-cb');
    cb.onchange = () => {
      cb.checked ? state.hidden.add(p) : state.hidden.delete(p);
      li.classList.toggle('off', cb.checked);
    };
    const ta = li.querySelector('textarea');
    ta.value = state.memos[p] || '';
    ta.oninput = () => { state.memos[p] = ta.value; store.set(state.pdfKey, state.memos); };
    rows.set(p, li);
    list.append(li);
    renderPage(state.pdf, p, li.querySelector('canvas'), 200, 150);
  }
  refreshNumbers();
}

function move(page, d) {
  const i = state.order.indexOf(page);
  const j = i + d;
  if (j < 0 || j >= state.order.length) return;
  [state.order[i], state.order[j]] = [state.order[j], state.order[i]];
  const list = $('slide-list');
  for (const p of state.order) list.append(rows.get(p));
  refreshNumbers();
  rows.get(page).querySelector(d < 0 ? '.up' : '.down').focus();
}

function refreshNumbers() {
  state.order.forEach((p, i) => {
    const li = rows.get(p);
    li.querySelector('.no').textContent = i + 1;
    li.querySelector('.up').disabled = i === 0;
    li.querySelector('.down').disabled = i === state.order.length - 1;
  });
}

// ---- AIの準備 ----
async function setupAI() {
  const status = $('ai-status');
  const bar = $('ai-progress');
  const loadBtn = $('ai-load');
  const select = $('ai-model');

  if (!(await BuddyBrain.gpuSupported())) {
    status.textContent = 'このブラウザではAIが動かないので、用意したことばで応援します。AIを使うにはパソコン版のChromeかEdgeで開いてください。';
    bar.parentElement.hidden = true;
    return;
  }

  for (const [key, m] of Object.entries(MODELS)) {
    select.add(new Option(m.label, key));
  }
  select.value = store.get('model', 'standard');
  $('model-field').hidden = false;

  const load = async () => {
    const model = MODELS[select.value];
    store.set('model', select.value);
    loadBtn.hidden = true;
    select.disabled = true;
    status.textContent = 'AIを準備しています…';
    try {
      await brain.load(model.id, (p, text) => {
        bar.style.width = `${Math.round(p * 100)}%`;
        status.textContent = `AIを準備しています… ${Math.round(p * 100)}%`;
        if (text) status.title = text;
      });
      bar.style.width = '100%';
      status.textContent = `${state.charName}の準備ができました。発表に合わせて、AIがその場で声かけを考えます。`;
    } catch (err) {
      console.error(err);
      status.textContent = 'AIの準備に失敗しました。用意したことばで応援します。（もう一度試すときはページを再読みこみ）';
      select.disabled = false;
    }
  };

  const showChoice = async () => {
    const cached = await brain.isCached(MODELS[select.value].id);
    if (cached) return load();
    status.textContent = 'AIを使うと、その場のようすに合わせた声かけになります。最初の一回だけダウンロードが必要です（次からはすぐ使えます）。AIなしでも、用意したことばで応援します。';
    loadBtn.textContent = `AIをダウンロード（${MODELS[select.value].label.match(/約[\d.]+GB/)?.[0] || ''}）`;
    loadBtn.hidden = false;
  };

  select.onchange = showChoice;
  loadBtn.onclick = load;
  await showChoice();
}
setupAI();

// ===================== 発表者画面 =====================
let deck = [];
let idx = 0;
let audienceWin = null;
let t0 = 0, timerId = 0, checkId = 0;
let voice = null, gaze = null;
let lastCheerAt = 0, lastLine = '', reachedLast = false;

$('start').addEventListener('click', () => {
  deck = state.order.filter((p) => !state.hidden.has(p));
  if (!deck.length) { alert('表示するスライドが1枚もありません'); return; }
  openAudience();
  enterPresenter();
});

function openAudience() {
  if (audienceWin && !audienceWin.closed) { audienceWin.focus(); return; }
  audienceWin = window.open('audience.html', 'hitorijanai-audience', 'popup,width=960,height=560,left=80,top=80');
  if (!audienceWin) {
    showBubble('ポップアップがブロックされたよ。アドレスバーの右で許可してね', 12000);
  }
}

function sendDeck() {
  channel.postMessage({ type: 'deck', pdf: state.pdfBytes, order: deck, index: idx });
}

channel.onmessage = (e) => {
  const m = e.data;
  if ($('presenter').hidden) return;
  if (m.type === 'hello') sendDeck();
  if (m.type === 'key') handleKey(m.key);
};

async function enterPresenter() {
  idx = 0;
  reachedLast = deck.length === 1;
  $('setup').hidden = true;
  $('presenter').hidden = false;
  startWarmBackground();
  document.title = '発表者ビュー｜ひとりじゃない発表';
  buildPresenterSlides();
  await show();

  t0 = Date.now();
  clearInterval(timerId);
  timerId = setInterval(updateTimer, 1000);
  updateTimer();

  showBubble(`${state.charName}がいっしょにいるよ！`, 6000);
  startSensors();
}

const presenterButtons = [];
function buildPresenterSlides() {
  const list = $('presenter-slides');
  list.replaceChildren();
  presenterButtons.length = 0;
  deck.forEach((page, i) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'presenter-slide';
    button.setAttribute('aria-label', `スライド ${i + 1}`);
    const number = document.createElement('span');
    number.className = 'no';
    number.textContent = i + 1;
    const thumbnail = document.createElement('canvas');
    thumbnail.setAttribute('aria-hidden', 'true');
    button.append(number, thumbnail);
    button.onclick = () => { idx = i; show(); };
    presenterButtons.push(button);
    list.append(button);
    renderPage(state.pdf, page, thumbnail, 200, 124).catch(console.error);
  });
}

async function show() {
  const p = deck[idx];
  const stage = $('stage');
  renderPage(state.pdf, p, $('cur'), stage.clientWidth - 8, stage.clientHeight - 8);
  for (const [i, button] of presenterButtons.entries()) {
    const active = i === idx;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  // Keep the upcoming slide visible before it is selected.
  // Restore the current slide too when navigating back or jumping in the list.
  (presenterButtons[idx + 1] || presenterButtons[idx])?.scrollIntoView({ block: 'nearest' });
  presenterButtons[idx]?.scrollIntoView({ block: 'nearest' });
  $('memo').textContent = state.memos[p] || '';
  $('page-no').textContent = `${idx + 1} / ${deck.length}`;
  $('prev').disabled = idx === 0;
  $('go-next').disabled = idx === deck.length - 1;
  channel.postMessage({ type: 'goto', index: idx });

  if (idx === deck.length - 1 && !reachedLast) {
    reachedLast = true;
    setTimeout(() => showBubble('最後のスライドだよ、あと少し！'), 600);
  }
}

function go(d) {
  const j = idx + d;
  if (j < 0 || j >= deck.length) return;
  idx = j;
  show();
}

function handleKey(key) {
  if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(key)) go(1);
  if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(key)) go(-1);
}

addEventListener('keydown', (e) => {
  if ($('presenter').hidden) return;
  if (e.target.closest('textarea, input, select, [contenteditable="true"]')) return;
  const arrow = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key);
  if (!arrow && e.target.closest('button, summary')) return;
  if ([' ', 'ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Backspace'].includes(e.key)) e.preventDefault();
  handleKey(e.key);
});
$('prev').onclick = () => go(-1);
$('go-next').onclick = () => go(1);
$('reopen').onclick = openAudience;
$('sensor-toggle').onclick = () => { $('sensor').hidden = !$('sensor').hidden; };
$('end').onclick = () => { if (confirm('発表をおわりますか？')) endPresentation(); };

let resizeTimer = 0;
addEventListener('resize', () => {
  if ($('presenter').hidden) return;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(show, 150);
});

function updateTimer() {
  const s = Math.floor((Date.now() - t0) / 1000);
  $('timer').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// ---- ふきだし ----
let bubbleTimer = 0;
function showBubble(text, ms = BUBBLE_MS) {
  const b = $('bubble');
  b.textContent = text;
  b.classList.remove('hide', 'pop');
  void b.offsetWidth;
  b.classList.add('pop');
  const c = $('chara');
  c.classList.remove('cheer');
  void c.offsetWidth; // アニメーションをもう一度動かすため
  c.classList.add('cheer');
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => b.classList.add('hide'), ms);
}

// ---- センサーと声かけ ----
async function startSensors() {
  const useMic = $('opt-mic').checked;
  const useSpeech = $('opt-speech').checked;
  const useCam = $('opt-cam').checked;
  const problems = [];

  if (useMic || useSpeech) {
    try {
      const { VoiceAnalyzer } = await import('./voice.js');
      voice = new VoiceAnalyzer({ useSpeech });
      await voice.start();
    } catch (e) { console.error(e); voice = null; problems.push('マイク'); }
  }
  if (useCam) {
    try {
      const { GazeAnalyzer } = await import('./gaze.js');
      gaze = new GazeAnalyzer($('cam'));
      await gaze.start();
    } catch (e) { console.error(e); gaze = null; problems.push('カメラ'); }
  }
  if (problems.length) {
    showBubble(`${problems.join('と')}が使えないみたい。アドレスバーの左で許可してね`, 12000);
  }

  clearInterval(checkId);
  checkId = setInterval(check, CHECK_EVERY_MS);
}

async function check() {
  const metrics = { ...(voice?.collect() || {}), ...(gaze?.collect() || {}) };
  const { signs, score } = detectSigns(metrics);
  updateSensor(metrics, signs, score);

  const now = Date.now();
  if (score < SPEAK_SCORE || now - lastCheerAt < COOLDOWN_MS || brain.busy) return;
  lastCheerAt = now;
  const line = await brain.cheer({
    signs, name: state.charName, slide: idx + 1, total: deck.length, last: lastLine
  });
  if ($('presenter').hidden) return;
  lastLine = line;
  showBubble(line);
}

function updateSensor(m, signs, score) {
  const fmt = (v, unit = '') => (v === undefined || v === null ? '—' : `${v}${unit}`);
  $('sensor').textContent = [
    `不安スコア   ${score.toFixed(2)}（${SPEAK_SCORE}以上で声かけ）`,
    `サイン       ${signs.map((s) => s.label).join('、') || 'なし'}`,
    `最長の沈黙   ${fmt(m.longestSilenceSec, '秒')}`,
    `話す速さ     ${fmt(m.charsPerMin, '字/分')}`,
    `フィラー     ${fmt(m.fillerCount, '回')}`,
    `声のゆれ     ${fmt(m.volumeVariation)}`,
    `下向き       ${fmt(m.lookDownRatio)}`,
    `目線の移動   ${fmt(m.gazeShiftsPerMin, '回/分')}`,
    `まばたき     ${fmt(m.blinksPerMin, '回/分')}`,
    `AI           ${brain.ready ? 'ブラウザ内AI' : '用意したことば'}`
  ].join('\n');
}

function endPresentation() {
  stopWarmBackground();
  clearInterval(timerId);
  clearInterval(checkId);
  voice?.stop(); gaze?.stop();
  voice = gaze = null;
  channel.postMessage({ type: 'end' });
  try { audienceWin?.close(); } catch { }
  audienceWin = null;
  $('bubble').classList.add('hide');
  $('presenter').hidden = true;
  $('setup').hidden = false;
  startWarmBackground();
  document.title = 'ひとりじゃない発表';
  setTimeout(() => alert(`おつかれさま！ ${state.charName}もずっと見てたよ。`), 50);
}

addEventListener('beforeunload', () => {
  if (!$('presenter').hidden) channel.postMessage({ type: 'end' });
});

// Freely moving circles with wall and circle collision handling.
let warmFrame = 0;
function stopWarmBackground() {
  cancelAnimationFrame(warmFrame);
  warmFrame = 0;
}
function startWarmBackground() {
  stopWarmBackground();
  const layer = document.querySelector('.warm-background');
  const orbs = [...layer.querySelectorAll('.warm-orb')];
  const w = layer.clientWidth, h = layer.clientHeight;
  const radius = Math.min(w, h) * .245;
  const diameter = radius * 2;
  const speed = Math.min(w, h) * .09;
  const balls = [];
  // Rejection sampling gives a new scattered starting arrangement each time.
  for (let i = 0; i < orbs.length; i++) {
    let point;
    for (let attempt = 0; attempt < 1000; attempt++) {
      const candidate = { x: radius + Math.random() * (w - diameter), y: radius + Math.random() * (h - diameter) };
      if (balls.every(b => Math.hypot(b.x - candidate.x, b.y - candidate.y) >= diameter + 2)) {
        point = candidate; break;
      }
    }
    if (!point) {
      // Retry the whole arrangement rather than reserving fixed territories.
      startWarmBackground(); return;
    }
    const angle = Math.random() * Math.PI * 2;
    const phase = Math.random() * Math.PI * 2;
    balls.push({ ...point, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      radius: radius * (.87 + .13 * Math.sin(phase)), phase,
      period: 22 + Math.random() * 24, turn: 1 + Math.random() * 3,
      blur: 28 + Math.random() * 24, blurFrom: 28, blurTarget: 35 + Math.random() * 105,
      blurElapsed: 0, blurDuration: 8 + Math.random() * 10 });
    balls[i].blurFrom = balls[i].blur;
    orbs[i].style.width = orbs[i].style.height = `${diameter}px`;
  }
  const paint = () => balls.forEach((b, i) => {
    orbs[i].style.width = orbs[i].style.height = `${b.radius * 2}px`;
    orbs[i].style.filter = `blur(${b.blur}px)`;
    orbs[i].style.transform = `translate(${b.x - b.radius}px, ${b.y - b.radius}px)`;
  });
  paint();
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let previous = performance.now();
  let gentleProgress = 0;
  function step(dt) {
    const targetProgress = $('presenter').hidden ? 0 : (deck.length > 1 ? idx / (deck.length - 1) : 1);
    gentleProgress += (targetProgress - gentleProgress) * (1 - Math.exp(-dt / 10));
    if (Math.abs(targetProgress - gentleProgress) < .0001) gentleProgress = targetProgress;
    for (const b of balls) {
      b.blurElapsed += dt;
      const progress = Math.min(1, b.blurElapsed / b.blurDuration);
      const eased = progress * progress * (3 - 2 * progress);
      b.blur = b.blurFrom + (b.blurTarget - b.blurFrom) * eased;
      if (progress >= 1) {
        b.blurFrom = b.blur;
        b.blurTarget = 28 + Math.random() * 112;
        b.blurElapsed = 0;
        b.blurDuration = 8 + Math.random() * 10;
      }
      b.phase += dt * Math.PI * 2 / b.period;
      const minimumScale = .74 + 2.26 * gentleProgress;
      const wave = (Math.sin(b.phase) + 1) / 2;
      const targetRadius = radius * (minimumScale + (3 - minimumScale) * wave);
      b.radius += (targetRadius - b.radius) * (1 - Math.exp(-dt / 4));
      b.turn -= dt;
      if (b.turn <= 0) {
        const a = Math.atan2(b.vy, b.vx) + (Math.random() - .5) * 1.5;
        const v = speed * (.8 + Math.random() * .5);
        b.vx = Math.cos(a) * v; b.vy = Math.sin(a) * v;
        b.turn = 1.5 + Math.random() * 3;
      }
      b.x += b.vx * dt; b.y += b.vy * dt;
    }
    // Several passes handle simultaneous contacts without letting circles merge.
    for (let pass = 0; pass < 24; pass++) {
      for (const b of balls) {
        // Centers remain on screen, so even very large circles stay visible.
        if (b.x < 0) { b.x = 0; b.vx = Math.abs(b.vx); }
        if (b.x > w) { b.x = w; b.vx = -Math.abs(b.vx); }
        if (b.y < 0) { b.y = 0; b.vy = Math.abs(b.vy); }
        if (b.y > h) { b.y = h; b.vy = -Math.abs(b.vy); }
      }
      for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) {
        const a = balls[i], b = balls[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const distance = Math.hypot(dx, dy);
        // Partial overlap is allowed; prevent complete containment or stacking.
        const separation = Math.max(
          Math.abs(a.radius - b.radius) + Math.min(a.radius, b.radius) * .25,
          (a.radius + b.radius) * .4
        );
        if (distance >= separation) continue;
        const nx = distance ? dx / distance : 1, ny = distance ? dy / distance : 0;
        const push = (separation - distance) / 2;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
        const closing = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (closing < 0) {
          a.vx += closing * nx; a.vy += closing * ny;
          b.vx -= closing * nx; b.vy -= closing * ny;
        }
      }
    }
  }
  function frame(now) {
    let elapsed = Math.min((now - previous) / 1000, .05);
    previous = now;
    while (elapsed > 0) { const dt = Math.min(elapsed, 1 / 120); step(dt); elapsed -= dt; }
    paint();
    warmFrame = requestAnimationFrame(frame);
  }
  warmFrame = requestAnimationFrame(frame);
}
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => {
  startWarmBackground();
});
addEventListener('resize', () => {
  startWarmBackground();
});

// Start the shared background immediately on the preparation screen.
startWarmBackground();
