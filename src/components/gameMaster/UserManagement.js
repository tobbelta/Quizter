import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import Spinner from '../shared/Spinner';
import ConfirmModal from '../shared/ConfirmModal';
import UserEditModal from './UserEditModal';

const UserManagement = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedUsers, setSelectedUsers] = useState(new Set());
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, onConfirm: null, message: '' });
    const [editingUser, setEditingUser] = useState(null);
    const [editModalOpen, setEditModalOpen] = useState(false);

    useEffect(() => {
        const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
            setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const handleDelete = (id) => {
        setConfirmModal({
            isOpen: true,
            message: 'OBS: Detta raderar bara användaren från databasen, inte deras inloggning. Fortsätta?',
            onConfirm: () => confirmDelete(id),
        });
    };

    const confirmDelete = async (id) => {
        try {
            await deleteDoc(doc(db, 'users', id));
            setConfirmModal({ isOpen: false, onConfirm: null, message: '' });
        } catch (error) {
            console.error("Error deleting user:", error);
            setConfirmModal({ isOpen: false, onConfirm: null, message: '' });
        }
    };

    const handleToggleUser = (userId) => {
        const newSelected = new Set(selectedUsers);
        if (newSelected.has(userId)) {
            newSelected.delete(userId);
        } else {
            newSelected.add(userId);
        }
        setSelectedUsers(newSelected);
    };

    const handleSelectAll = () => {
        const userIds = users.map(user => user.id);
        const allSelected = userIds.every(id => selectedUsers.has(id));

        const newSelected = new Set();
        if (!allSelected) {
            userIds.forEach(id => newSelected.add(id));
        }
        setSelectedUsers(newSelected);
    };

    const handleBulkDelete = () => {
        if (selectedUsers.size === 0) return;

        setConfirmModal({
            isOpen: true,
            message: `OBS: Detta raderar ${selectedUsers.size} användare från databasen, inte deras inloggningar. Fortsätta?`,
            onConfirm: confirmBulkDelete,
        });
    };

    const confirmBulkDelete = async () => {
        try {
            const deletePromises = Array.from(selectedUsers).map(userId =>
                deleteDoc(doc(db, 'users', userId))
            );
            await Promise.all(deletePromises);
            setSelectedUsers(new Set());
            setConfirmModal({ isOpen: false, onConfirm: null, message: '' });
        } catch (error) {
            console.error("Error bulk deleting users:", error);
            setConfirmModal({ isOpen: false, onConfirm: null, message: '' });
        }
    };

    const handleEdit = (user) => {
        setEditingUser(user);
        setEditModalOpen(true);
    };

    const handleSaveUser = async (userData) => {
        try {
            await updateDoc(doc(db, 'users', editingUser.id), userData);
            setEditModalOpen(false);
            setEditingUser(null);
        } catch (error) {
            console.error("Error updating user:", error);
        }
    };

    const hasSelectedUsers = selectedUsers.size > 0;
    const allSelected = users.length > 0 && users.every(user => selectedUsers.has(user.id));

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-accent-cyan">Användare</h2>
                {hasSelectedUsers && (
                    <div className="flex items-center gap-4">
                        <span className="text-gray-400">{selectedUsers.size} användare valda</span>
                        <button
                            onClick={handleBulkDelete}
                            className="sc-button sc-button-red"
                        >
                            Radera valda
                        </button>
                        <button
                            onClick={() => setSelectedUsers(new Set())}
                            className="sc-button"
                        >
                            Avmarkera alla
                        </button>
                    </div>
                )}
            </div>

            {users.length > 0 && (
                <div className="flex items-center gap-3 mb-4">
                    <label className="flex items-center gap-2 text-sm text-gray-400">
                        <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={handleSelectAll}
                            className="rounded border-gray-600 bg-gray-800 text-accent-cyan focus:ring-accent-cyan"
                        />
                        Välj alla ({users.length})
                    </label>
                </div>
            )}

            {loading ? <Spinner /> : (
                <div className="space-y-4">
                    {users.map(user => (
                        <div key={user.id} className="sc-card flex items-center p-3 gap-3">
                            <input
                                type="checkbox"
                                checked={selectedUsers.has(user.id)}
                                onChange={() => handleToggleUser(user.id)}
                                className="rounded border-gray-600 bg-gray-800 text-accent-cyan focus:ring-accent-cyan flex-shrink-0"
                            />
                            <div className="flex-grow">
                                <p className="font-bold text-lg text-white">{user.displayName}</p>
                                <p className="text-sm text-text-secondary">Email: {user.email}</p>
                                <p className="text-sm text-text-secondary capitalize">Roll: {user.role}</p>
                                <p className="text-sm text-text-secondary">Registrerad: {user.createdAt ? new Date(user.createdAt.seconds * 1000).toLocaleString('sv-SE') : 'Okänt datum'}</p>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => handleEdit(user)} className="sc-button">
                                    Editera
                                </button>
                                <button onClick={() => handleDelete(user.id)} className="sc-button sc-button-red">
                                    Radera
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {editModalOpen && (
                <UserEditModal
                    user={editingUser}
                    onSave={handleSaveUser}
                    onCancel={() => { setEditModalOpen(false); setEditingUser(null); }}
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

export default UserManagement;
