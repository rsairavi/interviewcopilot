import { useState, useRef, useCallback } from "react";

export function useSpeechRecognition(onFinal: (transcript: string) => void, onError: (msg: string) => void) {
  const recognitionRef = useRef<any>(null);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const silenceTimer = useRef<NodeJS.Timeout | null>(null);
  const accumulatedRef = useRef("");
  const keepListeningRef = useRef(false);

  const stop = useCallback(() => {
    keepListeningRef.current = false;
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch(e) {}
    }
    setIsListening(false);
    if (silenceTimer.current) clearTimeout(silenceTimer.current);
  }, []);

  const start = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      onError("Speech recognition is not supported in this browser. Use Chrome or Edge.");
      return;
    }
    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-US";
    keepListeningRef.current = true;
    onError("");

    r.onresult = (e: any) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
        else interim += t;
      }
      if (final) {
        accumulatedRef.current += " " + final;
        setTranscript(accumulatedRef.current.trim());
        if (silenceTimer.current) clearTimeout(silenceTimer.current);
        silenceTimer.current = setTimeout(() => {
          const q = accumulatedRef.current.trim();
          if (q.length > 5) {
            onFinal(q);
            accumulatedRef.current = "";
            setTranscript("");
          }
        }, 2000);
      } else {
        setTranscript((accumulatedRef.current + " " + interim).trim());
      }
    };

    r.onstart = () => setIsListening(true);
    r.onend = () => {
      if (keepListeningRef.current) {
        try { r.start(); } catch(e) {}
      } else {
        setIsListening(false);
      }
    };
    r.onerror = (e: any) => {
      if (e.error !== "no-speech") {
        // Silent error handling for continuous mode
      }
    };

    recognitionRef.current = r;
    r.start();
  }, [onFinal, onError]);

  return { isListening, transcript, start, stop, setTranscript };
}
