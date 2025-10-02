/**
 * MessagesDropdown - Visar användarens meddelanden i en dropdown
 */
import React, { useEffect, useState } from 'react';
import { messageService } from '../../services/messageService';
import { analyticsService } from '../../services/analyticsService';
import { useAuth } from '../../context/AuthContext';

const MessagesDropdown = ({ isOpen, onClose }) => {
  const { currentUser } = useAuth();
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const deviceId = analyticsService.getDeviceId();
    const userId = currentUser?.isAnonymous ? null : currentUser?.id;

    // Sätt upp realtidslyssnare på meddelanden
    const unsubscribe = messageService.subscribeToMessages(
      userId,
      deviceId,
      (updatedMessages) => {
        setMessages(updatedMessages);
        setIsLoading(false);
      }
    );

    // Städa upp lyssnaren när komponenten unmountas
    return () => {
      unsubscribe();
    };
  }, [currentUser]);

  const handleMarkAsRead = async (messageId) => {
    try {
      await messageService.markAsRead(messageId);
    } catch (error) {
      console.error('Kunde inte markera meddelande som läst:', error);
    }
  };

  const handleDelete = async (messageId) => {
    try {
      await messageService.deleteMessage(messageId);
    } catch (error) {
      console.error('Kunde inte radera meddelande:', error);
    }
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp?.toDate) return '';
    const date = timestamp.toDate();
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m sedan`;
    if (diffHours < 24) return `${diffHours}h sedan`;
    if (diffDays < 7) return `${diffDays}d sedan`;
    return date.toLocaleDateString('sv-SE');
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'success':
        return (
          <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'warning':
        return (
          <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        );
      case 'error':
        return (
          <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      default:
        return (
          <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  if (!isOpen) return null;

  const unreadCount = messages.filter(m => !m.read).length;

  return (
    <div className="absolute right-0 mt-2 w-96 bg-slate-900 rounded-lg border border-slate-700 shadow-xl z-50 max-h-[32rem] overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-200">Meddelanden</h3>
        {unreadCount > 0 && (
          <span className="px-2 py-0.5 bg-cyan-500 rounded-full text-xs font-bold text-black">
            {unreadCount}
          </span>
        )}
      </div>

      {/* Messages list */}
      <div className="overflow-y-auto flex-1">
        {isLoading ? (
          <div className="text-center py-8 text-gray-400">Laddar...</div>
        ) : messages.length === 0 ? (
          <div className="text-center py-8 text-gray-400">Inga meddelanden</div>
        ) : (
          <div className="divide-y divide-slate-700">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`p-4 hover:bg-slate-800/50 transition-colors ${
                  !message.read ? 'bg-slate-800/30' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    {getTypeIcon(message.type)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h4 className="text-sm font-semibold text-gray-200 truncate">
                        {message.title}
                      </h4>
                      {!message.read && (
                        <span className="flex-shrink-0 w-2 h-2 bg-cyan-500 rounded-full" />
                      )}
                    </div>

                    <p className="text-sm text-gray-300 mb-2 line-clamp-2">
                      {message.body}
                    </p>

                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>{formatTimestamp(message.createdAt)}</span>

                      {!message.read && (
                        <>
                          <span>•</span>
                          <button
                            onClick={() => handleMarkAsRead(message.id)}
                            className="text-cyan-400 hover:text-cyan-300 transition-colors"
                          >
                            Markera som läst
                          </button>
                        </>
                      )}

                      <span>•</span>
                      <button
                        onClick={() => handleDelete(message.id)}
                        className="text-red-400 hover:text-red-300 transition-colors"
                      >
                        Radera
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-700">
        <button
          onClick={onClose}
          className="w-full text-sm text-cyan-400 hover:text-cyan-300 transition-colors font-semibold"
        >
          Stäng
        </button>
      </div>
    </div>
  );
};

export default MessagesDropdown;
