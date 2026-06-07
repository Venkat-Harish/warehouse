import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/library';

/**
 * BarcodeScanner
 * Opens the device camera and continuously scans for barcodes.
 * Only reports WID codes (7-8 digit numbers) — ignores EAN (12-13 digit).
 * Props:
 *   onDetected(code: string) — called when a valid WID barcode is found
 *   active: boolean — stop/start scanning
 */
export default function BarcodeScanner({ onDetected, active = true }) {
  const videoRef = useRef(null);
  const readerRef = useRef(null);
  const [error, setError] = useState(null);
  const [scanning, setScanning] = useState(false);
  const lastDetected = useRef('');

  useEffect(() => {
    if (!active) {
      readerRef.current?.reset();
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
      return;
    }

    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;
    setScanning(true);
    setError(null);

    reader.decodeFromVideoDevice(null, videoRef.current, (result, err) => {
      if (result) {
        const code = result.getText().replace(/\D/g, ''); // digits only
        // WID is 7-8 digits; EAN is 12-13 digits → filter
        if (code.length >= 7 && code.length <= 8 && code !== lastDetected.current) {
          lastDetected.current = code;
          onDetected(code);
        }
      }
      if (err && !(err instanceof NotFoundException)) {
        // Non-trivial errors (camera denied, etc.)
        if (err.name === 'NotAllowedError') {
          setError('Camera access denied. Please allow camera permission.');
          setScanning(false);
        }
      }
    }).catch((e) => {
      setError('Could not access camera: ' + e.message);
      setScanning(false);
    });

    return () => {
      reader.reset();
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
    };
  }, [active]);

  return (
    <div className="camera-container">
      <video ref={videoRef} className="camera-video" playsInline muted autoPlay />
      {scanning && (
        <div className="scan-overlay">
          <div className="scan-frame">
            <div className="scan-line" />
          </div>
        </div>
      )}
      <div className="camera-label">
        {error ? `⚠️ ${error}` : '🔍 Point at WID barcode (7-8 digits)'}
      </div>
    </div>
  );
}
