import { useState, useEffect } from 'react';
import { Download, X, Share2, PlusSquare } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export default function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    // Check if user already dismissed recently
    const dismissed = sessionStorage.getItem('equinote_pwa_dismissed');
    if (dismissed) {
      setIsDismissed(true);
    }

    // Check if running in standalone mode (already installed)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;

    if (isStandalone) {
      setIsDismissed(true);
      return;
    }

    // iOS detection
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIos(isIosDevice);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setDeferredPrompt(null);
        setIsDismissed(true);
      }
    } else if (isIos) {
      setShowIosGuide(true);
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    sessionStorage.setItem('equinote_pwa_dismissed', 'true');
  };

  if (isDismissed || (!deferredPrompt && !isIos)) {
    return null;
  }

  return (
    <>
      <div className="bg-gradient-to-r from-emerald-950/80 via-slate-900/90 to-slate-950 border border-emerald-500/30 rounded-2xl p-3.5 mx-4 mt-3 mb-2 shadow-lg shadow-emerald-950/20 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0 text-emerald-400">
            <Download className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white tracking-tight">
              Install EquiNote App
            </h4>
            <p className="text-[11px] text-slate-400">
              Work 100% offline &amp; get instant EMI due alerts on your home screen.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleInstallClick}
            className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition shadow-sm active:scale-95"
          >
            Install
          </button>
          <button
            onClick={handleDismiss}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
            aria-label="Dismiss banner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* iOS Safari Guide Modal */}
      {showIosGuide && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 max-w-sm w-full space-y-4 shadow-2xl animate-in fade-in slide-in-from-bottom duration-200">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-base font-bold text-white">Add to Home Screen</h3>
                <p className="text-xs text-slate-400">Install EquiNote on your iPhone / iPad</p>
              </div>
              <button
                onClick={() => setShowIosGuide(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/50">
                <Share2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <span>1. Tap the <strong>Share</strong> icon in the Safari bottom bar</span>
              </div>
              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/50">
                <PlusSquare className="w-5 h-5 text-emerald-400 shrink-0" />
                <span>2. Scroll down and tap <strong>Add to Home Screen</strong></span>
              </div>
              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/50">
                <Download className="w-5 h-5 text-emerald-400 shrink-0" />
                <span>3. Tap <strong>Add</strong> in the top-right corner</span>
              </div>
            </div>

            <button
              onClick={() => setShowIosGuide(false)}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
