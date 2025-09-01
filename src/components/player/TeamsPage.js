import React, { useState, useEffect } from 'react';
import { auth, db } from '../../firebase';
// **KORRIGERING:** Tar bort oanvända 'serverTimestamp' från importen.
import { collection, doc, updateDoc, onSnapshot, query, where, addDoc, getDocs, arrayUnion } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { v4 as uuidv4 } from 'uuid';
import ProfileModal from '../shared/ProfileModal';
import Spinner from '../shared/Spinner';
import InstructionsModal from '../shared/InstructionsModal';
import Header from '../shared/Header';

const TeamCard = ({ team, user }) => {
    const navigate = useNavigate();
    const [game, setGame] = useState(null);
    const [loadingGame, setLoadingGame] = useState(true);
    const isLeader = user.uid === team.leaderId;

    useEffect(() => {
        // Om det inte finns något aktivt spel, behöver vi inte lyssna.
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

    const handleGoToGame = () => {
        if (!game) return;
        navigate(`/game/${game.id}`);
    };

    const renderAction = () => {
        if (loadingGame) return <div className="w-full sm:w-40 h-12 bg-gray-800 animate-pulse rounded-lg"></div>;
        
        const buttonClass = "sc-button w-full sm:w-auto text-sm py-2 px-4";

        if (isLeader) {
            // Om inget spel finns, visa "Skapa Spel"-knapp
            if (!game) return <button onClick={() => navigate(`/lobby/${team.id}`)} className={buttonClass}>Skapa Spel</button>;
            
            // Om spelet är slut, visa rapport-knappen
            if (game.status === 'finished') {
                return <button onClick={() => navigate(`/report/${game.id}`)} className={buttonClass}>Visa Rapport</button>;
            }
            // Annars, visa "Gå till Spel"-knappen
            return <button onClick={handleGoToGame} className={`${buttonClass} sc-button-blue`}>Gå till Spel</button>;

        } else { // Om man inte är ledare
            if (!game) return <p className="text-sm text-text-secondary text-left sm:text-right">Väntar på ledare...</p>;
            
            if (game.status === 'finished') {
                return <button onClick={() => navigate(`/report/${game.id}`)} className={buttonClass}>Visa Rapport</button>;
            }
            // Om spelet är skapat men inte startat, visa meddelande
            if (game.status === 'created') return <p className="text-sm text-accent-cyan text-left sm:text-right">Väntar på start...</p>;
            
            // Annars, låt medlemmen gå till spelet
            return <button onClick={handleGoToGame} className={`${buttonClass} sc-button-blue`}>Gå till Spel</button>;
        }
    };

    return (
        <li className="sc-card flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
            <div>
                <span className="font-bold text-lg text-white">{team.name}</span>
                <p className="text-sm text-text-secondary">Kod: <span className="font-mono bg-black px-2 py-1 rounded-md">{team.joinCode}</span></p>
            </div>
            <div className="w-full sm:w-auto pt-2 sm:pt-0">
                {renderAction()}
            </div>
        </li>
    );
};

const TeamsPage = ({ user, userData }) => {
  const [teams, setTeams] = useState([]);
  const [teamName, setTeamName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isInstructionsOpen, setIsInstructionsOpen] = useState(false);
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

  const handleCreateTeam = async (e) => {
    e.preventDefault();
    if (!teamName.trim()) return;
    setError('');
    try {
      await addDoc(collection(db, 'teams'), {
        name: teamName,
        leaderId: user.uid,
        memberIds: [user.uid],
        joinCode: uuidv4().substring(0, 6).toUpperCase(),
        createdAt: new Date(), // Använder JS Date-objekt, Firestore konverterar det.
        currentGameId: null
      });
      setTeamName('');
    } catch (err) {
      setError("Kunde inte skapa laget.");
    }
  };

  const handleJoinTeam = async (e) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setError('');
    try {
      const q = query(collection(db, 'teams'), where('joinCode', '==', joinCode.trim().toUpperCase()));
      const querySnapshot = await getDocs(q);
      if (querySnapshot.empty) {
        setError("Inget lag hittades med den koden.");
        return;
      }
      const teamDoc = querySnapshot.docs[0];
      if (teamDoc.data().memberIds.includes(user.uid)) {
          setError("Du är redan med i detta lag.");
          return;
      }
      await updateDoc(doc(db, 'teams', teamDoc.id), {
        memberIds: arrayUnion(user.uid)
      });
      setJoinCode('');
    } catch (err) {
      setError("Kunde inte ansluta till laget.");
    }
  };

  const handleLogout = () => signOut(auth).then(() => navigate('/'));

  return (
    <>
    {isProfileOpen && <ProfileModal user={user} userData={userData} onClose={() => setIsProfileOpen(false)} />}
    {isInstructionsOpen && <InstructionsModal onClose={() => setIsInstructionsOpen(false)} />}
    <div className="container mx-auto p-4 max-w-5xl">
      <Header title="Mina Lag" user={user} userData={userData}>
        <button onClick={() => setIsInstructionsOpen(true)} className="sc-button">Instruktioner</button>
        <button onClick={() => setIsProfileOpen(true)} className="sc-button">Profil</button>
        <button onClick={handleLogout} className="sc-button sc-button-red">Logga ut</button>
      </Header>
      
      <main>
        <div className="grid md:grid-cols-2 gap-8 mb-8">
            <div className="sc-card">
              <h2 className="text-xl font-bold mb-4 uppercase text-accent-cyan">Skapa ett nytt lag</h2>
              <form onSubmit={handleCreateTeam} className="space-y-4">
                <input type="text" value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Lagets namn" className="sc-input" />
                <button type="submit" className="sc-button w-full">Skapa lag</button>
              </form>
            </div>
            <div className="sc-card">
              <h2 className="text-xl font-bold mb-4 uppercase text-accent-cyan">Gå med i ett lag</h2>
              <form onSubmit={handleJoinTeam} className="space-y-4">
                <input type="text" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="Anslutningskod" className="sc-input" />
                <button type="submit" className="sc-button w-full">Gå med</button>
              </form>
            </div>
        </div>

        {error && <p className="mb-4 text-red-500 bg-red-900/50 p-3">{error}</p>}

        <div className="sc-card">
            <h2 className="text-xl font-bold mb-4 uppercase text-accent-cyan">Dina lag</h2>
            {loading ? <Spinner /> : teams.length > 0 ? (
              <ul className="space-y-4">
                {teams.map(team => (
                  <TeamCard key={team.id} team={team} user={user} />
                ))}
              </ul>
            ) : <p className="text-gray-400">Du är inte med i något lag än.</p>}
        </div>
      </main>
    </div>
    </>
  );
};

export default TeamsPage;

