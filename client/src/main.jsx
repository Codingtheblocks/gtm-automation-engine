import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import CompanySite from './CompanySite.jsx';
import './index.css';

const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
const RootComponent = pathname.endsWith('/company-site') ? CompanySite : App;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>,
);
