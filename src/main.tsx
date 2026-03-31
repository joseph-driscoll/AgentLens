import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/tailwind.css'; // Tailwind v4 + @theme tokens
import './styles/app.scss';    // SCSS: variables, animations, component overrides

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
