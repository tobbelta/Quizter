/**
 * SuperUser-sida för att visa systemnotifikationer (t.ex. från questionImport)
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
// ...existing code...
// ...existing code...
import Header from '../components/layout/Header';

// ...existing code...

const SuperUserNotificationsPage = () => {
  const navigate = useNavigate();
  const { isSuperUser } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all', 'unread', 'success', 'error'

  useEffect(() => {
    if (!isSuperUser) {
      navigate('/');
      return;
    }

    // Hämta notifikationer via API
    const loadNotifications = async () => {
      try {
        setIsLoading(true);
        const response = await fetch('/api/notifications?targetAudience=superusers');
        if (!response.ok) throw new Error('Kunde inte hämta notifikationer');
        const notifs = await response.json();
        setNotifications(notifs);
      } catch (error) {
        setNotifications([]);
      } finally {
        setIsLoading(false);
      }
    };
    loadNotifications();
  }, [isSuperUser, navigate]);

  const markAsRead = async (notificationId) => {
    try {
      await fetch(`/api/notifications/${notificationId}/read`, { method: 'POST' });
    } catch (error) {
      console.error('Kunde inte markera som läst:', error);
    }
  };

  const markAllAsRead = async () => {
    const unreadNotifs = notifications.filter(n => !n.read);
    const promises = unreadNotifs.map(n =>
      fetch(`/api/notifications/${n.id}/read`, { method: 'POST' })
    );
    try {
      await Promise.all(promises);
    } catch (error) {
      console.error('Kunde inte markera alla som lästa:', error);
    }
  };

  const filteredNotifications = notifications.filter(notif => {
    if (filter === 'unread') return !notif.read;
    if (filter === 'success') return notif.type === 'question_import';
    if (filter === 'error') return notif.type === 'question_import_error';
    return true;
  });

  const unreadCount = notifications.filter(n => !n.read).length;

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just nu';
    if (diffMins < 60) return `${diffMins} min sedan`;
    if (diffHours < 24) return `${diffHours} timmar sedan`;
    if (diffDays < 7) return `${diffDays} dagar sedan`;
    return date.toLocaleDateString('sv-SE');
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'question_import':
        return '✅';
      case 'question_import_error':
        return '❌';
      default:
        return '📢';
    }
  };

  const getNotificationColor = (type) => {
    switch (type) {
      case 'question_import':
        return 'border-green-500/40 bg-green-900/20';
      case 'question_import_error':
        return 'border-red-500/40 bg-red-900/20';
      default:
        return 'border-cyan-500/40 bg-cyan-900/20';
    }
  };

  if (!isSuperUser) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <Header title="Systemnotiser" />

      <div className="mx-auto max-w-4xl px-4 pt-24 pb-8 space-y-6">
        {/* Header med filter och actions */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-200">Systemnotiser</h2>
            <p className="text-sm text-gray-400">
              {unreadCount > 0 ? `${unreadCount} olästa notiser` : 'Inga olästa notiser'}
            </p>
          </div>

          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-black rounded-lg font-semibold transition-colors"
            >
              Markera alla som lästa
            </button>
          )}
        </div>

        {/* Filter */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
              filter === 'all'
                ? 'bg-cyan-500 text-black'
                : 'bg-slate-800 text-gray-300 hover:bg-slate-700'
            }`}
          >
            Alla ({notifications.length})
          </button>
          <button
            onClick={() => setFilter('unread')}
            className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
              filter === 'unread'
                ? 'bg-cyan-500 text-black'
                : 'bg-slate-800 text-gray-300 hover:bg-slate-700'
            }`}
          >
            Olästa ({unreadCount})
          </button>
          <button
            onClick={() => setFilter('success')}
            className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
              filter === 'success'
                ? 'bg-cyan-500 text-black'
                : 'bg-slate-800 text-gray-300 hover:bg-slate-700'
            }`}
          >
            Lyckade ({notifications.filter(n => n.type === 'question_import').length})
          </button>
          <button
            onClick={() => setFilter('error')}
            className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
              filter === 'error'
                ? 'bg-cyan-500 text-black'
                : 'bg-slate-800 text-gray-300 hover:bg-slate-700'
            }`}
          >
            Fel ({notifications.filter(n => n.type === 'question_import_error').length})
          </button>
        </div>

        {/* Notifikationslista */}
        <div className="space-y-3">
          {isLoading ? (
            <div className="text-center py-12 text-gray-400">Laddar notiser...</div>
          ) : filteredNotifications.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              {filter === 'all' ? 'Inga notiser ännu' : 'Inga notiser matchar filtret'}
            </div>
          ) : (
            filteredNotifications.map((notif) => (
              <div
                key={notif.id}
                className={`rounded-lg border p-4 transition-all ${getNotificationColor(notif.type)} ${
                  !notif.read ? 'ring-2 ring-cyan-500/50' : ''
                }`}
                onClick={() => !notif.read && markAsRead(notif.id)}
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl flex-shrink-0">{getNotificationIcon(notif.type)}</span>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="font-semibold text-gray-200">
                        {notif.title}
                        {!notif.read && (
                          <span className="ml-2 px-2 py-0.5 bg-cyan-500 text-black text-xs rounded-full">
                            Nytt
                          </span>
                        )}
                      </h3>
                      <span className="text-xs text-gray-400 whitespace-nowrap">
                        {formatTimestamp(notif.createdAt)}
                      </span>
                    </div>

                    <p className="text-sm text-gray-300 mb-2">{notif.message}</p>

                    {/* Extra data */}
                    {notif.data && (
                      <div className="text-xs text-gray-400 space-y-1">
                        {notif.data.count && (
                          <div>Antal frågor: <strong className="text-gray-300">{notif.data.count}</strong></div>
                        )}
                        {notif.data.provider && (
                          <div>AI-provider: <strong className="text-gray-300">{notif.data.provider}</strong></div>
                        )}
                        {notif.data.error && (
                          <div className="text-red-300">Fel: {notif.data.error}</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default SuperUserNotificationsPage;
