/**
 * SuperUser-sida för att visa och hantera alla användare
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
// ...existing code...
import Header from '../components/layout/Header';
import MessageDialog from '../components/shared/MessageDialog';
import { questionService } from '../services/questionService';
import { messageService } from '../services/messageService';

const SuperUserUsersPage = () => {
  const navigate = useNavigate();
  const { isSuperUser, currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedUsers, setSelectedUsers] = useState(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogConfig, setDialogConfig] = useState({ isOpen: false, title: '', message: '', type: 'info' });
  const [showMessageForm, setShowMessageForm] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageForm, setMessageForm] = useState({
    title: '',
    body: '',
    type: 'info'
  });
  const [selectedUser, setSelectedUser] = useState(null);
  const [userRuns, setUserRuns] = useState([]);
  const [isRunsLoading, setRunsLoading] = useState(false);
  const [runsError, setRunsError] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('sv');
  const isSelectableUser = (user) => {
    if (!user?.id) return false;
    if (user.id === currentUser?.id) return false;
    if (user.isAnonymous && !user.deviceId) return false;
    return true;
  };

  const getSelectableUsers = (list) => list.filter((user) => isSelectableUser(user));

  useEffect(() => {
    if (!isSuperUser) {
      navigate('/');
      return;
    }

    const loadUsers = async () => {
      try {
        setIsLoading(true);
        const response = await fetch('/api/users');
        if (!response.ok) throw new Error('Kunde inte hämta användare');
        const usersData = await response.json();
        setUsers(usersData || []);
      } catch (error) {
        console.error('Kunde inte ladda användare:', error);
        setUsers([]);
      } finally {
        setIsLoading(false);
      }
    };
    loadUsers();
  }, [isSuperUser, navigate]);

  const handleToggleUser = (userId) => {
    const targetUser = users.find((entry) => entry.id === userId);
    if (targetUser && !isSelectableUser(targetUser)) {
      return;
    }

    setSelectedUsers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    const selectableUsers = getSelectableUsers(filteredUsers);

    if (selectedUsers.size === selectableUsers.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(selectableUsers.map(u => u.id)));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedUsers.size === 0) return;

    const deletableIds = Array.from(selectedUsers).filter((id) => !id.startsWith('anon:'));
    if (deletableIds.length === 0) {
      return;
    }

    if (!window.confirm(`Är du säker på att du vill radera ${deletableIds.length} användare?`)) {
      return;
    }

    try {
      const deletePromises = deletableIds.map(userId =>
        fetch(`/api/users/${userId}`, { method: 'DELETE' })
      );
      await Promise.all(deletePromises);
      setUsers(prev => prev.filter(u => !deletableIds.includes(u.id)));
      setSelectedUsers(new Set());
    } catch (error) {
      console.error('Kunde inte radera användare:', error);
      setDialogConfig({
        isOpen: true,
        title: 'Kunde inte radera användare',
        message: 'Kunde inte radera alla användare. Se konsolen för detaljer.',
        type: 'error'
      });
    }
  };

  const handleSendMessage = async (event) => {
    event.preventDefault();
    const title = messageForm.title.trim();
    const body = messageForm.body.trim();
    if (!title || !body) {
      setDialogConfig({
        isOpen: true,
        title: 'Ogiltigt meddelande',
        message: 'Titel och meddelande får inte vara tomma.',
        type: 'warning'
      });
      return;
    }

    const recipients = Array.from(selectedUsers)
      .map((userId) => users.find((entry) => entry.id === userId))
      .filter((user) => user && isSelectableUser(user));
    if (recipients.length === 0) {
      setDialogConfig({
        isOpen: true,
        title: 'Ingen mottagare',
        message: 'Välj minst en användare att skicka till.',
        type: 'warning'
      });
      return;
    }

    setSendingMessage(true);
    try {
      const payload = {
        title,
        body,
        type: messageForm.type,
        adminId: currentUser?.id || null,
        metadata: { source: 'users_page' }
      };
      await Promise.all(
        recipients.map((user) => {
          const isAnonymous = user?.isAnonymous && user?.deviceId;
          return messageService.sendMessage({
            ...payload,
            targetType: isAnonymous ? 'device' : 'user',
            targetId: isAnonymous ? user.deviceId : user.id,
            userId: isAnonymous ? null : user.id,
            deviceId: isAnonymous ? user.deviceId : null
          }, currentUser?.email || '');
        })
      );
      setDialogConfig({
        isOpen: true,
        title: 'Meddelande skickat',
        message: `Meddelande skickat till ${recipients.length} användare.`,
        type: 'success'
      });
      setShowMessageForm(false);
      setMessageForm({ title: '', body: '', type: 'info' });
    } catch (error) {
      console.error('Kunde inte skicka meddelande:', error);
      setDialogConfig({
        isOpen: true,
        title: 'Kunde inte skicka meddelande',
        message: error.message || 'Kunde inte skicka meddelande.',
        type: 'error'
      });
    } finally {
      setSendingMessage(false);
    }
  };

  const formatDateTime = (value) => {
    if (!value) return 'Okänt';
    try {
      return new Date(value).toLocaleString('sv-SE', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'Okänt';
    }
  };

  const handleViewRuns = async (user) => {
    if (!user?.id) return;
    if (selectedUser?.id === user.id) {
      setSelectedUser(null);
      setUserRuns([]);
      setRunsError('');
      return;
    }

    setSelectedUser(user);
    setRunsLoading(true);
    setRunsError('');
    try {
      const response = await fetch(`/api/users/${encodeURIComponent(user.id)}/runs`);
      if (!response.ok) {
        throw new Error('Kunde inte hämta användarens rundor');
      }
      const data = await response.json();
      const runs = Array.isArray(data?.runs) ? data.runs : [];
      setUserRuns(runs);

      const questionIds = new Set();
      runs.forEach((entry) => {
        const ids = entry?.run?.questionIds;
        if (Array.isArray(ids)) {
          ids.forEach((id) => questionIds.add(id));
        }
      });
      if (questionIds.size > 0) {
        questionService.ensureQuestionsByIds(Array.from(questionIds));
      }
    } catch (error) {
      console.error('Kunde inte hämta rundor:', error);
      setRunsError(error.message || 'Kunde inte hämta rundor');
      setUserRuns([]);
    } finally {
      setRunsLoading(false);
    }
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch =
      user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.deviceId?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });
  const selectableUsers = getSelectableUsers(filteredUsers);

  if (!isSuperUser) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <Header title="Alla användare" />

      <div className="mx-auto max-w-6xl px-4 pt-24 pb-8">
        <div className="mb-6 flex flex-col md:flex-row gap-4 items-center justify-between">
          <input
            type="text"
            placeholder="Sök användare..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full md:w-96 rounded bg-slate-800 border border-slate-600 px-4 py-2 text-gray-200"
          />

          <div className="flex gap-2">
            <button
              onClick={handleSelectAll}
              className="rounded bg-slate-700 px-4 py-2 font-semibold text-gray-200 hover:bg-slate-600"
            >
              {selectableUsers.length > 0 && selectedUsers.size === selectableUsers.length
                ? 'Avmarkera alla'
                : 'Markera alla'}
            </button>

            {selectedUsers.size > 0 && (
              <button
                onClick={() => setShowMessageForm((prev) => !prev)}
                className="rounded bg-emerald-500 px-4 py-2 font-semibold text-black hover:bg-emerald-400"
              >
                {showMessageForm ? 'Stäng meddelande' : `Skicka meddelande (${selectedUsers.size})`}
              </button>
            )}

            {selectedUsers.size > 0 && (
              <button
                onClick={handleDeleteSelected}
                className="rounded bg-red-500 px-4 py-2 font-semibold text-white hover:bg-red-400"
              >
                Radera markerade ({selectedUsers.size})
              </button>
            )}
          </div>
        </div>

        {showMessageForm && selectedUsers.size > 0 && (
          <form onSubmit={handleSendMessage} className="mb-6 rounded-xl border border-emerald-500/30 bg-slate-900/60 p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-emerald-200">
                  Skicka meddelande till {selectedUsers.size} användare
                </h3>
                <span className="text-xs text-slate-400">Kräver användare eller device-id</span>
              </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-200">Rubrik</label>
              <input
                type="text"
                value={messageForm.title}
                onChange={(event) => setMessageForm((prev) => ({ ...prev, title: event.target.value }))}
                className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2 text-gray-200"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-200">Meddelande</label>
              <textarea
                value={messageForm.body}
                onChange={(event) => setMessageForm((prev) => ({ ...prev, body: event.target.value }))}
                className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2 text-gray-200 min-h-28"
                required
              />
            </div>
            <div className="flex flex-wrap gap-3 items-center justify-between">
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-300">Typ</label>
                <select
                  value={messageForm.type}
                  onChange={(event) => setMessageForm((prev) => ({ ...prev, type: event.target.value }))}
                  className="rounded bg-slate-800 border border-slate-600 px-3 py-2 text-gray-200"
                >
                  <option value="info">Info</option>
                  <option value="success">Framgång</option>
                  <option value="warning">Varning</option>
                  <option value="error">Fel</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={sendingMessage}
                className="rounded bg-emerald-500 px-4 py-2 font-semibold text-black hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-300"
              >
                {sendingMessage ? 'Skickar...' : 'Skicka'}
              </button>
            </div>
          </form>
        )}

        {isLoading ? (
          <div className="text-center py-12 text-gray-400">Laddar användare...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="text-center py-12 text-gray-400">Inga användare hittades</div>
        ) : (
          <div className="space-y-2">
            {filteredUsers.map(user => {
              const isCurrentUser = user.id === currentUser?.id;
              const isSuperUserAccount = user.superUser === true;
              const isAnonymousUser = user.isAnonymous === true;
              const canSelect = isSelectableUser(user);

              return (
                <div
                  key={user.id}
                  className={`rounded-lg border p-4 transition-colors ${
                    isCurrentUser
                      ? 'border-yellow-500 bg-yellow-900/20'
                      : selectedUsers.has(user.id)
                      ? 'border-cyan-500 bg-cyan-900/20'
                      : 'border-slate-700 bg-slate-900/60'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <input
                      type="checkbox"
                      checked={selectedUsers.has(user.id)}
                      onChange={() => handleToggleUser(user.id)}
                      disabled={!canSelect}
                      className="mt-1 w-5 h-5 rounded disabled:opacity-30"
                    />

                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-lg font-semibold text-gray-200">{user.name}</h3>
                        {isCurrentUser && (
                          <span className="px-2 py-0.5 bg-yellow-500/20 border border-yellow-500/50 rounded text-xs text-yellow-300">
                            Du
                          </span>
                        )}
                        {isSuperUserAccount && (
                          <span className="px-2 py-0.5 bg-red-500/20 border border-red-500/50 rounded text-xs text-red-300">
                            SuperUser
                          </span>
                        )}
                        {isAnonymousUser && (
                          <span className="px-2 py-0.5 bg-slate-600/40 border border-slate-500/60 rounded text-xs text-slate-200">
                            Anonym
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm text-gray-400">
                        <div>
                          <span className="font-semibold">Kontakt:</span> {user.profile?.contact || user.email || user.contact || 'Ej angiven'}
                        </div>
                        <div>
                          <span className="font-semibold">Namn:</span> {user.profile?.displayName || user.name || 'Ej angiven'}
                        </div>
                        <div>
                          <span className="font-semibold">ID:</span> {user.id}
                        </div>
                      </div>
                      {user.isAnonymous && user.deviceId && (
                        <div className="mt-2 text-xs text-slate-500">
                          Device ID: <span className="font-mono">{user.deviceId}</span>
                        </div>
                      )}

                      {user.createdAt && (
                        <div className="mt-2 text-xs text-gray-500">
                          Registrerad: {new Date(user.createdAt).toLocaleString('sv-SE')}
                        </div>
                      )}
                      {!user.createdAt && user.lastSeen && (
                        <div className="mt-2 text-xs text-gray-500">
                          Senast sedd: {new Date(user.lastSeen).toLocaleString('sv-SE')}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => handleViewRuns(user)}
                        className="rounded bg-cyan-500 px-3 py-2 text-sm font-semibold text-black hover:bg-cyan-400"
                      >
                        {selectedUser?.id === user.id ? 'Dölj rundor' : 'Visa rundor'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectedUser && (
        <div className="mx-auto mt-8 max-w-6xl px-4 pb-8">
          <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-100">Rundor för {selectedUser.name}</h2>
                <p className="text-sm text-slate-400">Användar-ID: {selectedUser.id}</p>
              </div>
              <div className="flex gap-2 rounded-lg bg-slate-800 p-1">
                <button
                  type="button"
                  onClick={() => setSelectedLanguage('sv')}
                  className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${selectedLanguage === 'sv' ? 'bg-cyan-500 text-black' : 'text-gray-300 hover:text-white'}`}
                >
                  🇸🇪 SV
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedLanguage('en')}
                  className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${selectedLanguage === 'en' ? 'bg-cyan-500 text-black' : 'text-gray-300 hover:text-white'}`}
                >
                  🇬🇧 EN
                </button>
              </div>
            </div>

            {isRunsLoading ? (
              <div className="mt-6 text-center text-gray-400">Laddar rundor...</div>
            ) : runsError ? (
              <div className="mt-6 rounded-xl border border-red-500/40 bg-red-900/40 px-4 py-3 text-red-100">
                {runsError}
              </div>
            ) : userRuns.length === 0 ? (
              <div className="mt-6 text-center text-gray-400">Inga rundor hittades för användaren.</div>
            ) : (
              <div className="mt-6 space-y-4">
                {userRuns.map((entry, index) => {
                  const run = entry?.run;
                  const participant = entry?.participant;
                  const answers = Array.isArray(entry?.answers) ? entry.answers : [];
                  const questionIds = Array.isArray(run?.questionIds) ? run.questionIds : [];
                  const correctAnswers = Number.isFinite(entry?.correctAnswers)
                    ? entry.correctAnswers
                    : answers.filter((answer) => answer?.isCorrect).length;
                  const totalQuestions = Number.isFinite(entry?.totalQuestions)
                    ? entry.totalQuestions
                    : questionIds.length;
                  const answerLookup = new Map(answers.map((answer) => [answer.questionId, answer]));

                  return (
                    <div key={`${participant?.id || run?.id || index}`} className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-semibold text-slate-100">{run?.name || 'Okänd runda'}</h3>
                          <p className="text-sm text-slate-400">
                            Alias: {participant?.alias || 'Okänt'} · Status: {run?.status || 'okänd'}
                          </p>
                          <p className="text-xs text-slate-500">
                            Anslöt: {formatDateTime(participant?.joinedAt)} · Klart: {formatDateTime(participant?.completedAt)} · Senast aktiv: {formatDateTime(participant?.lastSeen)}
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-slate-400">Resultat</div>
                          <div className="text-lg font-semibold text-cyan-200">
                            {correctAnswers} / {totalQuestions || answers.length}
                          </div>
                          <div className="text-xs text-slate-500">Svar: {answers.length}</div>
                        </div>
                      </div>

                      <details className="mt-4 rounded-lg border border-slate-700 bg-slate-900/40 p-3">
                        <summary className="cursor-pointer text-sm font-semibold text-cyan-200">
                          Visa svar
                        </summary>
                        <div className="mt-3 space-y-3 text-sm text-slate-200">
                          {questionIds.length === 0 && (
                            <div className="text-slate-400">Inga fråge-ID:n för denna runda.</div>
                          )}
                          {questionIds.map((questionId, questionIndex) => {
                            const answer = answerLookup.get(questionId);
                            const question = questionService.getByIdForLanguage(questionId, selectedLanguage)
                              || questionService.getByIdForLanguage(questionId, 'sv')
                              || questionService.getById(questionId);
                            const questionText = question?.text || `Fråga ${questionId}`;
                            const answerIndex = Number.isFinite(answer?.answerIndex) ? answer.answerIndex : null;
                            const selectedOption = answerIndex !== null ? question?.options?.[answerIndex] : null;
                            const correctOption = Number.isFinite(question?.correctOption)
                              ? question?.options?.[question.correctOption]
                              : null;
                            const isCorrect = Boolean(answer?.isCorrect);

                            return (
                              <div key={`${participant?.id}-${questionId}`} className="rounded-lg border border-slate-700 bg-slate-950/40 p-3">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="text-slate-300">
                                    {questionIndex + 1}. {questionText}
                                  </div>
                                  {answer && (
                                    <div className={`text-xs font-semibold ${isCorrect ? 'text-emerald-300' : 'text-red-300'}`}>
                                      {isCorrect ? 'Rätt' : 'Fel'}
                                    </div>
                                  )}
                                </div>
                                <div className="mt-2 text-xs text-slate-400">
                                  Svar: {selectedOption || (answer ? `Alternativ ${answerIndex + 1}` : 'Ej svarad')}
                                </div>
                                {answer && correctOption && (
                                  <div className="mt-1 text-xs text-slate-500">
                                    Rätt svar: {correctOption}
                                  </div>
                                )}
                                {answer?.answeredAt && (
                                  <div className="mt-1 text-xs text-slate-500">
                                    Tid: {formatDateTime(answer.answeredAt)}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          {questionIds.length === 0 && answers.length > 0 && answers.map((answer, answerIndex) => {
                            const question = questionService.getByIdForLanguage(answer.questionId, selectedLanguage)
                              || questionService.getByIdForLanguage(answer.questionId, 'sv')
                              || questionService.getById(answer.questionId);
                            const questionText = question?.text || `Fråga ${answer.questionId}`;
                            const selectedOption = Number.isFinite(answer.answerIndex)
                              ? question?.options?.[answer.answerIndex]
                              : null;
                            const correctOption = Number.isFinite(question?.correctOption)
                              ? question?.options?.[question.correctOption]
                              : null;
                            const isCorrect = Boolean(answer?.isCorrect);

                            return (
                              <div key={`${participant?.id}-${answer.questionId}-${answerIndex}`} className="rounded-lg border border-slate-700 bg-slate-950/40 p-3">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="text-slate-300">
                                    {answerIndex + 1}. {questionText}
                                  </div>
                                  <div className={`text-xs font-semibold ${isCorrect ? 'text-emerald-300' : 'text-red-300'}`}>
                                    {isCorrect ? 'Rätt' : 'Fel'}
                                  </div>
                                </div>
                                <div className="mt-2 text-xs text-slate-400">
                                  Svar: {selectedOption || `Alternativ ${Number.isFinite(answer.answerIndex) ? answer.answerIndex + 1 : '?'}`}
                                </div>
                                {correctOption && (
                                  <div className="mt-1 text-xs text-slate-500">
                                    Rätt svar: {correctOption}
                                  </div>
                                )}
                                {answer?.answeredAt && (
                                  <div className="mt-1 text-xs text-slate-500">
                                    Tid: {formatDateTime(answer.answeredAt)}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </details>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <MessageDialog
        isOpen={dialogConfig.isOpen}
        onClose={() => setDialogConfig({ ...dialogConfig, isOpen: false })}
        title={dialogConfig.title}
        message={dialogConfig.message}
        type={dialogConfig.type}
      />
    </div>
  );
};

export default SuperUserUsersPage;
