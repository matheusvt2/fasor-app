import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PRODUTO } from '@app/domain';
import { App } from './app.tsx';
import { registerServiceWorker } from './sw/register.ts';
import './styles/index.css';

document.title = PRODUTO;
const root = document.getElementById('root');
if (!root) throw new Error('missing #root');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// AR-7: the app-shell precache, registered after the first render so it never delays it.
// A browser that refuses the worker still runs everything above.
void registerServiceWorker();
