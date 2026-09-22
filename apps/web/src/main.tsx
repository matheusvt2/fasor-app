import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PRODUTO } from '@app/domain';
import { App } from './app.tsx';
import './styles/index.css';

document.title = PRODUTO;
const root = document.getElementById('root');
if (!root) throw new Error('missing #root');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
