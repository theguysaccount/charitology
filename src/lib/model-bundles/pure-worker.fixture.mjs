import { parentPort } from 'node:worker_threads';
globalThis.self = { addEventListener(type, listener) { if (type === 'message') parentPort.on('message', data => listener({ data })); },
  postMessage(value, transfer) { parentPort.postMessage(value, transfer); }, close() { parentPort.close(); } };
await import('./model-worker.mjs');
