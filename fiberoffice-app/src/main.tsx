import React from 'react';
import {createRoot} from 'react-dom/client';
import {InstallerApp} from './InstallerApp';
import {App} from './App';
import {OperationsApp} from './OperationsApp';
import './style.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode>{import.meta.env.VITE_INSTALLER_APP === 'true' ? <InstallerApp/> : (import.meta.env.VITE_OPERATIONS === 'true' || new URLSearchParams(location.search).get('workspace')==='local') ? <OperationsApp/> : <App/>}</React.StrictMode>);

if(import.meta.env.VITE_INSTALLER_PWA==='true'&&'serviceWorker' in navigator){window.addEventListener('load',()=>{void navigator.serviceWorker.register(import.meta.env.BASE_URL+'sw.js',{scope:import.meta.env.BASE_URL,updateViaCache:'none'}).catch(()=>{/* Online use remains available if installation is restricted. */});});}
