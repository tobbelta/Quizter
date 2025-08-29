import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../firebase';
import { Link, useNavigate } from 'react-router-dom';
import Logo from '../shared/Logo';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate('/');
    } catch (err) {
      setError('Inloggning misslyckades. Kontrollera e-post och lösenord.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
            <Logo size={120} />
        </div>
        <div className="sc-card">
          <h2 className="text-2xl font-bold text-center text-cyan-400 mb-6 uppercase tracking-widest">Logga in</h2>
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <input 
                type="email" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                required 
                placeholder="Email"
                className="sc-input" 
              />
            </div>
            <div>
              <input 
                type="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                required 
                placeholder="Lösenord"
                className="sc-input" 
              />
            </div>
            {error && <p className="text-sm text-red-500 text-center">{error}</p>}
            <button 
              type="submit" 
              disabled={loading}
              className="sc-button sc-button-blue w-full"
            >
              {loading ? 'Loggar in...' : 'Logga in'}
            </button>
          </form>
          <p className="text-sm text-center text-gray-400 mt-6">
            Har du inget konto? <Link to="/register" className="font-semibold text-cyan-400 hover:underline">Registrera dig</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
