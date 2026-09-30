import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

/**
 * Says out loud what the browser knows quietly: the connection is gone.
 *
 * Without this, an offline save just sat on "Processing..." with no
 * explanation, and an offline page load looked like the app was broken.
 * While offline, typed work is kept on the device (useFormPersistence) and
 * paused saves resume when the connection returns — this banner is how the
 * user knows that is what is happening.
 */
export default function OfflineBanner() {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  if (online) return null;
  return (
    <div
      role="status"
      data-testid="offline-banner"
      className="flex items-center gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
    >
      <WifiOff className="h-4 w-4 shrink-0" />
      <span>
        You are offline. Your typing is kept on this device; saving resumes when the
        connection returns.
      </span>
    </div>
  );
}
