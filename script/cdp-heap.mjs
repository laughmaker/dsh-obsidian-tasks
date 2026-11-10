#!/usr/bin/env node
// Take a heap snapshot of the running DSH host via its Node inspector (9230).
// Usage: node script/cdp-heap.mjs <out-file> [port]
import { createWriteStream } from 'node:fs';
const port = process.argv[3] || 9230;
const out = process.argv[2] || `${process.env.HOME}/tmp/host.heapsnapshot`;
const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const target = list.find((t) => t.webSocketDebuggerUrl);
if (!target) { console.error('no inspector target'); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
const file = createWriteStream(out);
const timer = setTimeout(() => { console.error('timeout'); process.exit(1); }, 120000);
let id = 0;
const send = (method, params) => ws.send(JSON.stringify({ id: ++id, method, params }));
ws.onopen = () => send('HeapProfiler.takeHeapSnapshot', { reportProgress: false, captureNumericValue: false });
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.method === 'HeapProfiler.addHeapSnapshotChunk') file.write(msg.params.chunk);
  if (msg.id === 1) {
    clearTimeout(timer);
    file.end();
    console.log('saved', out);
    ws.close();
    process.exit(0);
  }
};