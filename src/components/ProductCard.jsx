/**
 * ProductCard — displays DB data for a found WID.
 * Shows a "not found" warning if widFound = false.
 */
export default function ProductCard({ data, widFound }) {
  if (!widFound) {
    return (
      <div className="product-card product-card-not-found">
        <div className="card-title">⚠️ WID Not in System</div>
        <p style={{ color: 'var(--warning)', fontSize: 14 }}>
          This WID was not found in the database. You may proceed to capture a photo anyway.
        </p>
      </div>
    );
  }

  const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN', {day:'2-digit',month:'short',year:'numeric'}) : '—';

  return (
    <div className="product-card">
      <div className="card-title">📋 Product Data (from DB)</div>
      <div className="product-card-grid">
        <div className="product-card-field" style={{ gridColumn: '1 / -1' }}>
          <label>EAN</label>
          <p style={{ fontSize: 13, letterSpacing: 1 }}>{data?.ean ?? '—'}</p>
        </div>
        <div className="product-card-field">
          <label>Mfg Date</label>
          <p>{fmt(data?.manufacturing_date)}</p>
        </div>
        <div className="product-card-field">
          <label>Expiry Date</label>
          <p style={{ color: isExpired(data?.expiry_date) ? 'var(--danger)' : 'inherit' }}>
            {fmt(data?.expiry_date)}
            {isExpired(data?.expiry_date) && ' ⚠️'}
          </p>
        </div>
      </div>
    </div>
  );
}

function isExpired(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}
