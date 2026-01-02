import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageLayout from '../components/layout/PageLayout';
import MessageDialog from '../components/shared/MessageDialog';
import { useAuth } from '../context/AuthContext';
import { profileService } from '../services/profileService';

const AccountSettingsPage = () => {
  const navigate = useNavigate();
  const { currentUser, isAuthenticated, updateCurrentUser, logout } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPasswordFields, setShowPasswordFields] = useState(false);
  const [dialogConfig, setDialogConfig] = useState({ isOpen: false, title: '', message: '', type: 'info' });
  const [infoMessage, setInfoMessage] = useState('');

  useEffect(() => {
    if (!isAuthenticated || currentUser?.isAnonymous) {
      return;
    }
    setName(currentUser?.name || '');
    setEmail(currentUser?.email || '');
  }, [currentUser, isAuthenticated]);

  const handleSave = async (event) => {
    event.preventDefault();
    setInfoMessage('');

    if (!currentPassword.trim()) {
      setDialogConfig({
        isOpen: true,
        title: 'Lösenord krävs',
        message: 'Ange nuvarande lösenord för att spara ändringar.',
        type: 'warning'
      });
      return;
    }

    if (showPasswordFields && newPassword) {
      if (newPassword.length < 8) {
        setDialogConfig({
          isOpen: true,
          title: 'För kort lösenord',
          message: 'Nytt lösenord måste vara minst 8 tecken.',
          type: 'warning'
        });
        return;
      }
      if (newPassword !== confirmPassword) {
        setDialogConfig({
          isOpen: true,
          title: 'Lösenorden matchar inte',
          message: 'Kontrollera att lösenorden är identiska.',
          type: 'warning'
        });
        return;
      }
    }

    setIsLoading(true);
    try {
      const response = await profileService.updateProfile({
        userId: currentUser.id,
        name: name.trim(),
        email: email.trim(),
        currentPassword: currentPassword.trim(),
        newPassword: showPasswordFields ? newPassword : ''
      });
      updateCurrentUser(response.user);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowPasswordFields(false);

      if (response.verificationSent) {
        setInfoMessage('Verifieringsmail skickat till din nya e-postadress. Du behöver verifiera för att kunna logga in igen.');
      } else {
        setInfoMessage('Dina ändringar är sparade.');
      }
    } catch (error) {
      setDialogConfig({
        isOpen: true,
        title: 'Kunde inte spara',
        message: error.message || 'Ett fel uppstod när profilen uppdaterades.',
        type: 'error'
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isAuthenticated || currentUser?.isAnonymous) {
    return (
      <PageLayout headerTitle="Konto & profil" maxWidth="max-w-lg" className="space-y-6">
        <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6 text-center">
          <h1 className="text-2xl font-semibold text-slate-100">Skapa ett konto</h1>
          <p className="mt-3 text-sm text-gray-300">
            Konto- och profilinställningar är bara tillgängliga för registrerade användare.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => navigate('/register')}
              className="rounded-lg bg-cyan-500 px-4 py-2 font-semibold text-black hover:bg-cyan-400"
            >
              Skapa konto
            </button>
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="rounded-lg border border-slate-600 px-4 py-2 font-semibold text-gray-200 hover:border-slate-500"
            >
              Logga in
            </button>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout headerTitle="Konto & profil" maxWidth="max-w-xl" className="space-y-6">
      <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-100">Dina uppgifter</h1>
            <p className="text-sm text-gray-400">Uppdatera namn, e-post och lösenord.</p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-gray-300 hover:border-slate-500"
          >
            Logga ut
          </button>
        </div>

        {currentUser.emailVerified === false && (
          <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-900/20 px-4 py-3 text-sm text-amber-100">
            Din e-post är inte verifierad. Verifiera den senaste länken du fått via e-post för att kunna logga in igen.
          </div>
        )}

        {infoMessage && (
          <div className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-900/20 px-4 py-3 text-sm text-emerald-100">
            {infoMessage}
          </div>
        )}

        <form onSubmit={handleSave} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-200">Namn</label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 focus:border-cyan-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-200">E-post</label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 focus:border-cyan-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-200">Nuvarande lösenord</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 focus:border-cyan-400 focus:outline-none"
              placeholder="Ange för att spara"
              required
            />
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
            <button
              type="button"
              onClick={() => setShowPasswordFields((prev) => !prev)}
              className="text-sm font-semibold text-cyan-200"
            >
              {showPasswordFields ? 'Dölj lösenordsbyte' : 'Byt lösenord'}
            </button>
            {showPasswordFields && (
              <div className="mt-4 space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-200">Nytt lösenord</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 focus:border-cyan-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-200">Bekräfta nytt lösenord</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 focus:border-cyan-400 focus:outline-none"
                  />
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-lg bg-cyan-500 px-4 py-2 font-semibold text-black hover:bg-cyan-400 disabled:opacity-60"
          >
            {isLoading ? 'Sparar...' : 'Spara ändringar'}
          </button>
        </form>
      </div>

      <MessageDialog
        isOpen={dialogConfig.isOpen}
        onClose={() => setDialogConfig({ ...dialogConfig, isOpen: false })}
        title={dialogConfig.title}
        message={dialogConfig.message}
        type={dialogConfig.type}
      />
    </PageLayout>
  );
};

export default AccountSettingsPage;
