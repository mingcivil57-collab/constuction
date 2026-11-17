import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

// Handle uncaught script errors gracefully
if (typeof window !== 'undefined') {
  window.addEventListener(
    'error',
    (event) => {
      if (
        event.message === 'Script error.' ||
        event.message === 'Script error' ||
        (!event.filename && !event.lineno)
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        console.warn('Cross-origin script error intercepted.');
      }
    },
    true
  );

  window.addEventListener('unhandledrejection', (event) => {
    if (
      event.reason?.message === 'Script error.' ||
      String(event.reason).includes('Script error') ||
      String(event.reason?.message).includes('Failed to fetch') ||
      String(event.reason?.message).includes('NETWORK_FALLBACK_DEMO')
    ) {
      event.preventDefault();
      console.warn('Network or cross-origin rejection intercepted:', event.reason);
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

