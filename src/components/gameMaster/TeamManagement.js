import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, deleteDoc, updateDoc, arrayRemove } from 'firebase/firestore';
import { db } from '../../firebase';
import Spinner from '../shared/Spinner';
import ConfirmModal from '../shared/ConfirmModal';
import TeamEditModal from './TeamEditModal';

const TeamManagement = () => {
    const [teams, setTeams] = useState([]);
    const [usersMap, setUsersMap] = useState({});
    const [loading, setLoading] = useState(true);
    const [expandedTeamId, setExpandedTeamId] = useState(null);
    const [selectedTeams, setSelectedTeams] = useState(new Set());
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, onConfirm: null, message: '' });
    const [editingTeam, setEditingTeam] = useState(null);
    const [editModalOpen, setEditModalOpen] = useState(false);

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

    const handleDeleteTeam = (teamId) => {
        setConfirmModal({
            isOpen: true,
            message: 'Är du säker på att du vill radera hela laget permanent? Denna åtgärd kan inte ångras.',
            onConfirm: () => confirmDeleteTeam(teamId),
        });
    };

    const confirmDeleteTeam = async (teamId) => {
        try {
            await deleteDoc(doc(db, 'teams', teamId));
            setConfirmModal({ isOpen: false, onConfirm: null, message: '' });
        } catch (error) {
            console.error("Error deleting team:", error);
            setConfirmModal({ isOpen: false, onConfirm: null, message: '' });
        }
    };

    const handleRemoveMember = (teamId, memberId) => {
        setConfirmModal({
            isOpen: true,
            message: 'Är du säker på att du vill ta bort denna medlem från laget?',
            onConfirm: () => confirmRemoveMember(teamId, memberId),
        });
    };

    const confirmRemoveMember = async (teamId, memberId) => {
        try {
            await updateDoc(doc(db, 'teams', teamId), { memberIds: arrayRemove(memberId) });
            setConfirmModal({ isOpen: false, onConfirm: null, message: '' });
        } catch (error) {
            console.error("Error removing member:", error);
            setConfirmModal({ isOpen: false, onConfirm: null, message: '' });
        }
    };

    const handleToggleTeam = (teamId) => {
        const newSelected = new Set(selectedTeams);
        if (newSelected.has(teamId)) {
            newSelected.delete(teamId);
        } else {
            newSelected.add(teamId);
        }
        setSelectedTeams(newSelected);
    };

    const handleSelectAll = () => {
        const teamIds = teams.map(team => team.id);
        const allSelected = teamIds.every(id => selectedTeams.has(id));

        const newSelected = new Set();
        if (!allSelected) {
            teamIds.forEach(id => newSelected.add(id));
        }
        setSelectedTeams(newSelected);
    };

    const handleBulkDelete = () => {
        if (selectedTeams.size === 0) return;

        setConfirmModal({
            isOpen: true,
            message: `Är du säker på att du vill radera ${selectedTeams.size} lag permanent? Denna åtgärd kan inte ångras.`,
            onConfirm: confirmBulkDelete,
        });
    };

    const confirmBulkDelete = async () => {
        try {
            const deletePromises = Array.from(selectedTeams).map(teamId =>
                deleteDoc(doc(db, 'teams', teamId))
            );
            await Promise.all(deletePromises);
            setSelectedTeams(new Set());
            setConfirmModal({ isOpen: false, onConfirm: null, message: '' });
        } catch (error) {
            console.error("Error bulk deleting teams:", error);
            setConfirmModal({ isOpen: false, onConfirm: null, message: '' });
        }
    };

    const toggleExpand = (teamId) => setExpandedTeamId(expandedTeamId === teamId ? null : teamId);

    const handleEdit = (team) => {
        setEditingTeam(team);
        setEditModalOpen(true);
    };

    const handleSaveTeam = async (teamData) => {
        try {
            await updateDoc(doc(db, 'teams', editingTeam.id), teamData);
            setEditModalOpen(false);
            setEditingTeam(null);
        } catch (error) {
            console.error("Error updating team:", error);
        }
    };

    if (loading) return <Spinner />;

    const hasSelectedTeams = selectedTeams.size > 0;
    const allSelected = teams.length > 0 && teams.every(team => selectedTeams.has(team.id));

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-accent-cyan">Lag</h2>
                {hasSelectedTeams && (
                    <div className="flex items-center gap-4">
                        <span className="text-gray-400">{selectedTeams.size} lag valda</span>
                        <button
                            onClick={handleBulkDelete}
                            className="sc-button sc-button-red"
                        >
                            Radera valda
                        </button>
                        <button
                            onClick={() => setSelectedTeams(new Set())}
                            className="sc-button"
                        >
                            Avmarkera alla
                        </button>
                    </div>
                )}
            </div>

            {teams.length > 0 && (
                <div className="flex items-center gap-3 mb-4">
                    <label className="flex items-center gap-2 text-sm text-gray-400">
                        <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={handleSelectAll}
                            className="rounded border-gray-600 bg-gray-800 text-accent-cyan focus:ring-accent-cyan"
                        />
                        Välj alla ({teams.length})
                    </label>
                </div>
            )}

            <div className="space-y-4">
                {teams.map(team => {
                    const memberIds = Array.isArray(team.memberIds) ? team.memberIds : [];
                    return (
                        <div key={team.id} className="sc-card">
                            <div className="flex items-center p-3 gap-3">
                                <input
                                    type="checkbox"
                                    checked={selectedTeams.has(team.id)}
                                    onChange={() => handleToggleTeam(team.id)}
                                    className="rounded border-gray-600 bg-gray-800 text-accent-cyan focus:ring-accent-cyan flex-shrink-0"
                                />
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 flex-grow">
                                    <div className="flex-grow">
                                        <p className="font-bold text-lg text-white">{team.name}</p>
                                        <p className="text-sm text-text-secondary">Lagledare: {usersMap[team.leaderId]?.displayName || 'Okänd'}</p>
                                        <p className="text-sm text-text-secondary">Skapat: {team.createdAt ? new Date(team.createdAt.seconds * 1000).toLocaleString('sv-SE') : 'Okänt datum'}</p>
                                        <p className="text-sm text-text-secondary">Antal medlemmar: {memberIds.length}</p>
                                    </div>
                                    <div className="flex gap-2 w-full sm:w-auto">
                                        <button onClick={() => toggleExpand(team.id)} className="sc-button w-full sm:w-auto">
                                            {expandedTeamId === team.id ? 'Dölj' : 'Visa'} Medlemmar
                                        </button>
                                        <button onClick={() => handleEdit(team)} className="sc-button w-full sm:w-auto">
                                            Editera
                                        </button>
                                        <button onClick={() => handleDeleteTeam(team.id)} className="sc-button sc-button-red w-full sm:w-auto">
                                            Radera
                                        </button>
                                    </div>
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

            {editModalOpen && (
                <TeamEditModal
                    team={editingTeam}
                    onSave={handleSaveTeam}
                    onCancel={() => { setEditModalOpen(false); setEditingTeam(null); }}
                />
            )}

            {confirmModal.isOpen && (
                <ConfirmModal
                    message={confirmModal.message}
                    onConfirm={confirmModal.onConfirm}
                    onClose={() => setConfirmModal({isOpen: false, onConfirm: null, message: ''})}
                />
            )}
        </div>
    );
};

export default TeamManagement;
