/**
 * SuperUser-sida för att visa och hantera alla användare
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { getFirebaseDb } from '../firebaseClient';
import Header from '../components/layout/Header';
import MessageDialog from '../components/shared/MessageDialog';

const SuperUserUsersPage = () => {
  const navigate = useNavigate();
  const { isSuperUser, currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedUsers, setSelectedUsers] = useState(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogConfig, setDialogConfig] = useState({ isOpen: false, title: '', message: '', type: 'info' });

  useEffect(() => {
    if (!isSuperUser) {
      navigate('/');
      return;
    }

    const loadUsers = async () => {
      try {
        setIsLoading(true);
        const db = getFirebaseDb();
        const usersCollection = collection(db, 'users');
        const snapshot = await getDocs(usersCollection);

        const usersData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

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
    // Förhindra att man markerar sig själv
    if (userId === currentUser?.id) {
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
    // Filtrera bort nuvarande användare från alla användare
    const selectableUsers = filteredUsers.filter(u => u.id !== currentUser?.id);

    if (selectedUsers.size === selectableUsers.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(selectableUsers.map(u => u.id)));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedUsers.size === 0) return;

    if (!window.confirm(`Är du säker på att du vill radera ${selectedUsers.size} användare?`)) {
      return;
    }

    try {
      const db = getFirebaseDb();
      const deletePromises = Array.from(selectedUsers).map(userId =>
        deleteDoc(doc(db, 'users', userId))
      );
      await Promise.all(deletePromises);

      setUsers(prev => prev.filter(u => !selectedUsers.has(u.id)));
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

  const filteredUsers = users.filter(user => {
    const matchesSearch =
      user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.id?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

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
              {selectedUsers.size === filteredUsers.filter(u => u.id !== currentUser?.id).length
                ? 'Avmarkera alla'
                : 'Markera alla'}
            </button>

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

        {isLoading ? (
          <div className="text-center py-12 text-gray-400">Laddar användare...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="text-center py-12 text-gray-400">Inga användare hittades</div>
        ) : (
          <div className="space-y-2">
            {filteredUsers.map(user => {
              const isCurrentUser = user.id === currentUser?.id;
              const isSuperUserAccount = user.superUser === true;

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
                      disabled={isCurrentUser}
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

                      {user.createdAt && (
                        <div className="mt-2 text-xs text-gray-500">
                          Registrerad: {new Date(user.createdAt).toLocaleString('sv-SE')}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

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