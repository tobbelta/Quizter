import React, { useState } from 'react';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { Link, useNavigate } from 'react-router-dom';
import Logo from '../shared/Logo';

const Register = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      await updateProfile(user, { displayName });
      
      await setDoc(doc(db, 'users', user.uid), {
        displayName,
        email: user.email,
        role: 'player', // Default role
        createdAt: new Date(),
      });

      navigate('/');
    } catch (err) {
      setError('Registrering misslyckades. Försök igen.');
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
          <h2 className="text-2xl font-bold text-center text-cyan-400 mb-6 uppercase tracking-widest">Registrera Konto</h2>
          <form onSubmit={handleRegister} className="space-y-6">
            <div>
              <input 
                type="text" 
                value={displayName} 
                onChange={(e) => setDisplayName(e.target.value)} 
                required 
                placeholder="Visningsnamn"
                className="sc-input" 
              />
            </div>
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
              {loading ? 'Registrerar...' : 'Registrera'}
            </button>
          </form>
          <p className="text-sm text-center text-gray-400 mt-6">
            Har du redan ett konto? <Link to="/login" className="font-semibold text-cyan-400 hover:underline">Logga in</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Register;
