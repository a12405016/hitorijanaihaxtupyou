// カメラの分析：MediaPipeの顔ランドマークで目線の動きを測る
// 映像はこのパソコンの中だけで処理し、どこにも送らない
import { FaceLandmarker, FilesetResolver }
  from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2/vision_bundle.mjs';

const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2/wasm';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export class GazeAnalyzer {
  constructor(video) {
    this.video = video;
  }

  async start() {
    const fileset = await FilesetResolver.forVisionTasks(WASM);
    this.landmarker = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' },
      outputFaceBlendshapes: true,
      runningMode: 'VIDEO',
      numFaces: 1
    });
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' }
    });
    this.video.srcObject = this.stream;
    await this.video.play();

    this.prevGaze = null;
    this.eyesClosed = false;
    this.lastTs = 0;
    this.reset();
    this.timer = setInterval(() => this.tick(), 66); // 約15回/秒で十分
  }

  reset() {
    this.frames = 0;
    this.faceFrames = 0;
    this.downFrames = 0;
    this.shifts = 0;
    this.blinks = 0;
    this.windowStart = Date.now();
  }

  tick() {
    if (this.video.readyState < 2) return;
    const ts = Math.max(performance.now(), this.lastTs + 1);
    this.lastTs = ts;
    let res;
    try { res = this.landmarker.detectForVideo(this.video, ts); } catch { return; }
    this.frames++;
    const shapes = res.faceBlendshapes?.[0]?.categories;
    if (!shapes) return;
    this.faceFrames++;
    const get = (name) => shapes.find((c) => c.categoryName === name)?.score ?? 0;

    // 下を向いている（原稿や手元ばかり見ている）
    const down = (get('eyeLookDownLeft') + get('eyeLookDownRight')) / 2;
    if (down > 0.45) this.downFrames++;

    // 左右の目線が大きく動いた回数 ＝ 目が泳ぐ
    const gx = (get('eyeLookOutLeft') - get('eyeLookInLeft') + get('eyeLookInRight') - get('eyeLookOutRight')) / 2;
    if (this.prevGaze !== null && Math.abs(gx - this.prevGaze) > 0.35) this.shifts++;
    this.prevGaze = gx;

    // まばたき
    const blink = (get('eyeBlinkLeft') + get('eyeBlinkRight')) / 2;
    if (blink > 0.6 && !this.eyesClosed) { this.blinks++; this.eyesClosed = true; }
    if (blink < 0.3) this.eyesClosed = false;
  }

  collect() {
    const minutes = Math.max((Date.now() - this.windowStart) / 60000, 1 / 60);
    const result = {
      faceVisibleRatio: this.frames ? +(this.faceFrames / this.frames).toFixed(2) : 0,
      lookDownRatio: this.faceFrames ? +(this.downFrames / this.faceFrames).toFixed(2) : 0,
      gazeShiftsPerMin: Math.round(this.shifts / minutes),
      blinksPerMin: Math.round(this.blinks / minutes)
    };
    this.reset();
    return result;
  }

  stop() {
    clearInterval(this.timer);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.landmarker?.close();
  }
}
