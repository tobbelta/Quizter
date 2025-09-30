import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

const useQRCode = (value, size) => {
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

    const canvas = document.createElement('canvas');

    QRCode.toCanvas(canvas, value, {
      width: size,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#f8fafc'
      },
      errorCorrectionLevel: 'H' // High error correction for logo
    })
      .then(() => {
        if (cancelled) return;

        const context = canvas.getContext('2d');
        const logoImg = new Image();
        logoImg.src = '/logo-compass.svg';
        logoImg.onload = () => {
          if (cancelled) return;

          const logoSize = size * 0.25; // 25% of QR code size
          const logoX = (size - logoSize) / 2;
          const logoY = (size - logoSize) / 2;
          context.fillStyle = '#f8fafc'; // White background for the logo
          context.fillRect(logoX, logoY, logoSize, logoSize);
          context.drawImage(logoImg, logoX, logoY, logoSize, logoSize);
          setDataUrl(canvas.toDataURL());
        };
        logoImg.onerror = () => {
          if (cancelled) return;
          // If logo fails to load, just show the QR code without it
          setDataUrl(canvas.toDataURL());
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

  return { dataUrl, isLoading, error };
};

export default useQRCode;
