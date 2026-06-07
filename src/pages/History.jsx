import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../services/api';
import OcrComparison from '../components/OcrComparison';

const OCR_STATUS_BADGE = {
  done:    { cls: 'badge-success', label: 'OCR Done' },
  pending: { cls: 'badge-warning', label: 'OCR Pending' },
  timeout: { cls: 'badge-muted',   label: 'OCR Timeout' },
  failed:  { cls: 'badge-danger',  label: 'OCR Failed' },
};

export default function HistoryPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState(null);
  const [fullScreenImage, setFullScreenImage] = useState(null);
  const LIMIT = 20;

  const fetchItems = async (skip = 0) => {
    setLoading(true);
    try {
      const res = await api.get(`/verify/my-checks?skip=${skip}&limit=${LIMIT}`);
      setItems(res.data);
    } catch { /* handled by interceptor */ }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchItems(page * LIMIT); }, [page]);

  const handleConfirm = async (id) => {
    try {
      await api.post(`/verify/complete/${id}`);
      toast.success('Check confirmed');
      setItems(items.map(i => i.id === id ? { ...i, verification_status: 'operator_confirmed' } : i));
    } catch {
      toast.error('Failed to confirm check');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this verification check?')) return;
    try {
      await api.delete(`/verify/${id}`);
      toast.success('Check deleted');
      setItems(items.filter(i => i.id !== id));
    } catch {
      toast.error('Failed to delete check');
    }
  };

  const fmt = (d) => d
    ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

  return (
    <div>
      <h1 className="page-title">🕐 My Checks</h1>

      {fullScreenImage && (
        <div 
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}
          onClick={() => setFullScreenImage(null)}
        >
          <img src={fullScreenImage} style={{ maxWidth: '95vw', maxHeight: '95vh', objectFit: 'contain' }} alt="Full screen preview" />
        </div>
      )}

      {loading && (
        <div className="loading-box"><div className="spinner" /><p>Loading history…</p></div>
      )}

      {!loading && items.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
          <p style={{ color: 'var(--text-muted)' }}>No verifications yet. Go scan some products!</p>
        </div>
      )}

      {items.map((item) => {
        const badge = OCR_STATUS_BADGE[item.ocr_status] ?? OCR_STATUS_BADGE.pending;
        const isExpanded = expandedId === item.id;
        const token = localStorage.getItem('token');
        const photoUrl = `${api.defaults.baseURL}/verify/${item.id}/photo?token=${token}`;

        return (
          <div 
            key={item.id} 
            className="history-item" 
            style={{ cursor: 'pointer', flexDirection: 'column', alignItems: 'stretch' }}
            onClick={() => setExpandedId(isExpanded ? null : item.id)}
          >
            <div style={{ display: 'flex', gap: 16 }}>
              <div className="history-thumb-placeholder" style={{ overflow: 'hidden', padding: 0 }}>
                <img src={photoUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.style.display = 'none'; e.target.parentElement.innerHTML = '📦'; }} />
              </div>
              <div className="history-info" style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span className="history-wid">WID: {item.wid}</span>
                  {!item.wid_found_in_db && <span className="badge badge-warning">⚠ Unknown WID</span>}
                  <span className={`badge ${badge.cls}`}>{badge.label}</span>
                  {item.verification_status === 'operator_confirmed' && (
                    <span className="badge badge-success">✓ Confirmed</span>
                  )}
                </div>
                <div className="history-ean">
                  EAN: {item.db_ean ?? '—'}
                </div>
                <div style={{ display: 'flex', gap: 16, marginTop: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Mfg: {item.db_mfg_date ? new Date(item.db_mfg_date).toLocaleDateString('en-IN') : '—'}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Exp: {item.db_expiry_date ? new Date(item.db_expiry_date).toLocaleDateString('en-IN') : '—'}
                  </span>
                </div>
                <div className="history-meta">🕐 {fmt(item.checked_at)}</div>
              </div>
            </div>

            {isExpanded && (
              <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 16 }} onClick={(e) => e.stopPropagation()}>
                <div style={{ marginBottom: 16 }}>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase' }}>Validation Photo</p>
                  <img 
                    src={photoUrl}
                    style={{ width: '100%', maxHeight: 200, objectFit: 'contain', borderRadius: 8, border: '1px solid var(--border)', background: '#000', cursor: 'zoom-in' }}
                    alt="Validation photo"
                    onClick={() => setFullScreenImage(photoUrl)}
                  />
                </div>
                <OcrComparison 
                  dbData={{
                    ean: item.db_ean,
                    manufacturing_date: item.db_mfg_date,
                    expiry_date: item.db_expiry_date
                  }}
                  ocrData={{
                    ocr_ean: item.ocr_ean,
                    ocr_mfg_date: item.ocr_mfg_date,
                    ocr_expiry_date: item.ocr_expiry_date,
                    ocr_status: item.ocr_status
                  }}
                />
                
                <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                  {item.verification_status !== 'operator_confirmed' && (
                    <button 
                      className="btn btn-primary"
                      onClick={() => handleConfirm(item.id)}
                    >
                      Confirm
                    </button>
                  )}
                  <button 
                    className="btn btn-outline"
                    style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                    onClick={() => handleDelete(item.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Pagination */}
      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button
          className="btn btn-outline"
          style={{ flex: 1 }}
          disabled={page === 0}
          onClick={() => setPage(p => p - 1)}
        >← Newer</button>
        <button
          className="btn btn-outline"
          style={{ flex: 1 }}
          disabled={items.length < LIMIT}
          onClick={() => setPage(p => p + 1)}
        >Older →</button>
      </div>
    </div>
  );
}
