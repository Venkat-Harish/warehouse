/**
 * compress.worker.js
 * Web Worker: gzip-compresses a File using the native CompressionStream API.
 *
 * Messages IN:  { file: File }
 * Messages OUT:
 *   { type: 'log',      level: 'DEBUG'|'INFO'|'WARN'|'ERROR', message: string, data?: any }
 *   { type: 'progress', phase: 'compressing', percent: 0-100 }
 *   { type: 'done',     compressed: Uint8Array, originalSize, compressedSize }
 *   { type: 'error',    message: string }
 */

function log(level, message, data) {
  self.postMessage({ type: 'log', level, message, data });
}

self.onmessage = async (e) => {
  const { file } = e.data;

  log('INFO', `Worker started | file="${file.name}" size=${(file.size/1024/1024).toFixed(2)}MB`);

  try {
    self.postMessage({ type: 'progress', phase: 'compressing', percent: 5 });

    log('DEBUG', 'Reading file as ArrayBuffer…');
    const arrayBuffer = await file.arrayBuffer();
    log('DEBUG', `ArrayBuffer ready | bytes=${arrayBuffer.byteLength}`);

    self.postMessage({ type: 'progress', phase: 'compressing', percent: 20 });

    log('DEBUG', 'Starting CompressionStream (gzip)…');
    const cs = new CompressionStream('gzip');
    const writer = cs.writable.getWriter();
    const reader = cs.readable.getReader();

    writer.write(new Uint8Array(arrayBuffer));
    writer.close();

    self.postMessage({ type: 'progress', phase: 'compressing', percent: 40 });
    log('DEBUG', 'Collecting compressed chunks…');

    const chunks = [];
    let done = false;
    while (!done) {
      const { value, done: streamDone } = await reader.read();
      if (streamDone) { done = true; break; }
      chunks.push(value);
    }

    log('DEBUG', `Collected ${chunks.length} compressed chunk(s)`);
    self.postMessage({ type: 'progress', phase: 'compressing', percent: 85 });

    const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
    const compressed = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of chunks) { compressed.set(chunk, offset); offset += chunk.length; }

    const ratio = (file.size / totalLen).toFixed(1);
    log('INFO', `Compression done | ${(file.size/1024/1024).toFixed(2)}MB → ${(totalLen/1024/1024).toFixed(2)}MB (${ratio}x ratio)`);

    self.postMessage({ type: 'progress', phase: 'compressing', percent: 100 });
    self.postMessage(
      { type: 'done', compressed, originalSize: arrayBuffer.byteLength, compressedSize: compressed.byteLength },
      [compressed.buffer]
    );
  } catch (err) {
    log('ERROR', `Worker failed: ${err.message}`);
    self.postMessage({ type: 'error', message: err.message });
  }
};
