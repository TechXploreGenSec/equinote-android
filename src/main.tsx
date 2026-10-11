import {createRoot} from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import App from './App.tsx';
import './index.css';

async function initNativeChrome() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    // Keep the WebView BELOW the status bar so the header/notch never overlap
    // and system notifications stay visible.
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.setBackgroundColor({ color: '#0F172A' });
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.show();
  } catch {
    // Web / older shells: CSS safe-area fallback handles the notch.
  }
}

void initNativeChrome();

createRoot(document.getElementById('root')!).render(<App />);
