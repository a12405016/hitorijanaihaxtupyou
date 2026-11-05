// ブラウザ内AI（WebLLM）を画面とは別のスレッドで動かす。発表中の画面がカクつかないようにするため
import { WebWorkerMLCEngineHandler } from 'https://esm.run/@mlc-ai/web-llm@0.2.87';

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg) => handler.onmessage(msg);
