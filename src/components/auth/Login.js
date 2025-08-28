import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../firebase';
import { Link, useNavigate } from 'react-router-dom';
import Logo from '../shared/Logo';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate('/');
    } catch (err) {
      setError('Inloggning misslyckades. Kontrollera e-post och lösenord.');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-6">
            <Logo size={120} />
        </div>
        <div className="soft-dark-card">
          <h2 className="text-2xl font-bold text-center uppercase mb-6 text-accent-cyan">Logga in</h2>
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-bold mb-2 uppercase text-accent-cyan">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="soft-dark-input" />
            </div>
            <div>
              <label className="block text-sm font-bold mb-2 uppercase text-accent-cyan">Lösenord</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="soft-dark-input" />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button type="submit" className="soft-dark-button w-full">Logga in</button>
          </form>
          <p className="text-sm text-center text-gray-400 mt-6">
            Har du inget konto? <Link to="/register" className="font-bold text-accent-yellow hover:underline">Registrera dig</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
