// 聴衆用の画面：スライドだけを映す。キャラもメモも出さない
import { loadPdf, renderPage } from './slides.js';

const channel = new BroadcastChannel('hitorijanai');
const canvas = document.getElementById('slide');
const overlay = document.getElementById('overlay');
const wait = document.getElementById('wait');
let pdf = null, order = [], idx = 0;

function draw() {
  if (pdf) renderPage(pdf, order[idx], canvas, innerWidth, innerHeight);
}

channel.onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'deck') {
    order = m.order;
    idx = m.index;
    pdf = await loadPdf(m.pdf);
    wait.textContent = 'つながりました';
    draw();
  }
  if (m.type === 'goto') { idx = m.index; draw(); }
  if (m.type === 'end') window.close();
};

// 発表者の画面からスライドを受け取るまで呼びかける
const hello = setInterval(() => {
  if (pdf) clearInterval(hello);
  else channel.postMessage({ type: 'hello' });
}, 500);
channel.postMessage({ type: 'hello' });

// 全画面：プロジェクター（メインではない画面）があれば、そちらで全画面にする
document.getElementById('fs').addEventListener('click', async () => {
  const root = document.documentElement;
  try {
    if ('getScreenDetails' in window) {
      const d = await window.getScreenDetails();
      const target = d.currentScreen.isPrimary
        ? (d.screens.find((s) => !s.isPrimary) || d.currentScreen)
        : d.currentScreen;
      await root.requestFullscreen({ screen: target });
      return;
    }
  } catch (err) {
    console.warn('画面の選択に失敗したので、今の画面で全画面にします', err);
  }
  try { await root.requestFullscreen(); } catch {
    wait.textContent = 'もう一度ボタンを押してください';
  }
});

document.addEventListener('fullscreenchange', () => {
  overlay.hidden = !!document.fullscreenElement;
  setTimeout(draw, 100);
});

// クリッカーや矢印キーは発表者の画面に伝える
addEventListener('keydown', (e) => {
  const keys = ['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'];
  if (!keys.includes(e.key)) return;
  e.preventDefault();
  channel.postMessage({ type: 'key', key: e.key });
});

addEventListener('resize', draw);

// しばらく動かさないとマウスカーソルを隠す
let idleTimer = 0;
addEventListener('mousemove', () => {
  document.body.classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => document.body.classList.add('idle'), 2000);
});
