import { useState, useRef, useEffect, useCallback } from 'react';
import api from '../services/api';

/* ─── tiny barcode scanner using ZXing via CDN ────────────────────────────
   We load @zxing/browser dynamically from unpkg so we don't need an npm dep. */
const ZXING_CDN = 'https://unpkg.com/@zxing/browser@0.1.5/umd/index.min.js';
let zxingPromise = null;
function loadZXing() {
  if (!zxingPromise) {
    zxingPromise = new Promise((resolve, reject) => {
      if (window.ZXingBrowser) { resolve(window.ZXingBrowser); return; }
      const s = document.createElement('script');
      s.src = ZXING_CDN;
      s.onload = () => resolve(window.ZXingBrowser);
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  return zxingPromise;
}

/* ─── Scanner Modal ───────────────────────────────────────────────────── */
function ScannerModal({ onDetected, onClose, targetLabel }) {
  const videoRef = useRef(null);
  const readerRef = useRef(null);
  const [status, setStatus] = useState('Loading scanner…');
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setStatus('Loading ZXing library…');
        const ZXing = await loadZXing();
        if (!mounted) return;

        setStatus('Starting camera…');
        const hints = new Map();
        const formats = [
          ZXing.BarcodeFormat.EAN_13,
          ZXing.BarcodeFormat.EAN_8,
          ZXing.BarcodeFormat.CODE_128,
          ZXing.BarcodeFormat.QR_CODE,
          ZXing.BarcodeFormat.CODE_39,
        ];
        hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, formats);
        hints.set(ZXing.DecodeHintType.TRY_HARDER, true);

        const reader = new ZXing.BrowserMultiFormatReader(hints);
        readerRef.current = reader;

        const devices = await ZXing.BrowserMultiFormatReader.listVideoInputDevices();
        if (!devices.length) throw new Error('No camera found');

        // Prefer back camera
        const cam = devices.find(d => /back|rear|environment/i.test(d.label)) || devices[0];
        setStatus(`Scanning for ${targetLabel}…`);

        await reader.decodeFromVideoDevice(cam.deviceId, videoRef.current, (result, err) => {
          if (result && mounted) {
            onDetected(result.getText());
          }
        });
      } catch (e) {
        if (mounted) setError(e.message || 'Camera error');
      }
    })();

    return () => {
      mounted = false;
      readerRef.current?.reset();
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
    };
  }, []);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
      zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--bg-card)', borderRadius: 16, padding: 24,
        width: '90%', maxWidth: 420, boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>📷 Scan {targetLabel}</h3>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--text-muted)',
            fontSize: 22, cursor: 'pointer', lineHeight: 1,
          }}>✕</button>
        </div>

        {error ? (
          <div style={{ color: 'var(--danger)', textAlign: 'center', padding: 24, fontSize: 14 }}>
            ❌ {error}<br />
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Make sure camera permissions are granted.
            </span>
          </div>
        ) : (
          <>
            {/* Scanner viewfinder */}
            <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', background: '#000' }}>
              <video ref={videoRef} style={{ width: '100%', display: 'block', maxHeight: 260, objectFit: 'cover' }} />
              {/* Crosshair overlay */}
              <div style={{
                position: 'absolute', inset: 0, display: 'flex',
                alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
              }}>
                <div style={{
                  width: '70%', height: 60,
                  border: '2px solid rgba(56,189,248,0.8)',
                  borderRadius: 6,
                  boxShadow: '0 0 0 4000px rgba(0,0,0,0.35)',
                }} />
              </div>
            </div>
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, marginTop: 12 }}>
              {status}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Reports Page ────────────────────────────────────────────────────── */
