import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { auth, db } from '../../firebase';
import { collection, doc, updateDoc, onSnapshot, query, where, addDoc, getDocs, arrayUnion, deleteDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { v4 as uuidv4 } from 'uuid';
import { useDebug } from '../../context/DebugContext';
import ProfileModal from '../shared/ProfileModal';
import Spinner from '../shared/Spinner';
import InstructionsModal from '../shared/InstructionsModal';
import ConfirmModal from '../shared/ConfirmModal';
import Header from '../shared/Header';

const BUTTON_CLASS = "sc-button w-full sm:w-auto text-sm py-2 px-4";
const LOADING_SKELETON = "w-full sm:w-40 h-12 bg-gray-800 animate-pulse rounded-lg";

const TeamCard = ({ team, user, onDeleteTeam, selectedTeams, onToggleTeam, onRestartGame }) => {
    const navigate = useNavigate();
    const [game, setGame] = useState(null);
    const [loadingGame, setLoadingGame] = useState(true);

    const isLeader = useMemo(() => user.uid === team.leaderId, [user.uid, team.leaderId]);
    const isSelected = selectedTeams?.has(team.id) || false;

    useEffect(() => {
        if (!team.currentGameId) {
            setGame(null);
            setLoadingGame(false);
            return;
        }

        const gameRef = doc(db, 'games', team.currentGameId);
        const unsubscribe = onSnapshot(gameRef, (doc) => {
            setGame(doc.exists() ? { id: doc.id, ...doc.data() } : null);
            setLoadingGame(false);
        });

        return () => unsubscribe();
    }, [team.currentGameId]);

    const handleGoToGame = useCallback(() => {
        if (!game) return;
        navigate(`/game/${game.id}`);
    }, [game, navigate]);

    const handleCreateGame = useCallback(() => {
        navigate('/lobby', {
            state: {
                teamId: team.id,
                teamName: team.name,
                fromTeamPage: true
            }
        });
    }, [navigate, team.id, team.name]);

    const handleViewReport = useCallback(() => {
        navigate(`/report/${game.id}`);
    }, [navigate, game]);

    const renderLeaderAction = () => {
        if (!game) {
            return <button onClick={handleCreateGame} className={BUTTON_CLASS}>Skapa Spel</button>;
        }

        if (game.status === 'finished') {
            return (
                <div className="flex gap-2 w-full sm:w-auto">
                    <button onClick={handleViewReport} className={BUTTON_CLASS}>Visa Rapport</button>
                    <button
                        onClick={() => onRestartGame(game.id)}
                        className={`${BUTTON_CLASS} sc-button-yellow`}
                        title="Starta om spelet"
                    >
                        🔄 Starta om
                    </button>
                </div>
            );
        }

        if (game.status === 'started') {
            return (
                <div className="flex gap-2 w-full sm:w-auto">
                    <button onClick={handleGoToGame} className={`${BUTTON_CLASS} sc-button-blue`}>Gå till Spel</button>
                    <button
                        onClick={() => onRestartGame(game.id)}
                        className={`${BUTTON_CLASS} sc-button-yellow`}
                        title="Starta om spelet"
                    >
                        🔄 Starta om
                    </button>
                </div>
            );
        }

        return <button onClick={handleGoToGame} className={`${BUTTON_CLASS} sc-button-blue`}>Gå till Spel</button>;
    };

    const renderMemberAction = () => {
        if (!game) {
            return <p className="text-sm text-text-secondary text-left sm:text-right">Väntar på ledare...</p>;
        }

        if (game.status === 'finished') {
            return <button onClick={handleViewReport} className={BUTTON_CLASS}>Visa Rapport</button>;
        }

        if (game.status === 'created') {
            return <p className="text-sm text-accent-cyan text-left sm:text-right">Väntar på start...</p>;
        }

        return <button onClick={handleGoToGame} className={`${BUTTON_CLASS} sc-button-blue`}>Gå till Spel</button>;
    };

    const renderAction = () => {
        if (loadingGame) {
            return <div className={LOADING_SKELETON}></div>;
        }

        return isLeader ? renderLeaderAction() : renderMemberAction();
    };

    return (
        <li className="sc-card flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
            <div className="flex items-center gap-4 flex-1">
                {isLeader && onToggleTeam && (
                    <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleTeam(team.id)}
                        className="w-4 h-4 text-accent-cyan bg-gray-800 border-gray-600 rounded focus:ring-accent-cyan"
                    />
                )}
                <div className="flex-1">
                    <span className="font-bold text-lg text-white">{team.name}</span>
                    <p className="text-sm text-text-secondary">Kod: <span className="font-mono bg-black px-2 py-1 rounded-md">{team.joinCode}</span></p>
                </div>
            </div>
            <div className="flex flex-wrap gap-2 w-full sm:w-auto pt-2 sm:pt-0 justify-end">
                <div className="flex gap-2">
                    {renderAction()}
                </div>
                {isLeader && onDeleteTeam && (
                    <button
                        onClick={() => onDeleteTeam(team.id)}
                        className="sc-button sc-button-red text-sm px-3 py-2"
                        title="Radera lag"
                    >
                        🗑️
                    </button>
                )}
            </div>
        </li>
    );
};

