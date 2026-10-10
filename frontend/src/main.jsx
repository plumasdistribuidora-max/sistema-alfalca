import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { registrarServiceWorker } from './utils/avisos';

// El service worker solo recibe los avisos del celular: no guarda nada en caché.
registrarServiceWorker();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
