import React, { lazy, Suspense, useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import Landing from './Landing';

const Workspace = lazy(async () => {
  await import('./style.css');
  return import('./App');
});

function Site() {
  const [hash, setHash] = useState(window.location.hash);
  const workspace = hash.startsWith('#/workspace');
  useEffect(() => {
    const update = () => setHash(window.location.hash);
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.view = workspace ? 'workspace' : 'landing';
    if (!workspace && hash && !hash.startsWith('#/')) {
      requestAnimationFrame(() => document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView());
    } else if (workspace || !hash) window.scrollTo(0, 0);
  }, [workspace, hash]);
  return workspace ? <Suspense fallback={<div style={{ padding: '80px 30px', fontFamily: 'sans-serif', textAlign: 'center', color: '#526744' }}>Preparing the observation workspace…</div>}><Workspace /></Suspense> : <Landing />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Site /></React.StrictMode>);
