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

type ChatConversation = {
  id: string;
  title: string;
  updatedAt: string;
  messages: ChatMessage[];
};

const CHAT_HISTORY_KEY = 'markus_welcome_conversations_v2';
const LEGACY_CHAT_HISTORY_KEY = 'markus_welcome_chat_history_v1';

function normalizeMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((raw: unknown, index: number): ChatMessage[] => {
    const item = raw as Partial<ChatMessage> | null;
    if (
      !item ||
      (item.role !== 'user' && item.role !== 'assistant') ||
      typeof item.text !== 'string'
    ) {
      return [];
    }

    const createdAt =
      typeof item.createdAt === 'string' && item.createdAt
        ? item.createdAt
        : new Date(Date.now() - (value.length - index) * 1000).toISOString();

    return [
      {
        id: typeof item.id === 'string' ? item.id : `${item.role}-${createdAt}-${index}`,
        role: item.role,
        text: item.text,
        createdAt,
      },
    ];
  });
}

function createConversationId() {
  return `conversation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getConversationTitle(messages: ChatMessage[]) {
  const firstUserMessage = messages.find((message) => message.role === 'user');
  return firstUserMessage?.text.trim().slice(0, 48) || 'New chat';
}

export const WelcomeView = ({
  startButtonText,
  onStartCall,
  ref,
}: React.ComponentProps<'div'> & WelcomeViewProps) => {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [input, setInput] = useState('');
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const activeConversationIdRef = useRef<string | null>(null);
  const activeConversation = conversations.find(
    (conversation) => conversation.id === activeConversationId
  );
  const messages = activeConversation?.messages ?? [];

  useEffect(() => {
    let loadedConversations: ChatConversation[] = [];
    let selectedConversationId: string | null = null;

    try {
      const saved = localStorage.getItem(CHAT_HISTORY_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as {
          conversations?: unknown;
          activeConversationId?: unknown;
        };
        if (Array.isArray(parsed.conversations)) {
          loadedConversations = parsed.conversations.flatMap((raw: unknown): ChatConversation[] => {
            const item = raw as Partial<ChatConversation> | null;
            if (!item || typeof item.id !== 'string') return [];
            const normalizedMessages = normalizeMessages(item.messages);
            const latestMessage = normalizedMessages[normalizedMessages.length - 1];
            return [
              {
                id: item.id,
                title: getConversationTitle(normalizedMessages),
                updatedAt:
                  typeof item.updatedAt === 'string'
                    ? item.updatedAt
                    : (latestMessage?.createdAt ?? new Date().toISOString()),
                messages: normalizedMessages,
              },
            ];
          });
          if (
            typeof parsed.activeConversationId === 'string' &&
            loadedConversations.some(
              (conversation) => conversation.id === parsed.activeConversationId
            )
          ) {
            selectedConversationId = parsed.activeConversationId;
          }
        }
      }

      if (loadedConversations.length === 0) {
        const legacy = localStorage.getItem(LEGACY_CHAT_HISTORY_KEY);
        if (legacy) {
          const legacyMessages = normalizeMessages(JSON.parse(legacy));
          if (legacyMessages.length > 0) {
            const latestMessage = legacyMessages[legacyMessages.length - 1];
            const conversation: ChatConversation = {
              id: 'legacy-conversation',
              title: getConversationTitle(legacyMessages),
              updatedAt: latestMessage.createdAt,
              messages: legacyMessages,
            };
            loadedConversations = [conversation];
            selectedConversationId = conversation.id;
          }
        }
      }
    } catch {
      // Ignore invalid local history payloads.
    } finally {
      loadedConversations.sort(
        (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
      );
      selectedConversationId ??= loadedConversations[0]?.id ?? null;
      activeConversationIdRef.current = selectedConversationId;
      setConversations(loadedConversations);
      setActiveConversationId(selectedConversationId);
      setHistoryLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!historyLoaded) return;
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify({ conversations, activeConversationId }));
  }, [activeConversationId, conversations, historyLoaded]);

  const selectConversation = (conversationId: string | null) => {
    activeConversationIdRef.current = conversationId;
    setActiveConversationId(conversationId);
    setEditingIndex(null);
    setInput('');
    setErrorText('');
  };

  const ensureActiveConversation = () => {
    let conversationId = activeConversationIdRef.current;
    if (!conversationId) {
      conversationId = createConversationId();
      activeConversationIdRef.current = conversationId;
      setActiveConversationId(conversationId);
    }

    const id = conversationId;
    setConversations((previous) => {
      if (previous.some((conversation) => conversation.id === id)) return previous;
      return [
        {
          id,
          title: 'New chat',
          updatedAt: new Date().toISOString(),
          messages: [],
        },
        ...previous,
      ];
    });
    return id;
  };

  const updateConversationMessages = (
    conversationId: string,
    update: (current: ChatMessage[]) => ChatMessage[]
  ) => {
    setConversations((previous) =>
      previous
        .map((conversation) => {
          if (conversation.id !== conversationId) return conversation;
          const nextMessages = update(conversation.messages);
          const latestMessage = nextMessages[nextMessages.length - 1];
          return {
            ...conversation,
            title: getConversationTitle(nextMessages),
            updatedAt: latestMessage?.createdAt ?? conversation.updatedAt,
            messages: nextMessages,
          };
        })
        .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    );
  };

  const handleEditMessage = (index: number) => {
    const selected = messages[index];
    if (!selected || selected.role !== 'user') return;

    setEditingIndex(index);
    setErrorText('');
    setInput(selected.text);
    inputRef.current?.focus();
  };

  const clearHistory = () => {
    setConversations([]);
    selectConversation(null);
    setEditingIndex(null);
    setErrorText('');
    setInput('');
    localStorage.removeItem(CHAT_HISTORY_KEY);
    localStorage.removeItem(LEGACY_CHAT_HISTORY_KEY);
  };

  const startNewChat = () => {
    selectConversation(createConversationId());
    inputRef.current?.focus();
  };

  const handleDeleteUserMessage = (index: number) => {
    const conversationId = activeConversationIdRef.current;
    if (!conversationId) return;
    updateConversationMessages(conversationId, (previous) => {
      if (index < 0 || index >= previous.length || previous[index]?.role !== 'user')
        return previous;
      const next = [...previous];
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
    const conversationId = ensureActiveConversation();
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: message,
      createdAt: new Date().toISOString(),
    };

    if (editingIndex !== null) {
      updateConversationMessages(conversationId, (previous) => [
        ...previous.slice(0, editingIndex),
        userMessage,
      ]);
    } else {
      updateConversationMessages(conversationId, (previous) => [...previous, userMessage]);
    }

    try {
      const response = await fetch('/api/jarvis-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, userId: conversationId, memoryUserId: 'web_user_profile' }),
      });

      const data = await response.json();
      if (!response.ok) {
        const details = [data?.error, data?.details].filter(Boolean).join(' ');
        throw new Error(details || 'Unable to send message.');
      }

      const reply = String(data?.response ?? 'No response received.').trim();
      updateConversationMessages(conversationId, (previous) => [
        ...previous,
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
      updateConversationMessages(conversationId, (previous) => [
        ...previous,
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

  const deleteConversation = (conversationId: string) => {
    setConversations((previous) =>
      previous.filter((conversation) => conversation.id !== conversationId)
    );
    if (activeConversationIdRef.current === conversationId) {
      selectConversation(null);
    }
  };

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
          {conversations.length === 0 && (
            <p className="px-2 pt-4 text-center text-xs text-cyan-100/50">
              Your chats will appear here.
            </p>
          )}
          {conversations.map((conversation) => (
            <article
              key={conversation.id}
              className={`rounded-xl border p-3 ${
                conversation.id === activeConversationId
                  ? 'border-cyan-300/70 bg-[#173360]'
                  : 'border-cyan-400/30 bg-[#10234f]'
              }`}
            >
              <button
                type="button"
                onClick={() => selectConversation(conversation.id)}
                className="w-full text-left"
              >
                <h3 className="truncate text-sm font-bold text-white">{conversation.title}</h3>
                <p className="mt-0.5 text-[11px] text-cyan-100/50">
                  {new Date(conversation.updatedAt).toLocaleString()}
                </p>
                <p className="mt-1 text-[11px] text-cyan-100/60">
                  {conversation.messages.length} messages
                </p>
              </button>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => deleteConversation(conversation.id)}
                  className="rounded-lg border border-rose-300/40 px-3 py-1 text-xs font-bold tracking-wider text-rose-200 uppercase hover:bg-rose-400/15"
                >
                  DELETE CHAT
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
          {messages.map((msg, index) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
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
              {msg.role === 'user' && (
                <div className="mt-1 flex gap-3 text-[11px] text-cyan-100/50">
                  <button
                    type="button"
                    onClick={() => handleEditMessage(index)}
                    className="hover:text-cyan-100"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteUserMessage(index)}
                    className="hover:text-rose-200"
                  >
                    Delete
                  </button>
                </div>
              )}
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
