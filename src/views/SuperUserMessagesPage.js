/**
 * SuperUser-sida för att skicka och hantera meddelanden
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { messageService } from '../services/messageService';
import Header from '../components/layout/Header';

const SuperUserMessagesPage = () => {
  const navigate = useNavigate();
  const { isSuperUser, currentUser } = useAuth();
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showNewMessage, setShowNewMessage] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    body: '',
    type: 'info',
    targetType: 'all',
    targetId: ''
  });

  useEffect(() => {
    if (!isSuperUser) {
      navigate('/');
      return;
    }

    loadMessages();
  }, [isSuperUser, navigate]);

  const loadMessages = async () => {
    try {
      setIsLoading(true);
      const allMessages = await messageService.getAllMessages();
      setMessages(allMessages);
    } catch (error) {
      console.error('Kunde inte ladda meddelanden:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      await messageService.sendMessage(formData, currentUser.id);

      // Återställ formulär
      setFormData({
        title: '',
        body: '',
        type: 'info',
        targetType: 'all',
        targetId: ''
      });
      setShowNewMessage(false);

      // Ladda om meddelanden
      await loadMessages();

      alert('Meddelande skickat!');
    } catch (error) {
      console.error('Kunde inte skicka meddelande:', error);
      alert('Kunde inte skicka meddelande. Se konsolen för detaljer.');
    }
  };

  const handleDelete = async (messageId) => {
    if (!window.confirm('Är du säker på att du vill radera detta meddelande?')) {
      return;
    }

    try {
      await messageService.permanentDeleteMessage(messageId);
      await loadMessages();
    } catch (error) {
      console.error('Kunde inte radera meddelande:', error);
      alert('Kunde inte radera meddelande.');
    }
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp?.toDate) return 'N/A';
    return new Date(timestamp.toDate()).toLocaleString('sv-SE');
  };

  const getTypeColor = (type) => {
    switch (type) {
      case 'info': return 'bg-blue-500/20 text-blue-200 border-blue-500/50';
      case 'success': return 'bg-green-500/20 text-green-200 border-green-500/50';
      case 'warning': return 'bg-amber-500/20 text-amber-200 border-amber-500/50';
      case 'error': return 'bg-red-500/20 text-red-200 border-red-500/50';
      default: return 'bg-slate-500/20 text-slate-200 border-slate-500/50';
    }
  };

  const getTargetLabel = (message) => {
    if (message.targetType === 'all') return 'Alla användare';
    if (message.targetType === 'user') return `Användare: ${message.targetId}`;
    if (message.targetType === 'device') return `Enhet: ${message.targetId}`;
    return 'Okänd mottagare';
  };

  if (!isSuperUser) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <Header title="Meddelanden" />

      <div className="mx-auto max-w-6xl px-4 pt-24 pb-8 space-y-6">
        {/* Ny meddelande-knapp */}
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-200">Hantera meddelanden</h2>
          <button
            onClick={() => setShowNewMessage(!showNewMessage)}
            className="rounded bg-purple-500 px-4 py-2 font-semibold text-black hover:bg-purple-400"
          >
            {showNewMessage ? 'Avbryt' : '+ Nytt meddelande'}
          </button>
        </div>

        {/* Nytt meddelande-formulär */}
        {showNewMessage && (
          <form onSubmit={handleSubmit} className="rounded-lg border border-purple-500/40 bg-slate-900/60 p-6 space-y-4">
            <h3 className="text-xl font-semibold text-purple-200">Skapa nytt meddelande</h3>

            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-200">Rubrik</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2 text-gray-200"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-200">Meddelande</label>
              <textarea
                value={formData.body}
                onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2 text-gray-200 min-h-32"
                required
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-200">Typ</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2 text-gray-200"
                >
                  <option value="info">Info</option>
                  <option value="success">Framgång</option>
                  <option value="warning">Varning</option>
                  <option value="error">Fel</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-200">Mottagare</label>
                <select
                  value={formData.targetType}
                  onChange={(e) => setFormData({ ...formData, targetType: e.target.value, targetId: '' })}
                  className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2 text-gray-200"
                >
                  <option value="all">Alla</option>
                  <option value="user">Specifik användare</option>
                  <option value="device">Specifik enhet</option>
                </select>
              </div>

              {formData.targetType !== 'all' && (
                <div>
                  <label className="mb-1 block text-sm font-semibold text-gray-200">
                    {formData.targetType === 'user' ? 'Användar-ID' : 'Enhets-ID'}
                  </label>
                  <input
                    type="text"
                    value={formData.targetId}
                    onChange={(e) => setFormData({ ...formData, targetId: e.target.value })}
                    className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2 text-gray-200"
                    required
                  />
                </div>
              )}
            </div>

            <button
              type="submit"
              className="w-full rounded bg-purple-500 px-4 py-3 font-bold text-black hover:bg-purple-400"
            >
              Skicka meddelande
            </button>
          </form>
        )}

        {/* Meddelandelista */}
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-gray-200">Skickade meddelanden</h3>

          {isLoading ? (
            <div className="text-center py-12 text-gray-400">Laddar meddelanden...</div>
          ) : messages.length === 0 ? (
            <div className="text-center py-12 text-gray-400">Inga meddelanden hittades</div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className="rounded-lg border border-slate-700 bg-slate-900/60 p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="text-lg font-semibold text-gray-200">{message.title}</h4>
                      <span className={`px-2 py-0.5 border rounded text-xs font-medium ${getTypeColor(message.type)}`}>
                        {message.type}
                      </span>
                    </div>

                    <p className="text-gray-300 mb-3">{message.body}</p>

                    <div className="flex items-center gap-4 text-sm text-gray-400">
                      <span>Mottagare: {getTargetLabel(message)}</span>
                      <span>•</span>
                      <span>Skapat: {formatTimestamp(message.createdAt)}</span>
                      {message.read && (
                        <>
                          <span>•</span>
                          <span className="text-green-400">Läst</span>
                        </>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => handleDelete(message.id)}
                    className="text-red-400 hover:text-red-300 transition-colors p-2"
                    title="Radera"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default SuperUserMessagesPage;
