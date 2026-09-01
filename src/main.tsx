import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { boot } from './boot';

// Restore saved project (or demo) before first render, then start the editor.
void boot().finally(() => {
  createRoot(document.getElementById('root')!).render(<App />);
});
