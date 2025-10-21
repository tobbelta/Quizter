/**
 * useQRCode Hook
 * 
 * SYFTE: Genererar QR-koder med inbäddad GeoQuest-logotyp
 * 
 * ANVÄNDNING: 
 * - MyRunsPage: QR-kod för att dela rundor
 * - JoinRunPage: Visa QR för att andra ska kunna joina
 * - FullscreenQRCode: Helskärmsvisning av QR-kod
 * 
 * FUNKTIONALITET:
 * - Genererar QR-kod från en sträng (t.ex. join-länk)
 * - Lägger till GeoQuest compass-logotyp i mitten (25% av QR-storleken)
 * - Hög felkorrigering (Level H) för att logotyp ska fungera
 * - Returnerar data URL för <img src={dataUrl}>
 * 
 * @param {string} value - Strängen att koda (t.ex. URL)
 * @param {number} size - Storlek i pixlar (standard: 256)
 * @returns {{ dataUrl, isLoading, error }}
 */
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

const useQRCode = (value, size) => {
  // STATE
  const [dataUrl, setDataUrl] = useState('');     // Data URL för QR-bilden
  const [isLoading, setIsLoading] = useState(false); // Loading state under generering
  const [error, setError] = useState('');         // Felmeddelande om något går fel

  useEffect(() => {
    // Guard: Om inget value, rensa QR-koden
    if (!value) {
      setDataUrl('');
      return;
    }
    
    // Cleanup flag för att undvika state updates efter unmount
    let cancelled = false;
    setIsLoading(true);
    setError('');

    // Skapa canvas-element för QR-kodgenerering
    const canvas = document.createElement('canvas');

    // Generera QR-kod på canvas
    QRCode.toCanvas(canvas, value, {
      width: size,
      margin: 2,
      color: {
        dark: '#0f172a',  // Slate-900 för mörka pixlar
        light: '#f8fafc'  // Slate-50 för ljusa pixlar (bakgrund)
      },
      errorCorrectionLevel: 'H' // High - tillåter upp till 30% skada (viktigt för logotyp i mitten)
    })
      .then(() => {
        if (cancelled) return; // Avbryt om component unmounted

        // Rita GeoQuest-logotyp över QR-koden
        const context = canvas.getContext('2d');
        const logoImg = new Image();
        logoImg.src = '/logo-compass.svg'; // Compass-logotypen från public/
        
        logoImg.onload = () => {
          if (cancelled) return;

          // Beräkna logotyp-storlek och position (25% av QR-storlek, centrerad)
          const logoSize = size * 0.25;
          const logoX = (size - logoSize) / 2;
          const logoY = (size - logoSize) / 2;
          
          // Rita vit bakgrund bakom logotypen för bättre läsbarhet
          context.fillStyle = '#f8fafc';
          context.fillRect(logoX, logoY, logoSize, logoSize);
          
          // Rita logotypen
          context.drawImage(logoImg, logoX, logoY, logoSize, logoSize);
          
          // Konvertera canvas till data URL och spara
          setDataUrl(canvas.toDataURL());
        };
        
        logoImg.onerror = () => {
          if (cancelled) return;
          // Om logotypen misslyckas ladda, visa bara QR-koden utan logotyp
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

    // Cleanup: Sätt cancelled=true för att förhindra state updates efter unmount
    return () => {
      cancelled = true;
    };
  }, [value, size]); // Re-generera QR-kod om value eller size ändras

  return { dataUrl, isLoading, error };
};

export default useQRCode;