export default function ReportsPage() {
  const today   = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(weekAgo);
  const [endDate, setEndDate]     = useState(today);
  const [widFilter, setWidFilter] = useState('');
  const [eanFilter, setEanFilter] = useState('');

  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  // scanner: null | 'wid' | 'ean'
  const [scanner, setScanner] = useState(null);

  // Close scanner on unmount
  useEffect(() => {
    return () => setScanner(null);
  }, []);

  const handleFetch = async () => {
    setError(''); setResults(null); setLoading(true);
    try {
      const start = new Date(startDate).toISOString();
      const end   = new Date(endDate + 'T23:59:59').toISOString();
      let url = `/reports/activities?start=${start}&end=${end}&limit=200`;
      if (widFilter.trim()) url += `&wid=${encodeURIComponent(widFilter.trim())}`;
      if (eanFilter.trim()) url += `&ean=${encodeURIComponent(eanFilter.trim())}`;
      const res = await api.get(url);
      setResults(res.data);
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to fetch report');
    } finally { setLoading(false); }
  };

  const handleExport = () => {
    if (!results?.length) return;
    const headers = ['ID','WID','Username','Checked At','EAN(DB)','Mfg(DB)','Exp(DB)','EAN(OCR)','Mfg(OCR)','Exp(OCR)','OCR Status','Verified'];
    const rows = results.map(r => [
      r.id, r.wid, r.username,
      new Date(r.checked_at).toLocaleString('en-IN'),
      r.db_ean ?? '', r.db_mfg_date ?? '', r.db_expiry_date ?? '',
      r.ocr_ean ?? '', r.ocr_mfg_date ?? '', r.ocr_expiry_date ?? '',
      r.ocr_status, r.verification_status,
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report_${startDate}_to_${endDate}${widFilter ? `_wid${widFilter}` : ''}${eanFilter ? `_ean${eanFilter}` : ''}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleScanDetected = useCallback((value) => {
    const digits = value.replace(/\D/g, '');
    if (scanner === 'wid') setWidFilter(digits);
    if (scanner === 'ean') setEanFilter(digits);
    setScanner(null);
  }, [scanner]);

  const fmt     = (d) => d ? new Date(d).toLocaleDateString('en-IN') : '—';
  const fmtTime = (d) => d ? new Date(d).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : '—';

  return (
    <div>
      <h1 className="page-title">📊 Verification Reports</h1>

      {/* ── Filter card ─────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-title">Filters</div>

        {/* Date row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <label className="input-label" htmlFor="report-start">From</label>
            <input id="report-start" type="date" className="input"
                   value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="input-label" htmlFor="report-end">To</label>
            <input id="report-end" type="date" className="input"
                   value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
        </div>

        {/* WID + EAN row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <label className="input-label" htmlFor="filter-wid">
              WID
              <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 4 }}>(optional)</span>
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                id="filter-wid"
                type="text"
                inputMode="numeric"
                className="input"
                placeholder="e.g. 29388842"
                value={widFilter}
                onChange={e => setWidFilter(e.target.value.replace(/\D/g, ''))}
              />
              <button
                id="scan-wid-btn"
                title="Scan WID barcode"
                onClick={() => setScanner('wid')}
                style={{
                  background: 'var(--bg-input)', border: '1px solid var(--border)',
                  borderRadius: 8, padding: '0 10px', cursor: 'pointer',
                  color: 'var(--accent)', fontSize: 18, flexShrink: 0,
                }}
              >📷</button>
            </div>
          </div>

          <div>
            <label className="input-label" htmlFor="filter-ean">
              EAN
              <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 4 }}>(optional)</span>
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                id="filter-ean"
                type="text"
                inputMode="numeric"
                className="input"
                placeholder="e.g. 4573060000000"
                value={eanFilter}
                onChange={e => setEanFilter(e.target.value.replace(/\D/g, ''))}
              />
              <button
                id="scan-ean-btn"
                title="Scan EAN barcode"
                onClick={() => setScanner('ean')}
                style={{
                  background: 'var(--bg-input)', border: '1px solid var(--border)',
                  borderRadius: 8, padding: '0 10px', cursor: 'pointer',
                  color: 'var(--accent)', fontSize: 18, flexShrink: 0,
                }}
              >📷</button>
            </div>
          </div>
        </div>

        {/* Active filter badges */}
        {(widFilter || eanFilter) && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            {widFilter && (
              <span style={{
                background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.3)',
                borderRadius: 20, padding: '3px 12px', fontSize: 12, color: 'var(--accent)',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                WID: {widFilter}
                <span style={{ cursor: 'pointer', opacity: 0.7 }} onClick={() => setWidFilter('')}>✕</span>
              </span>
            )}
            {eanFilter && (
              <span style={{
                background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.3)',
                borderRadius: 20, padding: '3px 12px', fontSize: 12, color: 'var(--accent)',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                EAN: {eanFilter}
                <span style={{ cursor: 'pointer', opacity: 0.7 }} onClick={() => setEanFilter('')}>✕</span>
              </span>
            )}
          </div>
        )}

        <button id="generate-report-btn" className="btn btn-primary" onClick={handleFetch} disabled={loading}>
          {loading ? 'Loading...' : 'Generate Report'}
        </button>
      </div>

      {/* ── Error ─────────────────────────────────────────────────────── */}
      {error && (
        <div style={{ background:'var(--danger-bg)', border:'1px solid rgba(239,68,68,0.3)',
                      borderRadius:12, padding:'14px 18px', color:'var(--danger)', fontSize:13, marginTop:12 }}>
          ❌ {error}
        </div>
      )}

      {/* ── Results table ─────────────────────────────────────────────── */}
      {results !== null && (
        <div className="card" style={{ padding: 0, overflow: 'hidden', marginTop: 12 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                        padding:'16px 18px', borderBottom:'1px solid var(--border)' }}>
            <span style={{ fontWeight: 600 }}>{results.length} records found</span>
            {results.length > 0 && (
              <button id="export-csv-btn" className="btn btn-outline"
                      style={{ width:'auto', padding:'8px 16px', fontSize:13 }} onClick={handleExport}>
                ⬇ Export CSV
              </button>
            )}
          </div>

          {results.length === 0 ? (
            <div style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>
              No activity matching these filters.
            </div>
          ) : (
            <div className="reports-table-wrapper" style={{ border:'none', borderRadius:0 }}>
              <table className="reports-table">
                <thead>
                  <tr>
                    <th>WID</th>
                    <th>User</th>
                    <th>Checked At</th>
                    <th>EAN</th>
                    <th>Mfg</th>
                    <th>Expiry</th>
                    <th>OCR</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map(r => (
                    <tr key={r.id}
                        onClick={() => { setWidFilter(String(r.wid)); }}
                        style={{ cursor: 'pointer' }}
                        title="Click to filter by this WID">
                      <td style={{ fontWeight:700, fontVariantNumeric:'tabular-nums', color:'var(--accent)' }}>
                        {r.wid}
                      </td>
                      <td>{r.username ?? '—'}</td>
                      <td style={{ whiteSpace:'nowrap' }}>{fmtTime(r.checked_at)}</td>
                      <td style={{ fontSize:12 }}>{r.db_ean ?? '—'}</td>
                      <td style={{ whiteSpace:'nowrap' }}>{fmt(r.db_mfg_date)}</td>
                      <td style={{ whiteSpace:'nowrap' }}>{fmt(r.db_expiry_date)}</td>
                      <td>
                        <span className={`badge ${
                          r.ocr_status==='done' ? 'badge-success' :
                          r.ocr_status==='failed' ? 'badge-danger' :
                          r.ocr_status==='timeout' ? 'badge-muted' : 'badge-warning'
                        }`}>{r.ocr_status}</span>
                      </td>
                      <td>
                        <span className={`badge ${r.verification_status==='operator_confirmed' ? 'badge-success' : 'badge-info'}`}>
                          {r.verification_status === 'operator_confirmed' ? '✓ Confirmed' : 'Submitted'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Barcode Scanner Modal ─────────────────────────────────────── */}
      {scanner && (
        <ScannerModal
          targetLabel={scanner === 'wid' ? 'WID Barcode' : 'EAN Barcode'}
          onDetected={handleScanDetected}
          onClose={() => setScanner(null)}
        />
      )}
    </div>
  );
}
