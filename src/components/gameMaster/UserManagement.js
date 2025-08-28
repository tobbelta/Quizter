import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import Spinner from '../shared/Spinner';

const UserManagement = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
            setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const handleDelete = async (id) => {
        if (window.confirm("OBS: Detta raderar bara användaren från databasen, inte deras inloggning. Fortsätta?")) {
            await deleteDoc(doc(db, 'users', id));
        }
    };

    return (
        <div>
            <h2 className="text-2xl font-bold mb-4 text-accent-cyan">Hantera Användare</h2>
            {loading ? <Spinner /> : (
                <div className="overflow-x-auto">
                    <table className="min-w-full">
                        <thead className="border-b border-border-color">
                            <tr>
                                <th className="py-3 px-4 text-left font-semibold uppercase text-text-secondary">Visningsnamn</th>
                                <th className="py-3 px-4 text-left font-semibold uppercase text-text-secondary">Email</th>
                                <th className="py-3 px-4 text-left font-semibold uppercase text-text-secondary">Roll</th>
                                <th className="py-3 px-4 text-left font-semibold uppercase text-text-secondary">Åtgärder</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-color">
                            {users.map(user => (
                                <tr key={user.id} className="hover:bg-white/5">
                                    <td className="py-2 px-4">{user.displayName}</td>
                                    <td className="py-2 px-4">{user.email}</td>
                                    <td className="py-2 px-4 capitalize">{user.role}</td>
                                    <td className="py-2 px-4">
                                        <button onClick={() => handleDelete(user.id)} className="sc-button sc-button-red text-xs py-1 px-2">
                                            Radera
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default UserManagement;
