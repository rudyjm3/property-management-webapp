'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

interface Thread {
  threadId: string;
  subject: string | null;
  unreadCount: number;
  tenant: { id: string; name: string; email: string } | null;
  unit: { id: string; unitNumber: string; property: { name: string } } | null;
  latestMessage: Message;
}

interface Message {
  id: string;
  threadId: string | null;
  body: string;
  subject: string | null;
  createdAt: string;
  readAt: string | null;
  senderUserId: string | null;
  recipientTenantId: string | null;
  sender: { id: string; name: string } | null;
  recipient: { id: string; name: string } | null;
}

export default function MessagesPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<Message[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [replyBody, setReplyBody] = useState('');

  // Compose modal
  const [showCompose, setShowCompose] = useState(false);
  const [tenants, setTenants] = useState<any[]>([]);
  const [composeRecipientId, setComposeRecipientId] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composeError, setComposeError] = useState('');
  const [composeSubmitting, setComposeSubmitting] = useState(false);

  // Pre-auth: use first staff member as current user
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  async function loadThreads() {
    try {
      const data = await api.messages.threads.list();
      setThreads(data);
    } catch (err) {
      console.error('Failed to load threads:', err);
    } finally {
      setLoadingThreads(false);
    }
  }

  async function loadThread(threadId: string) {
    setLoadingMessages(true);
    setActiveThreadId(threadId);
    try {
      const data = await api.messages.threads.get(threadId);
      setThreadMessages(data);
      // Clear unread badge for this thread
      setThreads((prev) =>
        prev.map((t) => (t.threadId === threadId ? { ...t, unreadCount: 0 } : t))
      );
    } catch (err) {
      console.error('Failed to load thread:', err);
    } finally {
      setLoadingMessages(false);
    }
  }

  async function handleSendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!activeThreadId || !replyBody.trim() || !currentUserId) return;

    const activeThread = threads.find((t) => t.threadId === activeThreadId);
    if (!activeThread?.tenant) return;

    setSendingMessage(true);
    try {
      const msg = await api.messages.send({
        senderUserId: currentUserId,
        recipientTenantId: activeThread.tenant.id,
        body: replyBody.trim(),
        threadId: activeThreadId,
      });
      setThreadMessages((prev) => [...prev, msg]);
      setReplyBody('');
      await loadThreads();
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setSendingMessage(false);
    }
  }

  async function openCompose() {
    setComposeRecipientId('');
    setComposeSubject('');
    setComposeBody('');
    setComposeError('');
    setShowCompose(true);
    try {
      const data = await api.tenants.list();
      setTenants(data);
    } catch (err) {
      console.error('Failed to load tenants:', err);
    }
  }

  async function handleComposeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!composeRecipientId || !composeBody.trim() || !currentUserId) {
      setComposeError('Please select a tenant and write a message.');
      return;
    }
    setComposeError('');
    setComposeSubmitting(true);
    try {
      const msg = await api.messages.send({
        senderUserId: currentUserId,
        recipientTenantId: composeRecipientId,
        body: composeBody.trim(),
        subject: composeSubject.trim() || null,
      });
      setShowCompose(false);
      await loadThreads();
      if (msg.threadId) {
        await loadThread(msg.threadId);
      }
    } catch (err: any) {
      setComposeError(err.message || 'Failed to send message');
    } finally {
      setComposeSubmitting(false);
    }
  }

  // Scroll to bottom of messages on update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [threadMessages]);

  // Load staff (pre-auth current user) + threads on mount
  useEffect(() => {
    async function init() {
      try {
        // TODO: replace with auth session user ID once auth is wired
        const staff = await api.staff.list();
        if (staff.length > 0) setCurrentUserId(staff[0].id);
      } catch (err) {
        console.error('Failed to load staff:', err);
      }
      await loadThreads();
    }
    init();

    // Poll for new threads every 30 seconds
    const interval = setInterval(loadThreads, 30_000);
    return () => clearInterval(interval);
  }, []);

  const activeThread = threads.find((t) => t.threadId === activeThreadId) ?? null;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Messages</h1>
          <p className="page-subtitle">
            {threads.length} conversation{threads.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button className="btn btn-primary" onClick={openCompose}>
          New Message
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '0', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', overflow: 'hidden', height: 'calc(100vh - 180px)' }}>

        {/* Thread list */}
        <div style={{ borderRight: '1px solid var(--color-border)', overflowY: 'auto', background: 'var(--color-surface)' }}>
          {loadingThreads ? (
            <div style={{ padding: '24px', fontSize: '14px', color: 'var(--color-text-muted)' }}>Loading…</div>
          ) : threads.length === 0 ? (
            <div style={{ padding: '24px', fontSize: '14px', color: 'var(--color-text-muted)' }}>No conversations yet.</div>
          ) : (
            threads.map((thread) => (
              <button
                key={thread.threadId}
                onClick={() => loadThread(thread.threadId)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '14px 16px',
                  borderBottom: '1px solid var(--color-border)',
                  background: activeThreadId === thread.threadId ? 'var(--color-hover)' : 'transparent',
                  cursor: 'pointer',
                  border: 'none',
                  borderBottom: '1px solid var(--color-border)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                  <span style={{ fontWeight: thread.unreadCount > 0 ? 700 : 500, fontSize: '14px', color: 'var(--color-text)' }}>
                    {thread.tenant?.name ?? 'Unknown'}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {thread.unreadCount > 0 && (
                      <span style={{ background: 'var(--color-primary)', color: '#fff', borderRadius: '999px', fontSize: '11px', padding: '1px 6px', fontWeight: 600 }}>
                        {thread.unreadCount}
                      </span>
                    )}
                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                      {formatTime(thread.latestMessage.createdAt)}
                    </span>
                  </div>
                </div>
                {thread.unit && (
                  <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '3px' }}>
                    Unit {thread.unit.unitNumber} — {thread.unit.property.name}
                  </div>
                )}
                {thread.subject && (
                  <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text)', marginBottom: '2px' }}>
                    {thread.subject}
                  </div>
                )}
                <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {thread.latestMessage.body}
                </div>
              </button>
            ))
          )}
        </div>

        {/* Conversation panel */}
        <div style={{ display: 'flex', flexDirection: 'column', background: '#fff' }}>
          {!activeThreadId ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: '14px' }}>
              Select a conversation or start a new one
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
                <div style={{ fontWeight: 600, fontSize: '15px' }}>{activeThread?.tenant?.name ?? 'Conversation'}</div>
                {activeThread?.unit && (
                  <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                    Unit {activeThread.unit.unitNumber} — {activeThread.unit.property.name}
                  </div>
                )}
                {activeThread?.subject && (
                  <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '2px' }}>{activeThread.subject}</div>
                )}
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {loadingMessages ? (
                  <div style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>Loading…</div>
                ) : (
                  threadMessages.map((msg) => {
                    const isFromManager = !!msg.senderUserId;
                    return (
                      <div
                        key={msg.id}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: isFromManager ? 'flex-end' : 'flex-start',
                        }}
                      >
                        <div
                          style={{
                            maxWidth: '70%',
                            background: isFromManager ? 'var(--color-primary)' : 'var(--color-hover)',
                            color: isFromManager ? '#fff' : 'var(--color-text)',
                            borderRadius: isFromManager ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                            padding: '10px 14px',
                            fontSize: '14px',
                            lineHeight: '1.5',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                          }}
                        >
                          {msg.body}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '3px' }}>
                          {isFromManager ? (msg.sender?.name ?? 'You') : (msg.recipient?.name ?? 'Tenant')} · {formatTime(msg.createdAt)}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply input */}
              <form
                onSubmit={handleSendReply}
                style={{ padding: '12px 16px', borderTop: '1px solid var(--color-border)', display: 'flex', gap: '8px', background: 'var(--color-surface)' }}
              >
                <textarea
                  rows={2}
                  placeholder="Write a message…"
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendReply(e as any);
                    }
                  }}
                  style={{ flex: 1, resize: 'none', fontSize: '14px' }}
                />
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={sendingMessage || !replyBody.trim()}
                  style={{ alignSelf: 'flex-end' }}
                >
                  {sendingMessage ? 'Sending…' : 'Send'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      {/* Compose Modal */}
      {showCompose && (
        <div className="modal-overlay" onClick={() => setShowCompose(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h2>New Message</h2>
              <button className="btn btn-sm btn-secondary" onClick={() => setShowCompose(false)}>X</button>
            </div>
            <form onSubmit={handleComposeSubmit}>
              <div className="modal-body">
                {composeError && (
                  <div style={{ color: 'var(--color-danger)', marginBottom: '12px', fontSize: '14px' }}>{composeError}</div>
                )}
                <div className="form-group">
                  <label>To (Tenant) *</label>
                  <select value={composeRecipientId} onChange={(e) => setComposeRecipientId(e.target.value)} required>
                    <option value="">— Select tenant —</option>
                    {tenants.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Subject</label>
                  <input
                    type="text"
                    placeholder="Optional subject"
                    value={composeSubject}
                    onChange={(e) => setComposeSubject(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Message *</label>
                  <textarea
                    rows={5}
                    placeholder="Write your message…"
                    value={composeBody}
                    onChange={(e) => setComposeBody(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCompose(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={composeSubmitting}>
                  {composeSubmitting ? 'Sending…' : 'Send Message'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'short' });
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
}
