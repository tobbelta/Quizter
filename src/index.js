/**
 * Entrypoint som monterar appen i DOM:en.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { BrowserRouter } from 'react-router-dom';

// Mobil debugging console (bara för development)
if (process.env.NODE_ENV === 'development') {
  import('eruda').then(eruda => eruda.default.init());
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
