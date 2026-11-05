// マイクの分析：沈黙の長さ・声の大きさのゆれ・話す速さ・「えーと」などのフィラー
const FILLERS = ['えーと', 'えっと', 'えー', 'あのー', 'あの', 'うーん', 'まあ', 'なんか'];

export class VoiceAnalyzer {
  constructor({ useSpeech = true } = {}) {
    this.useSpeech = useSpeech;
    this.speechAvailable = false;
    this.stopped = false;
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true }
    });
    this.ctx = new AudioContext();
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    src.connect(this.analyser);
    this.buf = new Float32Array(this.analyser.fftSize);

    this.noiseFloor = 0.01;   // 会場の静かさに合わせて自動で更新する
    this.silenceStart = null;
    this.reset();
    this.timer = setInterval(() => this.sample(), 100);
    if (this.useSpeech) this.startRecognition();
  }

  reset() {
    this.volumes = [];
    this.longestSilence = 0;
    this.chars = 0;
    this.fillers = 0;
    this.lastText = '';
    this.windowStart = Date.now();
  }

  sample() {
    this.analyser.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
    const rms = Math.sqrt(sum / this.buf.length);

    // いちばん静かなときの音量をゆっくり学習する
    this.noiseFloor = rms < this.noiseFloor
      ? this.noiseFloor * 0.9 + rms * 0.1
      : this.noiseFloor * 0.999 + rms * 0.001;
    const threshold = Math.max(0.008, this.noiseFloor * 2.5);

    const now = Date.now();
    if (rms < threshold) {
      if (!this.silenceStart) this.silenceStart = now;
      this.longestSilence = Math.max(this.longestSilence, (now - this.silenceStart) / 1000);
    } else {
      this.silenceStart = null;
      this.volumes.push(rms);
    }
  }

  startRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    this.speechAvailable = true;
    const rec = new SR();
    rec.lang = 'ja-JP';
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (!e.results[i].isFinal) continue;
        const text = e.results[i][0].transcript.replace(/\s/g, '');
        this.chars += text.length;
        this.lastText = text.slice(-30);
        let rest = text;
        for (const f of FILLERS) {
          const n = rest.split(f).length - 1;
          this.fillers += n;
          rest = rest.split(f).join(''); // 「えーと」を「えー」で二重に数えない
        }
      }
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') this.speechAvailable = false;
    };
    rec.onend = () => { if (!this.stopped && this.speechAvailable) setTimeout(() => { try { rec.start(); } catch {} }, 300); };
    try { rec.start(); } catch { this.speechAvailable = false; }
    this.rec = rec;
  }

  // 直近の区間の数値を返して、次の区間のためにリセットする
  collect() {
    const minutes = Math.max((Date.now() - this.windowStart) / 60000, 1 / 60);
    const n = this.volumes.length;
    const mean = n ? this.volumes.reduce((a, b) => a + b, 0) / n : 0;
    const sd = n ? Math.sqrt(this.volumes.reduce((a, b) => a + (b - mean) ** 2, 0) / n) : 0;
    const result = {
      longestSilenceSec: +this.longestSilence.toFixed(1),
      speakingRatio: +Math.min(1, n / (minutes * 600)).toFixed(2), // 声が出ていた時間の割合
      volumeVariation: mean ? +(sd / mean).toFixed(2) : 0,
      charsPerMin: this.speechAvailable ? Math.round(this.chars / minutes) : null,
      fillerCount: this.speechAvailable ? this.fillers : null
    };
    this.reset();
    return result;
  }

  stop() {
    this.stopped = true;
    clearInterval(this.timer);
    try { this.rec?.stop(); } catch {}
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close();
  }
}
