#!/usr/bin/env node
// Evaluate an expression in the running DSH host via its Node inspector (9230).
// Usage: node script/cdp-eval.mjs '<expression>' [port]
const port = process.argv[3] || 9230;
const expr = process.argv[2];
const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const target = list.find((t) => t.webSocketDebuggerUrl);
if (!target) { console.error('no inspector target'); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
const timer = setTimeout(() => { console.error('timeout'); process.exit(1); }, 15000);
ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true } }));
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id === 1) {
    clearTimeout(timer);
    console.log(JSON.stringify(msg.result?.result?.value ?? msg.result ?? msg, null, 2)?.slice(0, 6000));
    ws.close();
    process.exit(0);
  }
};