// Version check - körs FÖRE allt annat
// Denna fil ska ALDRIG cachas
(function() {
  const VERSION_CHECK_APP_VERSION = '0.4.7';
  const urlParams = new URLSearchParams(window.location.search);
  const requestedVersion = urlParams.get('ver') || urlParams.get('version');

  if (requestedVersion && requestedVersion !== VERSION_CHECK_APP_VERSION) {
    // Stoppa all laddning
    window.stop();

    // Rensa body
    document.body.innerHTML = '';
    document.body.style.cssText = 'margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif;';

    // Detektera om det är mobil
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    // Skapa felmeddelande
    const container = document.createElement('div');
    container.style.cssText = 'min-height: 100vh; background: #020617; display: flex; align-items: center; justify-content: center; padding: 20px;';

    container.innerHTML = `
      <div style="max-width: 600px; background: #0f172a; border: 2px solid #ef4444; border-radius: 16px; padding: 40px; text-align: center;">
        <div style="font-size: 60px; margin-bottom: 20px;">⚠️</div>
        <h1 style="color: #f87171; font-size: 28px; margin: 0 0 20px 0;">Felaktig version!</h1>
        <div style="background: #1e293b; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <p style="color: #cbd5e1; margin: 0 0 10px 0;">URL förväntar: <strong style="color: #22d3ee; font-family: monospace;">${requestedVersion}</strong></p>
          <p style="color: #cbd5e1; margin: 0;">Du kör: <strong style="color: #fbbf24; font-family: monospace;">${VERSION_CHECK_APP_VERSION}</strong></p>
        </div>
        <p style="color: #94a3b8; font-size: 14px; margin-bottom: 20px;">Din webbläsare har cachat en gammal version.</p>
        <button id="correctVersion" style="width: 100%; padding: 16px; background: #10b981; color: #fff; border: none; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer; margin-bottom: 10px;">
          Ladda med rätt version (${VERSION_CHECK_APP_VERSION})
        </button>
        <button id="removeVersion" style="width: 100%; padding: 16px; background: #06b6d4; color: #000; border: none; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer; margin-bottom: 10px;">
          Ladda utan versionskontroll
        </button>
        ${!isMobile ? '<button id="forceReload" style="width: 100%; padding: 16px; background: #475569; color: #fff; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer;">Tvinga omladdning (Ctrl+Shift+R)</button>' : ''}
      </div>
    `;

    document.body.appendChild(container);

    // Lägg till event listeners
    document.getElementById('correctVersion').addEventListener('click', function() {
      // Byt ut version-parametern till rätt version
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('ver', VERSION_CHECK_APP_VERSION);
      window.location.href = newUrl.toString();
    });

    document.getElementById('removeVersion').addEventListener('click', function() {
      window.location.href = window.location.pathname;
    });

    // Lägg bara till forceReload listener om knappen finns
    if (!isMobile) {
      document.getElementById('forceReload').addEventListener('click', function() {
        window.location.reload(true);
      });
    }

    // Stoppa all ytterligare körning
    throw new Error('Version mismatch - execution stopped');
  }
})();
