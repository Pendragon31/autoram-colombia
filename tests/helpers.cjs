const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
const { randomUUID } = require('node:crypto');
function evaluate(file, requireStub, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: requireStub, console, Date, Number, URL, Response, Buffer, ...globals });
  return exports;
}
const errors = evaluate('lib/errors.ts', () => {});
function offlineStore(globals = {}) {
  const records = new Map();
  const db = { close() {}, transaction() {
    const t = {};
    const request = result => { const r = { result }; queueMicrotask(() => t.oncomplete?.()); return r; };
    t.objectStore = () => ({ getAll: () => request([...records.values()]), put: item => { records.set(item.id, item); return request(item.id); }, delete: id => { records.delete(id); return request(); } });
    return t;
  } };
  const indexedDB = { open() { const req = { result: db }; queueMicrotask(() => req.onsuccess()); return req; } };
  const module = evaluate('lib/offline-queue.ts', () => errors, { indexedDB, navigator: { onLine: true }, crypto: { randomUUID }, console: { warn() {} }, ...globals });
  return { ...module, records };
}
module.exports = { evaluate, errors, offlineStore };
