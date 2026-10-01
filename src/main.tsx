import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { Play } from './pages/Play';
import { Display } from './pages/Display';
import { Admin } from './pages/Admin';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/" element={<Play />} />
        <Route path="/display" element={<Display />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<Play />} />
      </Routes>
    </HashRouter>
  </StrictMode>,
);
