'use client';
import { useEffect } from 'react';

export default function OfflineShell() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then(() => navigator.serviceWorker.ready).then(() => {
      window.dispatchEvent(new Event('autoram-offline-ready'));
    }).catch(() => {});
  }, []);
  return null;
}
