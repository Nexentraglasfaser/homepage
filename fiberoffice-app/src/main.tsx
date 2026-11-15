import React from 'react';
import {createRoot} from 'react-dom/client';
import {App} from './App';
import {OperationsApp} from './OperationsApp';
import './style.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode>{(import.meta.env.VITE_OPERATIONS === 'true' || new URLSearchParams(location.search).get('workspace')==='local') ? <OperationsApp/> : <App/>}</React.StrictMode>);
