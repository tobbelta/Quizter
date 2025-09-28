/**
 * Renderar en QR-kod för en join-länk och ger knappar för kopiering/laddning.
 */
import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/**
 * React-komponent som genererar QR via canvas och visar status.
 */
const QRCodeDisplay = ({
  value,
  title = 'QR-kod',
  description,
  size = 220,
  filename = 'tipspromenad-qr.png'
}) => {
  const [dataUrl, setDataUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!value) {
      setDataUrl('');
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError('');

    QRCode.toDataURL(value, {
      width: size,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#f8fafc'
      }
    })
      .then((url) => {
        if (!cancelled) {
          setDataUrl(url);
        }
      })
      .catch((generationError) => {
        if (!cancelled) {
          console.warn('Kunde inte generera QR-kod', generationError);
          setError('Kunde inte generera QR-kod.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!value) {
    return null;
  }

  /** Laddar ner QR-koden som PNG. */
  const handleDownload = () => {
    if (!dataUrl || typeof document === 'undefined') return;
    const anchor = document.createElement('a');
    anchor.href = dataUrl;
    anchor.download = filename;
    anchor.click();
  };

  /** Kopierar den underliggande länken till urklipp. */
  const handleCopy = async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch (copyError) {
      console.warn('Kunde inte kopiera länk', copyError);
    }
  };

  return (
    <div className="rounded-lg border border-slate-600 bg-slate-900/60 p-4">
      {title && <h3 className="text-lg font-semibold mb-2">{title}</h3>}
      {description && <p className="text-sm text-gray-400 mb-3">{description}</p>}
      <div className="flex flex-col items-center gap-3">
        {isLoading && <p className="text-sm text-gray-400">Genererar QR-kod...</p>}
        {error && <p className="text-sm text-red-300">{error}</p>}
        {dataUrl && (
          <>
            <img src={dataUrl} alt="QR-kod" className="h-56 w-56 rounded bg-slate-800 p-2" />
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleDownload}
                className="rounded bg-cyan-500 px-4 py-1.5 text-sm font-semibold text-black hover:bg-cyan-400"
              >
                Ladda ner
              </button>
              <button
                type="button"
                onClick={handleCopy}
                className="rounded bg-slate-700 px-4 py-1.5 text-sm font-semibold text-gray-200 hover:bg-slate-600"
              >
                Kopiera länk
              </button>
            </div>
            <p className="text-xs text-gray-500 break-all text-center">{value}</p>
          </>
        )}
      </div>
    </div>
  );
};

export default QRCodeDisplay;
