// 不安のサインを見つけて、用意したことばの中からAIが今に合う一言を選ぶ
// AIは文章を作らず「番号」を選ぶだけなので、変な日本語は出ない
const WEBLLM = 'https://esm.run/@mlc-ai/web-llm@0.2.87';

export const MODELS = {
  standard: { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', label: 'ふつう（約1GB・選び方がじょうず）' },
  light: { id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', label: 'かるい（約0.3GB・古いパソコン向け）' }
};

// ---------- 不安のサイン ----------
// しきい値は仮の値。リハーサルで「センサー」を見ながら調整してください
const SIGNS = [
  { key: 'silence', weight: 0.25, label: 'ことばにつまって長く黙っている', test: (m) => m.longestSilenceSec > 4 },
  { key: 'fast', weight: 0.2, label: '早口になっている', test: (m) => m.charsPerMin != null && m.charsPerMin > 420 },
  { key: 'filler', weight: 0.15, label: '「えーと」「あの」が多い', test: (m) => m.fillerCount != null && m.fillerCount >= 2 },
  { key: 'shaky', weight: 0.1, label: '声の大きさがゆれている', test: (m) => m.speakingRatio > 0.2 && m.volumeVariation > 0.6 },
  { key: 'down', weight: 0.15, label: 'ずっと下を向いている', test: (m) => m.faceVisibleRatio > 0.5 && m.lookDownRatio > 0.6 },
  { key: 'gaze', weight: 0.1, label: '目線がきょろきょろ泳いでいる', test: (m) => m.gazeShiftsPerMin > 40 },
  { key: 'blink', weight: 0.05, label: 'まばたきが多い', test: (m) => m.blinksPerMin > 35 }
];

export function detectSigns(metrics) {
  const found = SIGNS.filter((s) => s.test(metrics));
  const score = Math.min(1, +found.reduce((a, s) => a + s.weight, 0).toFixed(2));
  return { signs: found, score };
}

// ---------- 用意したことば（約100個・自由に足してOK・短いほど読みやすい） ----------
const LINES = {
  silence: [ // 16
    'ゆっくりで大丈夫だよ', '思い出すまで待ってるよ', '一回、深呼吸しよう', '間があっても平気だよ',
    'メモを見てもいいよ', 'あわてなくていいよ', '次のひとことだけ考えよう', '止まっても大丈夫',
    'スライドを見てみよう', '沈黙も発表のうちだよ', 'みんな待っててくれるよ', '水を飲んでもいいよ',
    'キーワードを思い出そう', '言いたいことは一つでOK', 'ここまで話せてるよ', '落ち着いて、大丈夫'
  ],
  fast: [ // 14
    '少しゆっくり話そう', 'あわてなくて大丈夫', '一文ずつ、ていねいに', '時間はまだあるよ',
    '句読点で一息つこう', 'ゆっくりの方が伝わるよ', 'いったん深呼吸しよう', '半分の速さでいいよ',
    '大事なところはゆっくり', '聞く人のペースでね', '一つ話したら一息', '急がなくていいよ',
    'ゆったりいこう', '言葉をかみしめて'
  ],
  filler: [ // 14
    '一息ついてから話そう', '間があっても大丈夫', '黙ってもいいんだよ', '言葉を選べてえらいよ',
    'ゆっくり区切って話そう', '落ち着いてるよ、平気', 'キーワードだけでOK', '「えーと」は息に変えよう',
    '短い文で話そう', '結論から言ってみよう', '考えながらで大丈夫', '一呼吸おいてみよう',
    'ちゃんと伝わってるよ', '言い直しても大丈夫'
  ],
  shaky: [ // 12
    '深呼吸、すーはー', '声、ちゃんと届いてるよ', '肩の力をぬこう', 'お腹から声を出そう',
    'ちゃんと聞こえてるよ', 'その調子、いい声だよ', '足の裏に力を入れよう', 'ゆっくり息をはこう',
    '緊張はがんばってる証拠', 'ドキドキしても大丈夫', '背すじをのばしてみよう', '声がよく通ってるよ'
  ],
  down: [ // 13
    '顔を上げてみよう', 'みんな聞いてくれてるよ', '前を見ても大丈夫', '一人の顔を見てみよう',
    '目線をちょっと上に', '聞いてる人がいるよ', 'いちばん後ろを見てみよう', '笑顔で前を見よう',
    'メモは一瞬見るだけで', 'あごを少し上げよう', '会場を見わたしてみて', 'みんなの方を向こう',
    '顔を上げるとかっこいい'
  ],
  gaze: [ // 11
    '聞いてる人を一人見て', 'うなずいてる人を探そう', '一人に話しかけるように', 'やさしい顔の人を見よう',
    '目線は一か所でOK', '友だちを見つけてみよう', '一文ごとに一人を見よう', '正面を見てみよう',
    '目線をゆっくり動かそう', 'うなずく人は味方だよ', '一人ずつ話しかけよう'
  ],
  blink: [ // 8
    'ひと呼吸おこう', 'リラックスしていこう', '肩をストンと落とそう', 'ゆっくりまばたきしよう',
    '力をぬいていこう', '目をやすめてもいいよ', 'ほっと一息つこう', 'だいじょうぶ、だいじょうぶ'
  ],
  default: [ // 14
    'いい調子だよ', 'ひとりじゃないよ', 'ちゃんと伝わってるよ', 'そばにいるよ',
    'その調子！', '応援してるよ', 'がんばってるね', 'あなたらしくていいよ',
    'すてきな発表だよ', '練習の成果が出てるよ', 'ここまで来たね', 'うまくいってるよ',
    '自信もっていこう', 'わたしがついてるよ'
  ]
};

// 今のサインに合う候補を集める（直前と同じ言葉は外す）
function candidates(signs, last) {
  const keys = signs.length ? signs.map((s) => s.key) : ['default'];
  const pool = [];
  for (const k of keys) for (const t of shuffle(LINES[k] || [])) if (!pool.includes(t)) pool.push(t);
  for (const t of shuffle(LINES.default)) if (!pool.includes(t)) pool.push(t);
  return pool.filter((t) => t !== last);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// AIなしで選ぶとき：いちばん強いサインの言葉から、ランダムに
export function fallbackLine(signs, last = '', recent = []) {
  const key = signs[0]?.key || 'default';
  let pool = (LINES[key] || LINES.default).filter((t) => t !== last && !recent.includes(t));
  if (!pool.length) pool = LINES[key] || LINES.default;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ---------- ブラウザ内AI（選ぶ係） ----------
export class BuddyBrain {
  constructor() {
    this.engine = null;
    this.modelId = null;
    this.busy = false;
    this.recent = []; // 最近出した言葉（くり返しを減らす）
  }

  static async gpuSupported() {
    if (!('gpu' in navigator)) return false;
    try { return !!(await navigator.gpu.requestAdapter()); } catch { return false; }
  }

  async isCached(modelId) {
    try {
      const webllm = await import(WEBLLM);
      return await webllm.hasModelInCache(modelId);
    } catch { return false; }
  }

  async load(modelId, onProgress) {
    const webllm = await import(WEBLLM);
    const worker = new Worker(new URL('./ai-worker.js', import.meta.url), { type: 'module' });
    this.engine = await webllm.CreateWebWorkerMLCEngine(worker, modelId, {
      initProgressCallback: (r) => onProgress?.(r.progress ?? 0, r.text ?? '')
    });
    this.modelId = modelId;
  }

  get ready() { return !!this.engine; }

  remember(line) {
    this.recent.push(line);
    if (this.recent.length > 10) this.recent.shift();
    return line;
  }

  async cheer({ signs, slide, total, last }) {
    let pool = candidates(signs, last).filter((t) => !this.recent.includes(t));
    if (pool.length < 3) pool = candidates(signs, last);
    // 候補が多すぎると小さいAIが迷うので、8個までに絞る（サインに合う言葉が先頭・毎回シャッフル）
    const shown = pool.slice(0, 8);
    const fallback = () => this.remember(fallbackLine(signs, last, this.recent));

    if (!this.engine || this.busy) return fallback();
    this.busy = true;
    try {
      const situation = signs.length ? signs.map((s) => s.label).join('、') : '少し緊張している';
      const list = shown.map((t, i) => `${i + 1}. ${t}`).join('\n');
      const messages = [
        {
          role: 'system',
          content: '発表者を応援する一言を、候補の中から一つだけ選びます。答えは番号の数字だけを書きます。'
        },
        {
          role: 'user',
          content: `発表者のようす：${situation}（スライド ${slide}/${total}）\n\n候補：\n${list}\n\nいちばん合う候補の番号を数字だけで答えてください。`
        }
      ];
      const reply = await withTimeout(
        this.engine.chat.completions.create({ messages, temperature: 0.7, max_tokens: 4 }),
        5000
      );
      const n = parseInt((reply?.choices?.[0]?.message?.content || '').match(/\d+/)?.[0], 10);
      if (n >= 1 && n <= shown.length) return this.remember(shown[n - 1]);
      return fallback();
    } catch (e) {
      console.warn('AIの選択に失敗したので、用意したことばから選びます', e);
      return fallback();
    } finally {
      this.busy = false;
    }
  }
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}