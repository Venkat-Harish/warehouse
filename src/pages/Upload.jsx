import { useRef, useState, useCallback, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../services/api';
import logger from '../utils/logger';

/* ── Phase labels ──────────────────────────────────────────────────────── */
const PHASE_LABELS = {
  idle:        '',
  compressing: '🗜️  Compressing file…',
  uploading:   '📡  Uploading to server…',
  queued:      '⏳  Queued for processing…',
  parsing:     '🔍  Parsing & cleaning CSV…',
  sorting:     '🔀  Sorting by WID…',
  copying:     '💾  Writing to database…',
  done:        '✅  Done!',
  failed:      '❌  Import failed',
};

const LEVEL_COLORS = {
  DEBUG: '#94a3b8',
  INFO:  '#38bdf8',
  WARN:  '#fbbf24',
  ERROR: '#f87171',
};

/* ── LogPanel component ────────────────────────────────────────────────── */
function LogPanel({ entries, onClear }) {
  const bottomRef = useRef(null);

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries.length]);

  return (
    <div style={{
      background: '#0f172a',
      border: '1px solid rgba(148,163,184,0.15)',
      borderRadius: 10,
      marginTop: 16,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 14px',
        background: 'rgba(255,255,255,0.04)',
        borderBottom: '1px solid rgba(148,163,184,0.1)',
      }}>
        <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#64748b', letterSpacing: 1 }}>
          🖥 FRONTEND LOGS — {entries.length} entries
        </span>
        <button
          onClick={onClear}
          style={{
            background: 'none', border: '1px solid rgba(148,163,184,0.2)',
            borderRadius: 4, color: '#64748b', fontSize: 11,
            padding: '2px 8px', cursor: 'pointer',
          }}
        >
          Clear
        </button>
      </div>

      {/* Log lines */}
      <div style={{ maxHeight: 280, overflowY: 'auto', padding: '8px 0' }}>
        {entries.length === 0 ? (
          <div style={{ color: '#475569', fontFamily: 'monospace', fontSize: 12, padding: '8px 14px' }}>
            No logs yet. Start an import to see activity.
          </div>
        ) : (
          entries.map(e => (
            <div key={e.id} style={{
              fontFamily: 'monospace',
              fontSize: 11,
              lineHeight: '1.6',
              padding: '1px 14px',
              display: 'flex',
              gap: 8,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}>
              <span style={{ color: '#475569', flexShrink: 0 }}>{e.ts.split(' ')[1]}</span>
              <span style={{ color: LEVEL_COLORS[e.level] || '#94a3b8', flexShrink: 0, width: 38 }}>
                {e.level}
              </span>
              <span style={{ color: '#7dd3fc', flexShrink: 0, width: 80 }}>[{e.module}]</span>
              <span style={{ color: '#e2e8f0' }}>{e.message}</span>
              {e.data !== undefined && (
                <span style={{ color: '#64748b' }}>
                  {typeof e.data === 'object' ? JSON.stringify(e.data) : String(e.data)}
                </span>
              )}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

/* ── Main Upload page ──────────────────────────────────────────────────── */
export default function UploadPage() {
  const fileInputRef = useRef(null);
  const pollRef      = useRef(null);

  const [file, setFile]         = useState(null);
  const [phase, setPhase]       = useState('idle');
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState('');
  const [result, setResult]     = useState(null);
  const [dragover, setDragover] = useState(false);
  const [sizeInfo, setSizeInfo] = useState(null);
  const [logEntries, setLogEntries] = useState([]);
  const [showLogs, setShowLogs] = useState(true);

  const isActive = phase !== 'idle' && phase !== 'done' && phase !== 'failed';

  // Subscribe to logger ring buffer
  useEffect(() => {
    const unsub = logger.subscribe(entries => setLogEntries(entries));
    return unsub;
  }, []);

  /* ── File selection ──────────────────────────────────────────────────── */
  const handleFile = (f) => {
    if (!f) return;
    if (!f.name.endsWith('.csv')) {
      logger.warn('Upload', 'Rejected file — not a CSV', { name: f.name });
      toast.error('Only .csv files accepted');
      return;
    }
    logger.info('Upload', 'File selected', { name: f.name, sizeMB: (f.size/1024/1024).toFixed(2) });
    setFile(f); setResult(null); setPhase('idle'); setProgress(0); setSizeInfo(null);
  };

  /* ── Polling ─────────────────────────────────────────────────────────── */
  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  const startPolling = useCallback((jobId) => {
    logger.debug('Polling', `Starting poll for job ${jobId} every 2s`);
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get(`/products/import-status/${jobId}`);
        logger.debug('Polling', `Job ${jobId} status`, { status: data.status, progress: data.progress, message: data.message });

        setPhase(data.status);
        setProgress(data.progress);
        setStatusMsg(data.message);

        if (data.status === 'done') {
          stopPolling();
          logger.info('Polling', `Job ${jobId} DONE`, { imported: data.imported, errors: data.errors });
          setResult({ imported: data.imported, errors: data.errors });
          setFile(null);
          toast.success(`✅ ${data.imported.toLocaleString()} records imported!`);
        } else if (data.status === 'failed') {
          stopPolling();
          logger.error('Polling', `Job ${jobId} FAILED`, { message: data.message });
          toast.error(data.message || 'Import failed');
        }
      } catch (err) {
        logger.error('Polling', `Poll request failed for job ${jobId}`, err.message);
      }
    }, 2000);
  }, []);

  /* ── Main handler ────────────────────────────────────────────────────── */
  const handleUpload = async () => {
    if (!file || isActive) return;
    setResult(null);
    logger.clear();
    logger.info('Upload', '=== Import started ===', { file: file.name, sizeMB: (file.size/1024/1024).toFixed(2) });

    /* Step 1: Compress -------------------------------------------------- */
    setPhase('compressing');
    setProgress(0);
    setStatusMsg('Reading and compressing file…');

    logger.info('Worker', 'Spawning compression Web Worker');

    const compressed = await new Promise((resolve, reject) => {
      const worker = new Worker('/compress.worker.js');
      worker.postMessage({ file });

      worker.onmessage = (e) => {
        const msg = e.data;

        if (msg.type === 'log') {
          // Forward worker's structured logs into our logger
          logger[msg.level.toLowerCase()]?.('Worker', msg.message, msg.data);
          return;
        }
        if (msg.type === 'progress') {
          const pct = Math.round(msg.percent * 0.4);
          setProgress(pct);
          setStatusMsg(PHASE_LABELS.compressing);
          logger.debug('Worker', `Compression progress ${msg.percent}% → overall ${pct}%`);
        } else if (msg.type === 'done') {
          setSizeInfo({
            original: (msg.originalSize / 1024 / 1024).toFixed(2),
            compressed: (msg.compressedSize / 1024 / 1024).toFixed(2),
            ratio: (msg.originalSize / msg.compressedSize).toFixed(1),
          });
          logger.info('Worker', 'Compression complete', {
            originalMB: (msg.originalSize/1024/1024).toFixed(2),
            compressedMB: (msg.compressedSize/1024/1024).toFixed(2),
          });
          worker.terminate();
          resolve(msg.compressed);
        } else if (msg.type === 'error') {
          logger.error('Worker', `Compression error: ${msg.message}`);
          worker.terminate();
          reject(new Error(msg.message));
        }
      };

      worker.onerror = (err) => {
        logger.error('Worker', 'Worker script error', err.message);
        worker.terminate();
        reject(err);
      };
    });

    /* Step 2: Upload ---------------------------------------------------- */
    setPhase('uploading');
    setProgress(40);
    setStatusMsg('Uploading compressed file…');
    logger.info('API', `POST /products/import-async | payload=${(compressed.byteLength/1024/1024).toFixed(2)}MB`);

    const blob = new Blob([compressed], { type: 'application/gzip' });
    const form = new FormData();
    form.append('file', blob, file.name + '.gz');

    let jobId;
    try {
      const { data } = await api.post('/products/import-async', form, {
        onUploadProgress: (e) => {
          const pct = e.total ? Math.round((e.loaded / e.total) * 20) : 0;
          const overall = 40 + pct;
          setProgress(overall);
          const uploadPct = e.total ? Math.round(e.loaded / e.total * 100) : 0;
          setStatusMsg(`Uploading… ${uploadPct}%`);
          if (uploadPct % 25 === 0) {
            logger.debug('API', `Upload progress ${uploadPct}% (${(e.loaded/1024).toFixed(0)}KB / ${(e.total/1024).toFixed(0)}KB)`);
          }
        },
      });
      jobId = data.job_id;
      logger.info('API', `Upload complete | job_id=${jobId} status=${data.status}`);
    } catch (err) {
      const detail = err.response?.data?.detail || err.message;
      logger.error('API', `Upload failed: ${detail}`, { status: err.response?.status });
      setPhase('failed');
      setStatusMsg('Upload failed');
      toast.error(detail);
      return;
    }

    /* Step 3: Poll ------------------------------------------------------ */
    setPhase('queued');
    setProgress(62);
    setStatusMsg('File received — waiting for backend worker…');
    startPolling(jobId);
  };

  const barColor = phase === 'done' ? 'var(--success)'
                 : phase === 'failed' ? 'var(--danger)'
                 : 'var(--accent)';

  return (
    <div>
      <h1 className="page-title">⬆️ Upload Product Data</h1>

      {/* CSV format hint */}
      <div className="card">
        <div className="card-title">CSV Format</div>
        <div style={{ background:'var(--bg-input)', borderRadius:8, padding:'12px 16px',
                      fontFamily:'monospace', fontSize:13, color:'var(--text-secondary)', overflowX:'auto' }}>
          WID,EAN,Manufacturing_Date,Expiry_Date<br/>
          29388842,4573060000000,20-03-2024,11-07-2024
        </div>
        <p style={{ fontSize:12, color:'var(--text-muted)', marginTop:10 }}>
          ⚡ File is gzip-compressed in-browser before upload. Import runs in background — live progress below.
        </p>
      </div>

      {/* Drop zone */}
      <input ref={fileInputRef} type="file" accept=".csv" style={{ display:'none' }}
             onChange={e => handleFile(e.target.files?.[0])} id="csv-file-input" />

      <div
        className={`upload-zone ${dragover ? 'dragover' : ''}`}
        onClick={() => !isActive && fileInputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragover(true); }}
        onDragLeave={() => setDragover(false)}
        onDrop={e => { e.preventDefault(); setDragover(false); handleFile(e.dataTransfer.files?.[0]); }}
        id="csv-drop-zone"
        style={{ cursor: isActive ? 'default' : 'pointer' }}
      >
        <div className="upload-zone-icon">📄</div>
        {file ? (
          <>
            <h3 style={{ color:'var(--accent)' }}>✓ {file.name}</h3>
            <p>
              {(file.size / 1024 / 1024).toFixed(2)} MB
              {sizeInfo && (
                <span style={{ color:'var(--success)', marginLeft:8 }}>
                  → {sizeInfo.compressed} MB after gzip ({sizeInfo.ratio}× smaller)
                </span>
              )}
            </p>
          </>
        ) : (
          <>
            <h3>Drop CSV file here</h3>
            <p>or click to browse</p>
          </>
        )}
      </div>

      {/* Upload button */}
      {file && !isActive && phase !== 'done' && (
        <button id="upload-btn" className="btn btn-primary" style={{ marginTop:16 }}
                onClick={handleUpload}>
          Import to Database
        </button>
      )}

      {/* Progress bar */}
      {phase !== 'idle' && (
        <div className="card" style={{ marginTop:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
            <span style={{ fontWeight:600 }}>{PHASE_LABELS[phase] || phase}</span>
            <span style={{ color:'var(--text-muted)', fontSize:13 }}>{progress}%</span>
          </div>
          <div style={{ background:'var(--bg-input)', borderRadius:6, height:10, overflow:'hidden' }}>
            <div style={{
              width:`${progress}%`, height:'100%', background:barColor,
              borderRadius:6, transition:'width 0.4s ease',
            }} />
          </div>
          <p style={{ fontSize:12, color:'var(--text-muted)', marginTop:8 }}>{statusMsg}</p>
        </div>
      )}

      {/* Result card */}
      {result && (
        <div className="card" style={{ marginTop:16, border:'1px solid rgba(34,197,94,0.3)' }}>
          <div className="card-title" style={{ color:'var(--success)' }}>✅ Import Complete</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12 }}>
            {[
              { label:'Imported', val: result.imported, color:'var(--success)' },
              { label:'Errors',   val: result.errors,   color:'var(--danger)'  },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ textAlign:'center', background:'var(--bg-input)', borderRadius:10, padding:14 }}>
                <div style={{ fontSize:28, fontWeight:800, color }}>{val.toLocaleString()}</div>
                <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:4 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Log panel toggle */}
      <div style={{ marginTop:20, display:'flex', alignItems:'center', gap:10 }}>
        <button
          onClick={() => setShowLogs(v => !v)}
          style={{
            background:'none', border:'1px solid rgba(148,163,184,0.2)',
            borderRadius:6, color:'var(--text-muted)', fontSize:12,
            padding:'4px 12px', cursor:'pointer',
          }}
          id="toggle-logs-btn"
        >
          {showLogs ? '▼ Hide' : '▶ Show'} Frontend Logs
        </button>
        <span style={{ fontSize:11, color:'var(--text-muted)' }}>
          ({logEntries.length} entries) — also visible in DevTools Console
        </span>
      </div>

      {showLogs && (
        <LogPanel entries={logEntries} onClear={() => { logger.clear(); }} />
      )}
    </div>
  );
}
