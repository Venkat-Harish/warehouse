/**
 * OcrComparison — side-by-side table showing DB values vs OCR-detected values.
 * dbData: { ean, manufacturing_date, expiry_date }
 * ocrData: { ocr_ean, ocr_mfg_date, ocr_expiry_date, ocr_status }
 */
export default function OcrComparison({ dbData, ocrData, isTimeout }) {
  const fmt = (d) =>
    d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : null;

  const rows = [
    {
      field: 'EAN',
      db: dbData?.ean ? String(dbData.ean) : null,
      ocr: ocrData?.ocr_ean ? String(ocrData.ocr_ean) : null,
    },
    {
      field: 'Mfg Date',
      db: fmt(dbData?.manufacturing_date),
      ocr: fmt(ocrData?.ocr_mfg_date),
    },
    {
      field: 'Expiry Date',
      db: fmt(dbData?.expiry_date),
      ocr: fmt(ocrData?.ocr_expiry_date),
    },
  ];

  const hasMismatch = rows.some(
    (r) => r.db && r.ocr && r.db !== r.ocr
  );

  if (isTimeout) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '28px 20px' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>⏱️</div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
          OCR is taking longer than expected and is still running in the background.
          <br />You can proceed with verification.
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-title">🔍 OCR Comparison</div>
      {hasMismatch && (
        <div style={{
          background: 'var(--warning-bg)',
          border: '1px solid rgba(245,158,11,0.3)',
          borderRadius: 8,
          padding: '10px 14px',
          fontSize: 13,
          color: 'var(--warning)',
          marginBottom: 14,
        }}>
          ⚠️ Mismatch detected — review before confirming
        </div>
      )}
      {!hasMismatch && ocrData?.ocr_status === 'done' && (
        <div style={{
          background: 'var(--success-bg)',
          border: '1px solid rgba(34,197,94,0.3)',
          borderRadius: 8,
          padding: '10px 14px',
          fontSize: 13,
          color: 'var(--success)',
          marginBottom: 14,
        }}>
          ✅ All values match
        </div>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table className="ocr-table">
          <thead>
            <tr>
              <th>Field</th>
              <th>📁 From DB</th>
              <th>🔍 OCR Detected</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const match = row.db && row.ocr && row.db === row.ocr;
              const mismatch = row.db && row.ocr && row.db !== row.ocr;
              return (
                <tr key={row.field}>
                  <td style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: 12 }}>
                    {row.field}
                  </td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {row.db ?? <span className="null-tag">—</span>}
                  </td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {row.ocr ?? <span className="null-tag">not detected</span>}
                  </td>
                  <td>
                    {match   && <span className="match-tag">✅</span>}
                    {mismatch && <span className="diff-tag">⚠️</span>}
                    {!row.ocr && <span className="null-tag">❓</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