const TeamsPage = ({ user, userData }) => {
  const { clearLogs } = useDebug();
  const [teams, setTeams] = useState([]);
  const [teamName, setTeamName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isInstructionsOpen, setIsInstructionsOpen] = useState(false);
  const [selectedTeams, setSelectedTeams] = useState(new Set());
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, onConfirm: null, message: '' });
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'teams'), where('memberIds', 'array-contains', user.uid));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      setTeams(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

  const generateJoinCode = () => uuidv4().substring(0, 6).toUpperCase();

  const handleCreateTeam = useCallback(async (e) => {
    e.preventDefault();
    if (!teamName.trim()) return;

    setError('');

    try {
      await addDoc(collection(db, 'teams'), {
        name: teamName.trim(),
        leaderId: user.uid,
        memberIds: [user.uid],
        joinCode: generateJoinCode(),
        createdAt: new Date(),
        currentGameId: null
      });
      setTeamName('');
    } catch (err) {
      console.error('Error creating team:', err);
      setError("Kunde inte skapa laget.");
    }
  }, [teamName, user.uid]);

  const handleJoinTeam = useCallback(async (e) => {
    e.preventDefault();
    if (!joinCode.trim()) return;

    setError('');
    const normalizedJoinCode = joinCode.trim().toUpperCase();

    try {
      const q = query(collection(db, 'teams'), where('joinCode', '==', normalizedJoinCode));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        setError("Inget lag hittades med den koden.");
        return;
      }

      const teamDoc = querySnapshot.docs[0];
      const teamData = teamDoc.data();

      if (teamData.memberIds.includes(user.uid)) {
        setError("Du är redan med i detta lag.");
        return;
      }

      await updateDoc(doc(db, 'teams', teamDoc.id), {
        memberIds: arrayUnion(user.uid)
      });

      setJoinCode('');
    } catch (err) {
      console.error('Error joining team:', err);
      setError("Kunde inte ansluta till laget.");
    }
  }, [joinCode, user.uid]);

  // Raderingsfunktioner
  const handleDeleteTeam = useCallback((teamId) => {
    const team = teams.find(t => t.id === teamId);
    if (!team || team.leaderId !== user.uid) return; // Säkerhetskoll

    const deleteTeam = async () => {
      try {
        await deleteDoc(doc(db, 'teams', teamId));
        setConfirmModal({ isOpen: false, onConfirm: null, message: '' });
      } catch (error) {
        console.error("Error deleting team:", error);
        setError("Kunde inte radera laget.");
        setConfirmModal({ isOpen: false, onConfirm: null, message: '' });
      }
    };

    setConfirmModal({
      isOpen: true,
      message: `Är du säker på att du vill radera laget "${team.name}" permanent? Denna åtgärd kan inte ångras.`,
      onConfirm: deleteTeam,
    });
  }, [teams, user.uid]);

  const handleToggleTeam = useCallback((teamId) => {
    const team = teams.find(t => t.id === teamId);
    if (!team || team.leaderId !== user.uid) return; // Bara lagledare kan välja sina lag

    const newSelected = new Set(selectedTeams);
    if (newSelected.has(teamId)) {
      newSelected.delete(teamId);
    } else {
      newSelected.add(teamId);
    }
    setSelectedTeams(newSelected);
  }, [selectedTeams, teams, user.uid]);

  const handleSelectAll = useCallback(() => {
    const myTeamIds = teams.filter(team => team.leaderId === user.uid).map(team => team.id);
    const allMyTeamsSelected = myTeamIds.every(id => selectedTeams.has(id));

    const newSelected = new Set();
    if (!allMyTeamsSelected) {
      myTeamIds.forEach(id => newSelected.add(id));
    }
    setSelectedTeams(newSelected);
  }, [teams, user.uid, selectedTeams]);

  const handleBulkDelete = useCallback(() => {
    if (selectedTeams.size === 0) return;

    const bulkDelete = async () => {
      try {
        const deletePromises = Array.from(selectedTeams)
          .filter(teamId => {
            const team = teams.find(t => t.id === teamId);
            return team && team.leaderId === user.uid; // Säkerhetskoll
          })
          .map(teamId => deleteDoc(doc(db, 'teams', teamId)));

        await Promise.all(deletePromises);
        setSelectedTeams(new Set());
        setConfirmModal({ isOpen: false, onConfirm: null, message: '' });
      } catch (error) {
        console.error("Error bulk deleting teams:", error);
        setError("Kunde inte radera lagen.");
        setConfirmModal({ isOpen: false, onConfirm: null, message: '' });
      }
    };

    setConfirmModal({
      isOpen: true,
      message: `Är du säker på att du vill radera ${selectedTeams.size} lag permanent? Denna åtgärd kan inte ångras.`,
      onConfirm: bulkDelete,
    });
  }, [selectedTeams, teams, user.uid]);

  const handleRestartGame = useCallback(async (gameId) => {
    const game = teams.find(t => t.currentGameId === gameId);
    if (!game || game.leaderId !== user.uid) return; // Säkerhetskoll

    const restartGame = async () => {
      try {
        // Rensa loggen för det nya spelet
        clearLogs();

        // Återställ spelet till ursprungligt tillstånd
        await updateDoc(doc(db, 'games', gameId), {
          status: 'created',
          startTime: null,
          finishTime: null,
          activeObstacleId: null,
          completedObstacles: [],
          // Behåll courseId, teamId och createdAt
        });

        setConfirmModal({ isOpen: false, onConfirm: null, message: '' });
      } catch (error) {
        console.error("Error restarting game:", error);
        setError("Kunde inte starta om spelet.");
        setConfirmModal({ isOpen: false, onConfirm: null, message: '' });
      }
    };

    setConfirmModal({
      isOpen: true,
      message: `Är du säker på att du vill starta om spelet? All speldata kommer att nollställas och spelet återgår till vänteläge.`,
      onConfirm: restartGame,
    });
  }, [teams, user.uid, clearLogs]);

  const handleLogout = useCallback(async () => {
    try {
      await signOut(auth);
      navigate('/');
    } catch (err) {
      console.error('Error signing out:', err);
    }
  }, [navigate]);

  // Beräkna vilka lag som är mina och kan raderas
  const myTeams = teams.filter(team => team.leaderId === user.uid);
  const hasSelectedTeams = selectedTeams.size > 0;
  const allMyTeamsSelected = myTeams.length > 0 && myTeams.every(team => selectedTeams.has(team.id));

  return (
    <>
    {isProfileOpen && <ProfileModal user={user} userData={userData} onClose={() => setIsProfileOpen(false)} />}
    {isInstructionsOpen && <InstructionsModal onClose={() => setIsInstructionsOpen(false)} />}
    {confirmModal.isOpen && (
      <ConfirmModal
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal({ isOpen: false, onConfirm: null, message: '' })}
      />
    )}
    <div className="container mx-auto p-4 max-w-5xl">
      <Header title={`Lag för ${userData?.displayName || user?.email || 'Användare'}`} user={user} userData={userData}>
        <button onClick={() => setIsInstructionsOpen(true)} className="sc-button">Instruktioner</button>
        <button onClick={() => setIsProfileOpen(true)} className="sc-button">Profil</button>
        <button onClick={handleLogout} className="sc-button sc-button-red">Logga ut</button>
      </Header>
      
      <main>
        <div className="grid md:grid-cols-2 gap-8 mb-8">
          <div className="sc-card">
            <h2 className="text-xl font-bold mb-4 uppercase text-accent-cyan">Skapa ett nytt lag</h2>
            <form onSubmit={handleCreateTeam} className="space-y-4">
              <input
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="Lagets namn"
                className="sc-input"
                maxLength={50}
                required
              />
              <button type="submit" className="sc-button w-full" disabled={!teamName.trim()}>
                Skapa lag
              </button>
            </form>
          </div>
          <div className="sc-card">
            <h2 className="text-xl font-bold mb-4 uppercase text-accent-cyan">Gå med i ett lag</h2>
            <form onSubmit={handleJoinTeam} className="space-y-4">
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Anslutningskod"
                className="sc-input"
                maxLength={6}
                required
              />
              <button type="submit" className="sc-button w-full" disabled={!joinCode.trim()}>
                Gå med
              </button>
            </form>
          </div>
        </div>

        {error && <p className="mb-4 text-red-500 bg-red-900/50 p-3">{error}</p>}

        <div className="sc-card">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold uppercase text-accent-cyan">Dina lag</h2>
            {myTeams.length > 0 && (
              <div className="flex items-center gap-4">
                {hasSelectedTeams && (
                  <>
                    <span className="text-gray-400">{selectedTeams.size} lag valda</span>
                    <button
                      onClick={handleBulkDelete}
                      className="sc-button sc-button-red text-sm"
                    >
                      Radera valda
                    </button>
                  </>
                )}
                <button
                  onClick={handleSelectAll}
                  className="sc-button text-sm"
                >
                  {allMyTeamsSelected ? 'Avmarkera alla' : 'Markera alla mina lag'}
                </button>
              </div>
            )}
          </div>
          {loading ? (
            <Spinner />
          ) : teams.length > 0 ? (
            <ul className="space-y-4">
              {teams.map(team => (
                <TeamCard
                  key={team.id}
                  team={team}
                  user={user}
                  onDeleteTeam={handleDeleteTeam}
                  selectedTeams={selectedTeams}
                  onToggleTeam={handleToggleTeam}
                  onRestartGame={handleRestartGame}
                />
              ))}
            </ul>
          ) : (
            <p className="text-gray-400">Du är inte med i något lag än.</p>
          )}
        </div>
      </main>
    </div>
    </>
  );
};

export default TeamsPage;

