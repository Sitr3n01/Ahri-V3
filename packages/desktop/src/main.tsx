import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles/globals.css';

// Global error handler para debug
window.addEventListener('error', (event) => {
  console.error('[GLOBAL ERROR]', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[UNHANDLED REJECTION]', event.reason);
});

console.log('[Ahri] Starting React app...');

try {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error('Root element not found');
  }

  console.log('[Ahri] Root element found, creating React root...');

  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );

  console.log('[Ahri] React app rendered successfully');
} catch (error) {
  console.error('[Ahri] Failed to start app:', error);
  document.body.innerHTML = `
    <div style="padding: 20px; color: red; font-family: monospace;">
      <h1>Erro ao iniciar aplicação</h1>
      <pre>${error}</pre>
    </div>
  `;
}
