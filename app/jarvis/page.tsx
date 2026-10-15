'use client';

import { useEffect, useRef, useState } from 'react';

type SpeechRecognitionCompat = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onresult: ((ev: { results: SpeechRecognitionResultList }) => void) | null;
  start(): void;
  stop(): void;
};

type SpeechRecognitionCtorCompat = new () => SpeechRecognitionCompat;

const CHAT_URL = '/api/jarvis-chat';
const TTS_URL = '/api/tts';

export default function JarvisPage() {
  const [status, setStatus] = useState('STANDBY');
  const [transcript, setTranscript] = useState('Waiting for activation...');
  const [backendLabel, setBackendLabel] = useState('Gemini AI');
  const [backendClass, setBackendClass] = useState('gemini');
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [ack, setAck] = useState(false);

  const recRef = useRef<SpeechRecognitionCompat | null>(null);
  const recActiveRef = useRef(false);
  const recPendingRef = useRef(false);
  const recPausedRef = useRef(false);
  const keepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastEventRef = useRef(Date.now());
  const lastTextRef = useRef('');
  const listeningR = useRef(false);
  const speakingR = useRef(false);
  const ackR = useRef(false);
  const wakeR = useRef(false);
  const cmdR = useRef(false);

  useEffect(() => {
    listeningR.current = listening;
  }, [listening]);
  useEffect(() => {
    speakingR.current = speaking;
  }, [speaking]);
  useEffect(() => {
    ackR.current = ack;
  }, [ack]);

  useEffect(() => {
    void pollStatus();
    const id = setInterval(() => void pollStatus(), 5000);
    return () => {
      clearInterval(id);
      doStopListening();
      stopAudio();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pollStatus() {
    try {
      const res = await fetch(CHAT_URL, { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { provider?: string };
      const p = String(data?.provider ?? '').toLowerCase();
      const b = p.includes('gemini') ? 'gemini' : p.includes('ollama') ? 'ollama' : 'web_search';
      setBackendClass(b);
      setBackendLabel(
        b === 'gemini' ? 'Gemini AI' : b === 'ollama' ? 'Local Ollama AI' : 'Web Search'
      );
    } catch {
      /* ignore */
    }
  }

  function getRecCtor() {
    const w = window as Window & {
      SpeechRecognition?: SpeechRecognitionCtorCompat;
      webkitSpeechRecognition?: SpeechRecognitionCtorCompat;
    };
    return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
  }

  function initRec(): boolean {
    if (recRef.current) return true;
    const Ctor = getRecCtor();
    if (!Ctor) return false;
    try {
      const r = new Ctor();
      r.continuous = true;
      r.interimResults = true;
      r.lang = 'en-US';
      r.onstart = () => {
        lastEventRef.current = Date.now();
        recActiveRef.current = true;
        recPendingRef.current = false;
      };
      r.onend = () => {
        lastEventRef.current = Date.now();
        recActiveRef.current = false;
        recPendingRef.current = false;
        if (recPausedRef.current) return;
        if (listeningR.current && !speakingR.current) setTimeout(() => safeStart(), 250);
        else if (listeningR.current && speakingR.current && !ackR.current)
          setTimeout(() => safeStart(), 500);
      };
      r.onerror = (ev) => {
        lastEventRef.current = Date.now();
        if (ev.error === 'no-speech') {
          setTimeout(() => {
            if (listeningR.current && !speakingR.current) safeStart();
          }, 300);
          return;
        }
        if (ev.error === 'aborted') return;
      };
      r.onresult = (ev) => {
        lastEventRef.current = Date.now();
        // Build the full sentence by joining ALL results (not just the last)
        // This matches what the local HTML does and gives full speech capture
        let fullText = '';
        for (let i = 0; i < ev.results.length; i++) {
          const r = ev.results[i];
          fullText += String(r?.[0]?.transcript ?? '');
        }
        fullText = fullText.trim();
        const last = ev.results[ev.results.length - 1];
        const lastIsFinal = Boolean(last?.isFinal);
        if (fullText) setTranscript(fullText);
        if (speakingR.current && ackR.current) return;
        if (speakingR.current && !ackR.current && fullText) {
          const lo = fullText.toLowerCase();
          if (lo === 'stop' || lo === 'stop listening' || lo === 'cancel') {
            doStopListening();
            return;
          }
          stopAudio();
          window.speechSynthesis.cancel();
          setSpeaking(false);
          speakingR.current = false;
          setAck(false);
          ackR.current = false;
          cmdR.current = true;
          setStatus('INTERRUPTED');
        }
        if (!fullText || !lastIsFinal) return;
        if (fullText === lastTextRef.current) return;
        lastTextRef.current = fullText;
        void onTranscript(fullText);
      };
      recRef.current = r;
      return true;
    } catch {
      return false;
    }
  }

  function safeStart() {
    if (!initRec()) return;
    if (!listeningR.current || speakingR.current || recPausedRef.current) return;
    if (recActiveRef.current || recPendingRef.current) return;
    recPendingRef.current = true;
    try {
      recRef.current!.start();
    } catch {
      recPendingRef.current = false;
    }
  }

  function startKeepAlive() {
    if (keepAliveRef.current) return;
    keepAliveRef.current = setInterval(() => {
      if (!listeningR.current || speakingR.current || recPausedRef.current) return;
      if (!recActiveRef.current && !recPendingRef.current) {
        safeStart();
        return;
      }
      if (recActiveRef.current && Date.now() - lastEventRef.current > 15000) resetRec(true);
    }, 5000);
  }

  function stopKeepAlive() {
    if (keepAliveRef.current) {
      clearInterval(keepAliveRef.current);
      keepAliveRef.current = null;
    }
  }

  function resetRec(resume: boolean) {
    const r = recRef.current;
    if (r) {
      try {
        r.onresult = null;
        r.onerror = null;
        r.onend = null;
        r.onstart = null;
        r.stop();
      } catch {
        /* ignore */
      }
    }
    recRef.current = null;
    recActiveRef.current = false;
    recPendingRef.current = false;
    recPausedRef.current = false;
    if (!initRec()) return;
    if (resume && listeningR.current && !speakingR.current) safeStart();
  }

  function restartRec() {
    if (!recRef.current || !listeningR.current || speakingR.current) return;
    try {
      recRef.current.stop();
      setTimeout(() => {
        if (listeningR.current && !speakingR.current) {
          lastTextRef.current = '';
          safeStart();
        }
      }, 100);
    } catch {
      /* ignore */
    }
  }

  function doStartListening() {
    if (!initRec()) {
      alert('Speech recognition not supported. Use Chrome or Edge.');
      return;
    }
    setListening(true);
    listeningR.current = true;
    wakeR.current = true;
    cmdR.current = false;
    setStatus('LISTENING');
    setTranscript('Say "Hey Jarvis" to activate...');
    startKeepAlive();
    safeStart();
  }

  function doStopListening() {
    setListening(false);
    listeningR.current = false;
    setSpeaking(false);
    speakingR.current = false;
    setAck(false);
    ackR.current = false;
    wakeR.current = false;
    cmdR.current = false;
    recPausedRef.current = false;
    recPendingRef.current = false;
    if (ackTimerRef.current) {
      clearTimeout(ackTimerRef.current);
      ackTimerRef.current = null;
    }
    stopKeepAlive();
    stopAudio();
    clearVoiceTimer();
    window.speechSynthesis.cancel();
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
    recRef.current = null;
    setStatus('STANDBY');
    setTranscript('Waiting for activation...');
  }

  async function onTranscript(text: string) {
    const lo = text.toLowerCase().trim();
    if (!lo) return;
    if (lo === 'stop' || lo === 'stop listening' || lo === 'cancel' || lo === 'nevermind') {
      doStopListening();
      return;
    }
    if (wakeR.current && !cmdR.current) {
      if (!(lo.startsWith('hey jarvis') || lo.startsWith('jarvis') || lo === 'jarvis')) return;
      wakeR.current = false;
      cmdR.current = true;
      lastTextRef.current = '';
      setStatus('ACTIVATED');
      doSpeak('Yes, sir?', true);
      return;
    }
    if (text.trim() && !speakingR.current && !wakeR.current) {
      cmdR.current = false;
      await processCmd(text);
      restartRec();
    }
  }

  async function processCmd(cmd: string) {
    setStatus('PROCESSING');
    try {
      const msg = cmd.replace(/^you:\s*/i, '').trim();
      const res = await fetch(CHAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, userId: 'jarvis_voice', voiceMode: true }),
      });
      const data = (await res.json()) as { reply?: string; response?: string };
      const reply = String(data?.reply ?? data?.response ?? '').trim();
      doSpeak(reply || 'I did not receive a response.', false);
    } catch {
      doSpeak('I encountered an error processing your request.', false);
    }
  }

  function clearVoiceTimer() {
    if (voiceTimerRef.current) {
      clearTimeout(voiceTimerRef.current);
      voiceTimerRef.current = null;
    }
  }

  function scheduleVoiceTimer(text: string, isAck: boolean) {
    clearVoiceTimer();
    const ms = (isAck ? 4000 : 14000) + Math.min(text.length * 35, 15000);
    voiceTimerRef.current = setTimeout(() => {
      if (speakingR.current) onVoiceEnd(isAck);
    }, ms);
  }

  function doSpeak(text: string, isAck: boolean) {
    clearVoiceTimer();
    if (isAck && listeningR.current) {
      try {
        recRef.current?.stop();
        recPausedRef.current = true;
      } catch {
        /* ignore */
      }
      ackTimerRef.current = setTimeout(() => {
        if (speakingR.current && ackR.current) onVoiceEnd(true);
      }, 2500);
    }
    setSpeaking(true);
    speakingR.current = true;
    setAck(isAck);
    ackR.current = isAck;
    setStatus('SPEAKING');
    stopAudio();
    scheduleVoiceTimer(text, isAck);
    window.speechSynthesis.cancel();
    void ttsChain(text, isAck);
  }

  async function ttsChain(text: string, isAck: boolean) {
    // Jarvis-style voice: British male, slightly lower pitch and pace
    const voice = 'en-GB-RyanNeural';
    const pitch = '-10%';
    const rate = '-8%';
    // 1. Try streaming audio
    try {
      await playStreamed(text, isAck, voice, pitch, rate);
      return;
    } catch {
      /* fall through */
    }
    // 2. Try buffered audio
    try {
      const res = await fetch(TTS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice, pitch, rate }),
      });
      if (!res.ok) throw new Error('tts');
      await playBlob(await res.blob(), isAck);
      return;
    } catch {
      /* fall through */
    }
    // 3. Browser fallback
    browserSpeak(text, isAck);
  }

  async function playStreamed(
    text: string,
    isAck: boolean,
    voice: string,
    pitch: string,
    rate: string
  ) {
    stopAudio();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const res = await fetch(TTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice, pitch, rate }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error('stream tts ' + String(res.status));
    const ct = res.headers.get('Content-Type') ?? 'audio/mpeg';
    const mseType = `${ct.includes('audio') ? ct : 'audio/mpeg'}; codecs="mp3"`;
    const canMse =
      res.body !== null &&
      typeof MediaSource !== 'undefined' &&
      MediaSource.isTypeSupported(mseType);
    if (!canMse) {
      await playBlob(await res.blob(), isAck);
      return;
    }
    const ms = new MediaSource();
    const a = new Audio();
    audioRef.current = a;
    a.src = URL.createObjectURL(ms);
    a.onended = () => onVoiceEnd(isAck);
    await new Promise<void>((resolve, reject) => {
      ms.addEventListener(
        'sourceopen',
        async () => {
          let sb: SourceBuffer;
          try {
            sb = ms.addSourceBuffer(mseType);
          } catch (e) {
            reject(e);
            return;
          }
          const reader = res.body!.getReader();
          try {
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              await appendBuf(sb, value);
            }
            if (sb.updating)
              await new Promise<void>((r) =>
                sb.addEventListener('updateend', () => r(), { once: true })
              );
            ms.endOfStream();
            resolve();
          } catch (e) {
            reject(e);
          }
        },
        { once: true }
      );
    });
    await a.play();
  }

  async function appendBuf(sb: SourceBuffer, chunk: Uint8Array<ArrayBufferLike>) {
    if (sb.updating)
      await new Promise<void>((r) => sb.addEventListener('updateend', () => r(), { once: true }));
    sb.appendBuffer(chunk.buffer as ArrayBuffer);
    await new Promise<void>((r) => sb.addEventListener('updateend', () => r(), { once: true }));
  }

  async function playBlob(blob: Blob, isAck: boolean) {
    stopAudio();
    return new Promise<void>((resolve, reject) => {
      const a = new Audio(URL.createObjectURL(blob));
      audioRef.current = a;
      a.onended = () => {
        onVoiceEnd(isAck);
        resolve();
      };
      a.onerror = () => reject(new Error('playback failed'));
      void a.play().catch(reject);
    });
  }

  function browserSpeak(text: string, isAck: boolean) {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    u.onend = () => onVoiceEnd(isAck);
    u.onerror = () => onVoiceEnd(isAck);
    window.speechSynthesis.speak(u);
  }

  function stopAudio() {
    abortRef.current?.abort();
    abortRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
  }

  function onVoiceEnd(isAck: boolean) {
    if (ackTimerRef.current) {
      clearTimeout(ackTimerRef.current);
      ackTimerRef.current = null;
    }
    clearVoiceTimer();
    setSpeaking(false);
    speakingR.current = false;
    setAck(false);
    ackR.current = false;
    recPausedRef.current = false;
    if (isAck) {
      wakeR.current = false;
      cmdR.current = true;
      setStatus('READY FOR COMMAND');
      setTranscript('Listening for your command...');
      setTimeout(() => {
        if (listeningR.current && !speakingR.current) {
          lastTextRef.current = '';
          safeStart();
        }
      }, 200);
      return;
    }
    wakeR.current = true;
    cmdR.current = false;
    setStatus('LISTENING');
    setTranscript('Say "Hey Jarvis" to continue...');
    setTimeout(() => {
      if (listeningR.current && !speakingR.current) restartRec();
    }, 1500);
  }

  const ringColor = speaking ? '#ff3366' : listening ? '#00ff88' : '#00eaff';
  const coreGrad = speaking
    ? 'radial-gradient(circle,#ff3366 0%,#aa0033 100%)'
    : listening
      ? 'radial-gradient(circle,#00ff88 0%,#00aa55 100%)'
      : 'radial-gradient(circle,#00eaff 0%,#005b8a 100%)';

  return (
    <main
      style={{
        fontFamily: "'Orbitron','Consolas','Monaco',monospace",
        background: '#000',
        color: '#00eaff',
        height: '100vh',
        overflow: 'hidden',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          background: 'radial-gradient(ellipse at center,#0a1833 0%,#000 100%)',
        }}
      >
        <button
          onClick={() => window.location.assign('/')}
          style={{
            position: 'fixed',
            top: 20,
            left: 20,
            padding: '10px 20px',
            fontFamily: 'inherit',
            fontSize: 13,
            background: 'rgba(0,234,255,0.15)',
            border: '1px solid #00eaff',
            color: '#00eaff',
            borderRadius: 6,
            cursor: 'pointer',
            letterSpacing: 2,
          }}
        >
          &larr; Back
        </button>

        <div
          style={{
            position: 'fixed',
            top: 20,
            right: 20,
            fontSize: 14,
            color: 'rgba(0,234,255,0.75)',
            textAlign: 'right',
            letterSpacing: 1,
          }}
        >
          Say <strong style={{ color: '#00eaff', fontSize: 18 }}>&ldquo;Hey Jarvis&rdquo;</strong>{' '}
          to activate
          <br />
          <small>Browser voice mode</small>
        </div>

        <div
          style={{
            position: 'fixed',
            bottom: 20,
            right: 20,
            fontSize: 12,
            padding: '8px 12px',
            background: 'rgba(0,234,255,0.1)',
            border: '1px solid #00eaff',
            borderRadius: 4,
            letterSpacing: 0.5,
          }}
        >
          <span
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              marginRight: 6,
              background:
                backendClass === 'gemini'
                  ? '#4285f4'
                  : backendClass === 'ollama'
                    ? '#00eaff'
                    : '#ff9800',
            }}
          />
          {backendLabel}
        </div>

        <div
          style={{
            fontSize: 28,
            letterSpacing: 4,
            textShadow: '0 0 10px #00eaff',
            marginBottom: 20,
            textTransform: 'uppercase',
          }}
        >
          {status}
        </div>

        <div
          style={{
            position: 'relative',
            width: 400,
            height: 400,
            marginBottom: 60,
            maxWidth: '80vw',
            maxHeight: '80vw',
          }}
        >
          {([400, 300, 200] as const).map((size, i) => (
            <div
              key={size}
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: size,
                height: size,
                borderRadius: '50%',
                border: `2px solid ${ringColor}`,
                transform: 'translate(-50%,-50%)',
                boxShadow: `0 0 30px ${ringColor},inset 0 0 30px ${ringColor}`,
                animation: `jpulse ${2 + i * 0.5}s ease-in-out infinite ${i * 0.5}s`,
              }}
            />
          ))}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: 80,
              height: 80,
              borderRadius: '50%',
              background: coreGrad,
              boxShadow: `0 0 40px ${ringColor},0 0 80px ${ringColor}`,
              transform: 'translate(-50%,-50%)',
              animation: 'jcore 2s ease-in-out infinite',
            }}
          />
        </div>

        <div
          style={{
            fontSize: 18,
            color: 'rgba(0,234,255,0.67)',
            maxWidth: 800,
            textAlign: 'center',
            padding: 20,
            minHeight: 60,
            letterSpacing: 2,
          }}
        >
          {transcript}
        </div>

        <div style={{ position: 'fixed', bottom: 40, display: 'flex', gap: 20 }}>
          <button
            onClick={doStartListening}
            disabled={listening}
            style={{
              padding: '15px 30px',
              fontSize: 16,
              fontFamily: 'inherit',
              background: 'linear-gradient(90deg,#00eaff 0%,#005b8a 100%)',
              border: '2px solid #00eaff',
              color: '#fff',
              borderRadius: 8,
              cursor: listening ? 'not-allowed' : 'pointer',
              letterSpacing: 2,
              boxShadow: '0 0 20px #00eaff',
              opacity: listening ? 0.3 : 1,
            }}
          >
            Activate Voice
          </button>
          <button
            onClick={doStopListening}
            disabled={!listening}
            style={{
              padding: '15px 30px',
              fontSize: 16,
              fontFamily: 'inherit',
              background: 'linear-gradient(90deg,#00eaff 0%,#005b8a 100%)',
              border: '2px solid #00eaff',
              color: '#fff',
              borderRadius: 8,
              cursor: !listening ? 'not-allowed' : 'pointer',
              letterSpacing: 2,
              boxShadow: '0 0 20px #00eaff',
              opacity: !listening ? 0.3 : 1,
            }}
          >
            Stop Listening
          </button>
        </div>
      </div>

      <style>{`
        @keyframes jpulse{0%,100%{transform:translate(-50%,-50%) scale(1);opacity:.5}50%{transform:translate(-50%,-50%) scale(1.05);opacity:.8}}
        @keyframes jcore{0%,100%{box-shadow:0 0 40px #00eaff,0 0 80px #00eaff}50%{box-shadow:0 0 60px #00eaff,0 0 120px #00eaff,0 0 160px #00eaff}}
      `}</style>
    </main>
  );
}
