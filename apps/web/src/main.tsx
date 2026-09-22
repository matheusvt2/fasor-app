import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PRODUTO } from '@app/domain';
import { App } from './app.tsx';
import { registerServiceWorker, unregisterServiceWorkers } from './sw/register.ts';
import './styles/index.css';

document.title = PRODUTO;
const root = document.getElementById('root');
if (!root) throw new Error('missing #root');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/*
 * AR-7: the app-shell precache, registered after the first render so it never delays it.
 * A browser that refuses the worker still runs everything above.
 *
 * Never under the Vite dev server. There the document references `/src/main.tsx` and an
 * unbounded module graph, so a precached `/` is a shell that cannot boot: with the dev
 * server down the worker would serve a blank page instead of the browser's own error.
 * `import.meta.env.DEV` cannot say that — it is also true for the `build:e2e` bundle the
 * durability projects run against, which is a real build and does need the worker.
 * `import.meta.hot` is the honest discriminator: the dev server injects the HMR client,
 * and no build of any mode ever does.
 *
 * A worker a previous dev session left behind would keep serving that blank page, so the
 * dev server also clears one out on boot.
 */
if (import.meta.hot) void unregisterServiceWorkers();
else void registerServiceWorker();
