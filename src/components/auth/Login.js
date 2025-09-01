import React, { useState, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../firebase';
import { DebugContext } from '../../context/DebugContext';
import Logo from '../shared/Logo';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [localIsDebug, setLocalIsDebug] = useState(false); // Lokalt state för checkboxen
    const { setDebugMode } = useContext(DebugContext);
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            await signInWithEmailAndPassword(auth, email, password);
            // Sätt det valda debug-läget i den globala contexten
            setDebugMode(localIsDebug);
            // Navigering hanteras automatiskt av App.js efter inloggning
        } catch (err) {
            setError('Inloggningen misslyckades. Kontrollera e-post och lösenord.');
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-900">
            <div className="sc-card w-full max-w-md">
                <div className="text-center mb-8">
                    <Logo className="w-24 h-24 mx-auto mb-4" />
                    <h1 className="text-3xl font-bold text-white">Välkommen tillbaka</h1>
                    <p className="text-text-secondary">Logga in för att fortsätta</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-6">
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="E-postadress"
                        className="sc-input"
                        required
                    />
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Lösenord"
                        className="sc-input"
                        required
                    />
                    
                    {/* === NYTT: Checkbox för att välja debug-läge === */}
                    <div className="flex items-center justify-center">
                        <label className="flex items-center space-x-2 cursor-pointer text-text-secondary">
                            <input
                                type="checkbox"
                                checked={localIsDebug}
                                onChange={(e) => setLocalIsDebug(e.target.checked)}
                                className="form-checkbox h-5 w-5 bg-gray-800 border-gray-600 rounded text-accent-cyan focus:ring-accent-cyan focus:ring-offset-gray-900"
                            />
                            <span>Starta i Debug-läge</span>
                        </label>
                    </div>

                    {error && <p className="text-red-500 bg-red-900/50 p-3 rounded-lg text-center">{error}</p>}
                    
                    <button type="submit" className="sc-button w-full" disabled={loading}>
                        {loading ? 'Loggar in...' : 'Logga in'}
                    </button>
                </form>

                <p className="mt-6 text-center text-text-secondary">
                    Inget konto? <Link to="/register" className="text-accent-cyan hover:underline">Registrera dig</Link>
                </p>
            </div>
        </div>
    );
};

export default Login;

