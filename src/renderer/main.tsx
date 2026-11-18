// src/renderer/main.tsx - React Client Mount
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';

// Auto-refresh local port 4200 browser tab whenever UI rebuilds or local server restarts
if (
  typeof window !== 'undefined' &&
  (window.location.protocol === 'http:' || window.location.protocol === 'https:') &&
  (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') &&
  window.location.port === '4200' &&
  typeof EventSource !== 'undefined'
) {
  let activeBootId: string | null = null;
  try {
    const es = new EventSource('/api/dev-reload');
    es.onmessage = (event) => {
      const msg = String(event.data || '');
      if (msg === 'reload') {
        window.location.reload();
      } else if (msg.startsWith('boot:')) {
        if (activeBootId && activeBootId !== msg) {
          window.location.reload();
        } else {
          activeBootId = msg;
        }
      }
    };
  } catch {
    // ignore if SSE unavailable
  }
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
