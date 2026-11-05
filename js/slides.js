// PDFの読みこみと描画（準備画面・発表者画面・聴衆用画面で共通）
import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.5.438/build/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.5.438/build/pdf.worker.min.mjs';

// bytes は Uint8Array。pdf.js は渡したデータを使い切ってしまうので、毎回コピーを渡す
export function loadPdf(bytes) {
  return pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
}

const tasks = new WeakMap(); // canvas → 描画中のタスク（同じcanvasへの二重描画を防ぐ）

// maxW × maxH（CSSピクセル）に収まるように1ページを描く
export async function renderPage(pdf, pageNo, canvas, maxW, maxH) {
  tasks.get(canvas)?.cancel();
  const page = await pdf.getPage(pageNo);
  const base = page.getViewport({ scale: 1 });
  const fit = Math.max(0.05, Math.min(maxW / base.width, maxH / base.height));
  const dpr = window.devicePixelRatio || 1;
  const viewport = page.getViewport({ scale: fit * dpr });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
  canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
  const task = page.render({ canvas, viewport });
  tasks.set(canvas, task);
  try {
    await task.promise;
  } catch (e) {
    if (e?.name !== 'RenderingCancelledException') throw e;
  } finally {
    if (tasks.get(canvas) === task) tasks.delete(canvas);
  }
}
