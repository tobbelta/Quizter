import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, deleteDoc, updateDoc, arrayRemove } from 'firebase/firestore';
import { db } from '../../firebase';
import Spinner from '../shared/Spinner';

const TeamManagement = () => {
    const [teams, setTeams] = useState([]);
    const [usersMap, setUsersMap] = useState({});
    const [loading, setLoading] = useState(true);
    const [expandedTeamId, setExpandedTeamId] = useState(null);

    useEffect(() => {
        const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
            const uMap = {};
            snapshot.forEach(doc => { uMap[doc.id] = doc.data(); });
            setUsersMap(uMap);
        });
        const unsubTeams = onSnapshot(collection(db, 'teams'), (snapshot) => {
            setTeams(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        });
        return () => {
            unsubUsers();
            unsubTeams();
        };
    }, []);

    const handleDeleteTeam = async (teamId) => {
        if (window.confirm("Är du säker på att du vill radera hela laget?")) {
            await deleteDoc(doc(db, 'teams', teamId));
        }
    };

    const handleRemoveMember = async (teamId, memberId) => {
        if (window.confirm("Är du säker på att du vill ta bort denna medlem?")) {
            await updateDoc(doc(db, 'teams', teamId), { memberIds: arrayRemove(memberId) });
        }
    };

    const toggleExpand = (teamId) => setExpandedTeamId(expandedTeamId === teamId ? null : teamId);

    if (loading) return <Spinner />;

    return (
        <div>
            <h2 className="text-2xl font-bold mb-4 text-accent-cyan">Hantera Lag</h2>
            <div className="space-y-4">
                {teams.map(team => {
                    const memberIds = Array.isArray(team.memberIds) ? team.memberIds : [];
                    return (
                        <div key={team.id} className="sc-card">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                                <div className="flex-grow">
                                    <p className="font-bold text-lg text-white">{team.name}</p>
                                    <p className="text-sm text-text-secondary">Lagledare: {usersMap[team.leaderId]?.displayName || 'Okänd'}</p>
                                    <p className="text-sm text-text-secondary">Antal medlemmar: {memberIds.length}</p>
                                </div>
                                <div className="flex gap-2 w-full sm:w-auto">
                                    <button onClick={() => toggleExpand(team.id)} className="sc-button w-full sm:w-auto">
                                        {expandedTeamId === team.id ? 'Dölj' : 'Visa'} Medlemmar
                                    </button>
                                    <button onClick={() => handleDeleteTeam(team.id)} className="sc-button sc-button-red w-full sm:w-auto">
                                        Radera
                                    </button>
                                </div>
                            </div>
                            {expandedTeamId === team.id && (
                                <div className="mt-4 pt-4 border-t border-border-color">
                                    <h4 className="font-semibold mb-2 text-white">Medlemmar:</h4>
                                    <ul className="space-y-2">
                                        {memberIds.map(memberId => (
                                            <li key={memberId} className="flex justify-between items-center bg-black/20 p-2 rounded">
                                                <span>{usersMap[memberId]?.displayName || 'Okänd'} {memberId === team.leaderId && '(Ledare)'}</span>
                                                {memberId !== team.leaderId && (
                                                    <button onClick={() => handleRemoveMember(team.id, memberId)} className="text-xs px-2 py-1 bg-red-900/50 text-red-300 rounded hover:bg-red-800/50">
                                                        Ta bort
                                                    </button>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    );
};

export default TeamManagement;
