import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { initPwa } from './pwa/install';
import { initChunkReload } from './lib/chunkReload';

initPwa();
initChunkReload();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
