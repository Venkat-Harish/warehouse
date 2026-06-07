import { useState, useRef, useCallback, useEffect } from 'react';
import toast from 'react-hot-toast';
import BarcodeScanner from '../components/BarcodeScanner';
import ProductCard from '../components/ProductCard';
import OcrComparison from '../components/OcrComparison';
import api from '../services/api';

// ── State machine constants ──────────────────────────────────────────────
const S = {
  SCANNING:       'scanning',
  WID_LOOKUP:     'wid_lookup',
  PHOTO_READY:    'photo_ready',
  OCR_PROCESSING: 'ocr_processing',
  OCR_RESULTS:    'ocr_results',
  COMPLETE:       'complete',
};

const STEP_MAP = { [S.SCANNING]:0, [S.WID_LOOKUP]:1, [S.PHOTO_READY]:2, [S.OCR_PROCESSING]:3, [S.OCR_RESULTS]:4, [S.COMPLETE]:5 };
const TOTAL_STEPS = 5;
const OCR_TIMEOUT_MS = 15000;
const POLL_INTERVAL_MS = 2000;

export default function ScanPage() {
  const [state, setState]         = useState(S.SCANNING);
  const [wid, setWid]             = useState('');
  const [widInput, setWidInput]   = useState('');
  const [dbData, setDbData]       = useState(null);
  const [widFound, setWidFound]   = useState(true);
  const [photo, setPhoto]         = useState(null);        // File
  const [photoUrl, setPhotoUrl]   = useState(null);        // object URL for preview
  const [activityId, setActivityId] = useState(null);
  const [ocrData, setOcrData]     = useState(null);
  const [isOcrTimeout, setIsOcrTimeout] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const pollRef    = useRef(null);
  const timeoutRef = useRef(null);
  const fileInputRef = useRef(null);

  // ── Step indicator ────────────────────────────────────────────────────
  const stepIndex = STEP_MAP[state] ?? 0;

  // ── Reset everything ──────────────────────────────────────────────────
  const resetAll = useCallback(() => {
    clearInterval(pollRef.current);
    clearTimeout(timeoutRef.current);
    setWid(''); setWidInput(''); setDbData(null); setWidFound(true);
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhoto(null); setPhotoUrl(null);
    setActivityId(null); setOcrData(null);
    setIsOcrTimeout(false); setSubmitting(false);
    setState(S.SCANNING);
  }, [photoUrl]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      clearInterval(pollRef.current);
      clearTimeout(timeoutRef.current);
      if (photoUrl) URL.revokeObjectURL(photoUrl);
    };
  }, [photoUrl]);

  // ── WID confirmed (Enter or button) ──────────────────────────────────
  const handleWidConfirm = useCallback(async (code) => {
    const widVal = code ?? widInput.trim();
    if (!widVal || !/^\d{7,8}$/.test(widVal)) {
      toast.error('WID must be 7-8 digits');
      return;
    }
    setWid(widVal);
    setState(S.WID_LOOKUP);
    try {
      const res = await api.get(`/products/${widVal}`);
      setDbData(res.data);
      setWidFound(true);
    } catch (err) {
      if (err.response?.status === 404) {
        setDbData(null);
        setWidFound(false);
      } else {
        toast.error('Network error looking up WID');
        setState(S.SCANNING);
        return;
      }
    }
    setState(S.PHOTO_READY);
  }, [widInput]);

  // Called by BarcodeScanner when it detects a code
  const handleBarcodeScan = useCallback((code) => {
    setWidInput(code);
    handleWidConfirm(code);
  }, [handleWidConfirm]);

  // ── Photo selection ───────────────────────────────────────────────────
  const handlePhotoSelect = (file) => {
    if (!file) return;
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhoto(file);
    setPhotoUrl(URL.createObjectURL(file));
  };

  // ── Camera capture (native) ───────────────────────────────────────────
  const handleCameraCapture = (e) => handlePhotoSelect(e.target.files?.[0]);

  // ── Submit photo ──────────────────────────────────────────────────────
  const handleSubmitPhoto = async () => {
    if (!photo) { toast.error('Please take or upload a photo first'); return; }
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append('wid', wid);
      form.append('photo', photo);
      const res = await api.post('/verify/submit', form);
      const id = res.data.activity_id;
      setActivityId(id);
      setState(S.OCR_PROCESSING);
      startPolling(id);
    } catch {
      toast.error('Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── OCR Polling ───────────────────────────────────────────────────────
  const startPolling = (id) => {
    const startTime = Date.now();

    pollRef.current = setInterval(async () => {
      try {
        const res = await api.get(`/verify/ocr-status/${id}`);
        if (res.data.ocr_status === 'done' || res.data.ocr_status === 'failed') {
          clearInterval(pollRef.current);
          clearTimeout(timeoutRef.current);
          setOcrData(res.data);
          setState(S.OCR_RESULTS);
          return;
        }
      } catch { /* keep polling */ }

      if (Date.now() - startTime >= OCR_TIMEOUT_MS) {
        clearInterval(pollRef.current);
        setIsOcrTimeout(true);
        setState(S.OCR_RESULTS);
      }
    }, POLL_INTERVAL_MS);
  };

  // ── Verification complete ─────────────────────────────────────────────
  const handleComplete = async () => {
    try {
      await api.post(`/verify/complete/${activityId}`);
    } catch { /* non-critical */ }
    setState(S.COMPLETE);
    toast.success('✅ Successfully submitted!');
    setTimeout(resetAll, 2500);
  };

  // ─────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────
  return (
    <div>
      <h1 className="page-title">📦 Verify Product</h1>

      {/* Step indicator */}
      <div className="step-indicator">
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <div key={i} className={`step-dot ${i < stepIndex ? 'complete' : i === stepIndex ? 'active' : ''}`} />
        ))}
      </div>

      {/* ── STATE: SCANNING ── */}
      {state === S.SCANNING && (
        <>
          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
            <BarcodeScanner onDetected={handleBarcodeScan} active={state === S.SCANNING} />
          </div>
          <div className="card">
            <label className="input-label">Or enter WID manually</label>
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                id="wid-input"
                className="input"
                placeholder="e.g. 2938884"
                value={widInput}
                onChange={e => setWidInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleWidConfirm()}
                inputMode="numeric"
                pattern="\d*"
                maxLength={8}
              />
              <button
                id="wid-confirm-btn"
                className="btn btn-primary"
                style={{ width: 'auto', padding: '12px 20px' }}
                onClick={() => handleWidConfirm()}
              >
                →
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── STATE: WID_LOOKUP ── */}
      {state === S.WID_LOOKUP && (
        <div className="loading-box">
          <div className="spinner" />
          <p>Looking up WID <strong>{wid}</strong>…</p>
        </div>
      )}

      {/* ── STATE: PHOTO_READY ── */}
      {state === S.PHOTO_READY && (
        <>
          {/* WID confirmed bar */}
          <div className="wid-display">
            <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>WID</span>
            <span className="wid-display-value">{wid}</span>
            <button id="rescan-btn" className="wid-rescan-btn" onClick={resetAll}>↩ Re-scan</button>
          </div>

          {/* DB data card */}
          <ProductCard data={dbData} widFound={widFound} />

          {/* Photo capture */}
          <div className="card">
            <div className="card-title">📷 Product Photo (required)</div>
            {photoUrl ? (
              <>
                <img src={photoUrl} className="photo-preview" alt="Product photo preview" />
                <button
                  id="retake-btn"
                  className="btn btn-outline"
                  style={{ marginTop: 12 }}
                  onClick={() => { setPhoto(null); setPhotoUrl(null); }}
                >
                  🔄 Retake / Change Photo
                </button>
              </>
            ) : (
              <>
                {/* Camera capture (mobile) */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: 'none' }}
                  onChange={handleCameraCapture}
                  id="camera-input"
                />
                <button
                  id="take-photo-btn"
                  className="btn btn-primary"
                  style={{ marginBottom: 10 }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  📷 Take Photo
                </button>

                {/* File upload (desktop) */}
                <div
                  className="photo-drop-zone"
                  onClick={() => {
                    const inp = document.createElement('input');
                    inp.type = 'file'; inp.accept = 'image/*';
                    inp.onchange = e => handlePhotoSelect(e.target.files?.[0]);
                    inp.click();
                  }}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); handlePhotoSelect(e.dataTransfer.files?.[0]); }}
                >
                  📁 Or upload from device
                </div>
              </>
            )}
          </div>

          <button
            id="submit-photo-btn"
            className="btn btn-primary"
            disabled={!photo || submitting}
            onClick={handleSubmitPhoto}
          >
            {submitting ? 'Uploading...' : 'Submit Photo'}
          </button>
        </>
      )}

      {/* ── STATE: OCR_PROCESSING ── */}
      {state === S.OCR_PROCESSING && (
        <>
          <div className="wid-display">
            <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>WID</span>
            <span className="wid-display-value">{wid}</span>
          </div>
          <ProductCard data={dbData} widFound={widFound} />
          <div className="card">
            <div className="loading-box">
              <div className="spinner" />
              <p>
                <span className="pulse-dot" />
                OCR running in background… (~15s)
              </p>
              <p style={{ fontSize: 12, marginTop: 8, color: 'var(--text-muted)' }}>
                Analysing product label with AI
              </p>
            </div>
            
            <button 
              id="run-in-bg-btn"
              className="btn btn-outline" 
              style={{ marginTop: 16, width: '100%' }} 
              onClick={handleComplete}
            >
              Run in Background & Scan Next
            </button>
          </div>
        </>
      )}

      {/* ── STATE: OCR_RESULTS ── */}
      {state === S.OCR_RESULTS && (
        <>
          <div className="wid-display">
            <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>WID</span>
            <span className="wid-display-value">{wid}</span>
          </div>
          <ProductCard data={dbData} widFound={widFound} />
          <OcrComparison dbData={dbData} ocrData={ocrData} isTimeout={isOcrTimeout} />
          <button id="verify-complete-btn" className="btn btn-success" onClick={handleComplete}>
            Verification Complete
          </button>
        </>
      )}

      {/* ── STATE: COMPLETE ── */}
      {state === S.COMPLETE && (
        <div className="success-box">
          <div className="success-icon">✅</div>
          <h2>Verification Complete!</h2>
          <p>Record saved. Resetting scanner…</p>
        </div>
      )}
    </div>
  );
}
