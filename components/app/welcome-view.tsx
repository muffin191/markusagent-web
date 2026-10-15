'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

function WelcomeImage() {
  return (
    <img
      src="/markus_jarvis.avif"
      alt="Markus Jarvis"
      width={256}
      height={256}
      className="mb-4 h-64 w-64 rounded-full object-cover"
    />
  );
}

interface WelcomeViewProps {
  startButtonText: string;
  onStartCall: () => void;
}

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
};

const CHAT_HISTORY_KEY = 'markus_welcome_chat_history_v1';

export const WelcomeView = ({
  startButtonText,
  onStartCall,
  ref,
}: React.ComponentProps<'div'> & WelcomeViewProps) => {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(CHAT_HISTORY_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return;

      const normalized = parsed
        .filter(
          (item) =>
            (item?.role === 'user' || item?.role === 'assistant') && typeof item?.text === 'string'
        )
        .map((item, index): ChatMessage => {
          const timestamp =
            typeof item?.createdAt === 'string' && item.createdAt
              ? item.createdAt
              : new Date(Date.now() - (parsed.length - index) * 1000).toISOString();

          return {
            id: typeof item?.id === 'string' ? item.id : `${item.role}-${timestamp}-${index}`,
            role: item.role,
            text: item.text,
            createdAt: timestamp,
          };
        });
      setMessages(normalized);
    } catch {
      // Ignore invalid local history payloads.
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(messages));
  }, [messages]);

  const handleEditMessage = (index: number) => {
    const selected = messages[index];
    if (!selected || selected.role !== 'user') return;

    setEditingIndex(index);
    setErrorText('');
    setInput(selected.text);
    inputRef.current?.focus();
  };

  const clearHistory = () => {
    setMessages([]);
    setEditingIndex(null);
    setErrorText('');
    setInput('');
    localStorage.removeItem(CHAT_HISTORY_KEY);
  };

  const startNewChat = () => {
    setEditingIndex(null);
    setInput('');
    setErrorText('');
    inputRef.current?.focus();
  };

  const handleDeleteUserMessage = (index: number) => {
    setMessages((prev) => {
      if (index < 0 || index >= prev.length || prev[index]?.role !== 'user') return prev;
      const next = [...prev];
      next.splice(index, 1);
      if (next[index]?.role === 'assistant') {
        next.splice(index, 1);
      }
      return next;
    });

    if (editingIndex !== null && editingIndex >= index) {
      setEditingIndex(null);
      setInput('');
    }
  };

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = input.trim();
    if (!message || isSending) return;

    setInput('');
    setErrorText('');
    setIsSending(true);
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: message,
      createdAt: new Date().toISOString(),
    };

    if (editingIndex !== null) {
      setMessages((prev) => [...prev.slice(0, editingIndex), userMessage]);
    } else {
      setMessages((prev) => [...prev, userMessage]);
    }

    try {
      const response = await fetch('/api/jarvis-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, userId: 'web_user' }),
      });

      const data = await response.json();
      if (!response.ok) {
        const details = [data?.error, data?.details].filter(Boolean).join(' ');
        throw new Error(details || 'Unable to send message.');
      }

      const reply = String(data?.response ?? 'No response received.').trim();
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          text: reply || 'No response received.',
          createdAt: new Date().toISOString(),
        },
      ]);
      setEditingIndex(null);
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Unable to send message.';
      setErrorText(messageText);
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-error-${Date.now()}`,
          role: 'assistant',
          text: 'I could not reach the backend right now. Please try again.',
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const historyEntries = messages
    .map((message, index) => ({ message, index }))
    .filter((entry) => entry.message.role === 'user');

  return (
    <div ref={ref} className="flex h-svh w-full overflow-hidden">
      {/* ── Left sidebar: history ── */}
      <aside className="flex w-64 shrink-0 flex-col gap-3 border-r border-white/10 bg-[#07122e] p-4">
        {/* Logo row */}
        <div className="flex items-center gap-3 pb-2">
          <img
            src="/markus_jarvis.avif"
            alt="Markus Jarvis"
            width={40}
            height={40}
            className="h-10 w-10 rounded-full object-cover"
          />
          <span className="text-sm font-bold tracking-widest text-cyan-200 uppercase">Markus</span>
        </div>

        {/* New chat */}
        <button
          type="button"
          onClick={startNewChat}
          className="flex w-full items-center justify-center rounded-xl border border-cyan-400/60 bg-cyan-500/10 py-3 text-sm font-semibold text-cyan-50 transition hover:bg-cyan-500/20"
        >
          + New chat
        </button>

        {/* History list */}
        <div className="flex-1 space-y-2 overflow-y-auto">
          {historyEntries.length === 0 && (
            <p className="px-2 pt-4 text-center text-xs text-cyan-100/50">
              Your chats will appear here.
            </p>
          )}
          {historyEntries.map(({ message, index }) => (
            <article
              key={message.id}
              className="rounded-xl border border-cyan-400/30 bg-[#10234f] p-3"
            >
              <h3 className="truncate text-sm font-bold text-white uppercase">
                {message.text.slice(0, 30) || 'New chat'}
              </h3>
              <p className="mt-0.5 text-[11px] text-cyan-100/50">
                {new Date(message.createdAt).toLocaleString()}
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => handleEditMessage(index)}
                  className="rounded-lg border border-cyan-200/50 px-3 py-1 text-xs font-bold tracking-wider text-cyan-100 uppercase hover:bg-cyan-400/15"
                >
                  EDIT
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteUserMessage(index)}
                  className="rounded-lg border border-rose-300/40 px-3 py-1 text-xs font-bold tracking-wider text-rose-200 uppercase hover:bg-rose-400/15"
                >
                  DELETE
                </button>
              </div>
            </article>
          ))}
        </div>

        {/* Clear */}
        <button
          type="button"
          onClick={clearHistory}
          className="mt-auto text-[11px] font-semibold tracking-widest text-cyan-100/50 uppercase hover:text-cyan-100"
        >
          Clear all history
        </button>
      </aside>

      {/* ── Right: chat area ── */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex shrink-0 items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.25em] text-cyan-300 uppercase">
              CMONS // AI
            </p>
            <h1 className="text-2xl font-black text-white md:text-3xl">Your AI Website</h1>
          </div>
          <Button
            size="sm"
            onClick={onStartCall}
            className="rounded-full border border-cyan-300 bg-transparent font-mono text-xs font-bold tracking-widest text-cyan-200 uppercase hover:bg-cyan-500/20"
          >
            {startButtonText}
          </Button>
        </header>

        {/* Messages */}
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
          {messages.length === 0 && (
            <p className="text-center text-sm text-white/40">
              Send a message to start chatting with Markus.
            </p>
          )}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
            >
              <div
                className={
                  msg.role === 'user'
                    ? 'max-w-[75%] rounded-2xl bg-blue-600 px-4 py-3 text-sm text-white'
                    : 'max-w-[75%] rounded-2xl bg-white/10 px-4 py-3 text-sm text-cyan-50'
                }
              >
                {msg.text}
              </div>
            </div>
          ))}
        </div>

        {/* Input row */}
        <div className="shrink-0 border-t border-white/10 px-6 py-4">
          {editingIndex !== null && (
            <p className="mb-2 text-xs text-amber-300">Editing message — send to update</p>
          )}
          <form onSubmit={sendMessage} className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              rows={1}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder={editingIndex !== null ? 'Edit your message...' : 'Message Markus...'}
              className="min-h-[44px] flex-1 resize-none rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
            />
            <Button
              asChild
              type="button"
              size="sm"
              className="h-11 shrink-0 rounded-xl border border-cyan-300/60 bg-transparent px-4 text-xs font-bold tracking-wider text-cyan-200 uppercase hover:bg-cyan-500/20"
            >
              <Link href="/jarvis">STS</Link>
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSending}
              className="h-11 shrink-0 rounded-xl bg-cyan-400 px-5 text-xs font-bold text-slate-900 hover:bg-cyan-300 disabled:opacity-50"
            >
              {isSending ? '...' : editingIndex !== null ? 'Update' : 'Send'}
            </Button>
          </form>
          {errorText && <p className="mt-2 text-xs text-red-400">{errorText}</p>}
        </div>
      </main>
    </div>
  );
};
