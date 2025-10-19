/**
 * Entrypoint som monterar appen i DOM:en.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { BrowserRouter } from 'react-router-dom';
import eruda from 'eruda'; // Direkt import istället för dynamic

// Initiera Eruda direkt
console.log('[STARTUP] Loading Eruda directly...');
eruda.init({
  defaults: {
    displaySize: 50,
    transparency: 0.9
  }
});
console.log('[STARTUP] Eruda initialized!');

// Säkerställ att 100vh i webview motsvarar synlig höjd på mobila enheter
if (typeof window !== 'undefined' && !window.__geoquestViewportSetup) {
  const updateViewportUnit = () => {
    const viewport = window.visualViewport;
    const height = viewport ? viewport.height : window.innerHeight;
    const unit = height / 100;
    document.documentElement.style.setProperty('--app-viewport-vh', `${unit}px`);
    document.documentElement.style.setProperty('--app-viewport-100', `${height}px`);
  };

  const registerViewportListeners = () => {
    updateViewportUnit();
    window.addEventListener('resize', updateViewportUnit);
    window.addEventListener('orientationchange', updateViewportUnit);

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateViewportUnit);
    }
  };

  registerViewportListeners();
  window.__geoquestViewportSetup = true;
}
// Funktion för att hitta och styla Eruda-knappen med retry
const styleErudaButton = (attempts = 0, maxAttempts = 20) => {
  const entryBtn = document.querySelector('.eruda-entry-btn');
  console.log(`[STARTUP] Attempt ${attempts + 1}/${maxAttempts} - Looking for Eruda button:`, entryBtn);
  
  if (entryBtn) {
    console.log('[SUCCESS] Found Eruda button! Styling...');
    
    // Använd setProperty med 'important' för att tvinga igenom
    entryBtn.style.setProperty('position', 'fixed', 'important');
    entryBtn.style.setProperty('left', '10px', 'important');
    entryBtn.style.setProperty('right', 'auto', 'important');
    entryBtn.style.setProperty('top', '50%', 'important');
    entryBtn.style.setProperty('bottom', 'auto', 'important');
    entryBtn.style.setProperty('transform', 'translateY(-50%)', 'important');
    entryBtn.style.setProperty('z-index', '9999999', 'important');
    entryBtn.style.setProperty('background-color', '#00ff00', 'important');
    entryBtn.style.setProperty('border', '3px solid red', 'important');
    entryBtn.style.setProperty('width', '60px', 'important');
    entryBtn.style.setProperty('height', '60px', 'important');
    
    console.log('[SUCCESS] Eruda styled with !important!');
    console.log('[SUCCESS] New position:', entryBtn.style.left, entryBtn.style.top);
  } else if (attempts < maxAttempts - 1) {
    // Försök igen om 500ms
    console.log('[RETRY] Button not found, retrying in 500ms...');
    setTimeout(() => styleErudaButton(attempts + 1, maxAttempts), 500);
  } else {
    console.error('[ERROR] Eruda button not found after', maxAttempts, 'attempts!');
  }
};

// Starta första försöket efter 1 sekund
setTimeout(() => styleErudaButton(), 1000);

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

