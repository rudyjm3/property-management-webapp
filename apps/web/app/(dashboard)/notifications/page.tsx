'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  actionUrl: string | null;
  createdAt: string;
}

function groupByDate(notifications: Notification[]): Record<string, Notification[]> {
  const groups: Record<string, Notification[]> = {};
  for (const n of notifications) {
    const date = new Date(n.createdAt);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    let label: string;
    if (date.toDateString() === today.toDateString()) {
      label = 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      label = 'Yesterday';
    } else {
      label = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }

    if (!groups[label]) groups[label] = [];
    groups[label].push(n);
  }
  return groups;
}

const TYPE_ICONS: Record<string, string> = {
  rent_overdue: '💰',
  late_fee_applied: '💰',
  rent_reminder: '🔔',
  lease_expiry: '📋',
  work_order_assigned: '🔧',
  work_order_sla_breach: '⚠️',
  new_message: '✉️',
  default: '🔔',
};

export default function NotificationsPage() {
  const { profile } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  useEffect(() => {
    if (profile?.userId) {
      loadNotifications();
    }
  }, [profile?.userId, showUnreadOnly]);

  async function loadNotifications() {
    setLoading(true);
    try {
      const data = await api.notifications.list({
        userId: profile?.userId,
        unreadOnly: showUnreadOnly,
      });
      setNotifications(data || []);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleMarkAllRead() {
    setMarkingAll(true);
    try {
      await api.notifications.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, readAt: new Date().toISOString() })));
    } catch (err) {
      console.error('Failed to mark all read:', err);
    } finally {
      setMarkingAll(false);
    }
  }

  async function handleMarkRead(n: Notification) {
    if (n.readAt) return;
    try {
      await api.notifications.markRead(n.id);
      setNotifications((prev) =>
        prev.map((item) => item.id === n.id ? { ...item, readAt: new Date().toISOString() } : item)
      );
    } catch (err) {
      console.error('Failed to mark notification read:', err);
    }
  }

  const unreadCount = notifications.filter((n) => !n.readAt).length;
  const grouped = groupByDate(notifications);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Notifications</h1>
          <p className="page-subtitle">
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showUnreadOnly}
              onChange={(e) => setShowUnreadOnly(e.target.checked)}
            />
            Unread only
          </label>
          {unreadCount > 0 && (
            <button className="btn btn-secondary" onClick={handleMarkAllRead} disabled={markingAll}>
              {markingAll ? 'Marking…' : 'Mark all read'}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading notifications…</div>
      ) : notifications.length === 0 ? (
        <div className="card">
          <div className="empty-state" style={{ padding: '64px' }}>
            <p style={{ fontSize: '48px', marginBottom: '12px' }}>🔔</p>
            <p>{showUnreadOnly ? 'No unread notifications.' : 'No notifications yet.'}</p>
          </div>
        </div>
      ) : (
        <div>
          {Object.entries(grouped).map(([dateLabel, items]) => (
            <div key={dateLabel} style={{ marginBottom: '24px' }}>
              <div style={{
                fontSize: '12px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                color: 'var(--color-text-muted)',
                marginBottom: '8px',
              }}>
                {dateLabel}
              </div>
              <div className="card">
                {items.map((n, index) => {
                  const NotifWrapper = n.actionUrl ? Link : 'div';
                  const wrapperProps = n.actionUrl ? { href: n.actionUrl } : {};

                  return (
                    <NotifWrapper
                      key={n.id}
                      {...(wrapperProps as any)}
                      onClick={() => handleMarkRead(n)}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '12px',
                        padding: '14px 16px',
                        borderBottom: index < items.length - 1 ? '1px solid var(--color-border)' : 'none',
                        cursor: n.actionUrl ? 'pointer' : 'default',
                        background: !n.readAt ? 'var(--color-bg-hover, #f8f9fa)' : 'transparent',
                        textDecoration: 'none',
                        color: 'inherit',
                        transition: 'background 0.15s',
                      }}
                    >
                      <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        background: !n.readAt ? 'var(--color-primary-light, #eef2ff)' : 'var(--color-bg-muted, #f1f5f9)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '18px',
                        flexShrink: 0,
                      }}>
                        {TYPE_ICONS[n.type] ?? TYPE_ICONS.default}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                          <div style={{ fontWeight: !n.readAt ? 600 : 400, fontSize: '14px' }}>
                            {n.title}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                            {new Date(n.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          </div>
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                          {n.body}
                        </div>
                      </div>
                      {!n.readAt && (
                        <div style={{
                          width: '8px', height: '8px', borderRadius: '50%',
                          background: 'var(--color-primary, #6366f1)',
                          flexShrink: 0, marginTop: '6px',
                        }} />
                      )}
                    </NotifWrapper>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
