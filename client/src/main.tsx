import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { SignInGate } from './components/SignInGate.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SignInGate>
      <App />
    </SignInGate>
  </StrictMode>,
);

// Installable + offline reading. Browsers only allow service workers on localhost or HTTPS,
// so on a plain-http LAN address this quietly does nothing and the app works online as usual.
if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('Service worker not registered', err));
  });
}
