/* oxlint-disable react/only-export-components -- toast() and its host belong together */
import { useEffect, useState } from "react";

// Short confirmations for header controls whose effect isn't obvious at a glance
// (language switched, numbers view on/off). One message at a time; a new one replaces the old.

const EVENT = "bv-toast";
const SHOW_MS = 2200;

export function toast(message: string) {
  window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: message }));
}

export function Toaster() {
  const [msg, setMsg] = useState<{ text: string; id: number } | null>(null);

  useEffect(() => {
    let timer: number | undefined;
    const onToast = (e: Event) => {
      const text = (e as CustomEvent<string>).detail;
      setMsg({ text, id: Date.now() });
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setMsg(null), SHOW_MS);
    };
    window.addEventListener(EVENT, onToast);
    return () => {
      window.removeEventListener(EVENT, onToast);
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div className="toast-region" role="status" aria-live="polite">
      {msg && (
        <div className="toast" key={msg.id}>
          {msg.text}
        </div>
      )}
    </div>
  );
}
