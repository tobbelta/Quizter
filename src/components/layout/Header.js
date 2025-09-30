/**
 * Header-komponent med logotyp, dynamisk titel och hamburger-meny
 *
 * Props:
 * - title: Text som visas i mitten (default: "GeoQuest")
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { localStorageService } from '../../services/localStorageService';

const Header = ({ title = 'GeoQuest' }) => {
  const navigate = useNavigate();
  const { currentUser, isAuthenticated, isSuperUser, logout } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  console.log('Header isSuperUser:', isSuperUser);

  const handleLogout = () => {
    logout();
    setIsMenuOpen(false);
    navigate('/');
  };

  const handleLogin = () => {
    setIsMenuOpen(false);
    navigate('/login');
  };

  const handleMyRuns = () => {
    setIsMenuOpen(false);
    navigate('/my-runs');
  };

  // Räkna lokala rundor för oinloggade
  const localCreatedCount = !isAuthenticated ? localStorageService.getCreatedRuns().length : 0;
  const localJoinedCount = !isAuthenticated ? localStorageService.getJoinedRuns().length : 0;
  const hasLocalRuns = localCreatedCount > 0 || localJoinedCount > 0;

  return (
    <header className="bg-slate-900/95 backdrop-blur-sm border-b border-slate-700 fixed top-0 left-0 right-0 z-50 safe-area-inset">
      <div className="w-full px-4 py-3 grid grid-cols-[auto_1fr_auto] items-center gap-4">
        {/* Vänster: Logotyp */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center hover:opacity-80 transition-opacity justify-start"
        >
          <img
            src="/logo-compass.svg"
            alt="GeoQuest"
            className="w-10 h-10 flex-shrink-0"
          />
        </button>

        {/* Mitten: Dynamisk titel */}
        <div className="text-center px-2 flex items-center justify-center overflow-hidden">
          <h1 className="text-lg md:text-xl font-bold bg-gradient-to-r from-cyan-400 to-indigo-400 bg-clip-text text-transparent whitespace-nowrap">
            {title}
          </h1>
          {isSuperUser && (
            <span className="ml-2 px-2 py-0.5 bg-red-500/20 border border-red-500/50 rounded text-xs text-red-300">
              SuperUser
            </span>
          )}
        </div>

        {/* Höger: Hamburger-meny */}
        <div className="relative flex justify-end">
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="p-2 rounded-lg hover:bg-slate-800 transition-colors relative"
            aria-label="Meny"
          >
            <div className="w-6 h-6 flex flex-col justify-center gap-1.5">
              <span className={`block h-0.5 bg-gray-300 transition-all ${isMenuOpen ? 'rotate-45 translate-y-2' : ''}`} />
              <span className={`block h-0.5 bg-gray-300 transition-all ${isMenuOpen ? 'opacity-0' : ''}`} />
              <span className={`block h-0.5 bg-gray-300 transition-all ${isMenuOpen ? '-rotate-45 -translate-y-2' : ''}`} />
            </div>
            {/* Badge för antal lokala rundor */}
            {hasLocalRuns && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-cyan-500 rounded-full text-xs font-bold text-black flex items-center justify-center">
                {localCreatedCount + localJoinedCount}
              </span>
            )}
          </button>

          {/* Dropdown-meny */}
          {isMenuOpen && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsMenuOpen(false)}
              />

              {/* Meny */}
              <div className="absolute right-0 mt-2 w-64 bg-slate-900 rounded-lg border border-slate-700 shadow-xl z-50 overflow-hidden">
                {/* Användarinfo */}
                {isAuthenticated && (
                  <div className="px-4 py-3 border-b border-slate-700">
                    <p className="text-sm text-gray-400">Inloggad som</p>
                    <p className="font-semibold text-gray-200">{currentUser?.name}</p>
                    {isSuperUser && (
                      <span className="inline-block mt-1 px-2 py-0.5 bg-red-500/20 border border-red-500/50 rounded text-xs text-red-300">
                        SuperUser
                      </span>
                    )}
                  </div>
                )}

                {/* Menyalternativ */}
                <div className="py-2">
                  {/* Mina rundor */}
                  <button
                    onClick={handleMyRuns}
                    className="w-full px-4 py-2 text-left hover:bg-slate-800 transition-colors flex items-center justify-between"
                  >
                    <span className="text-gray-200">Mina rundor</span>
                    {hasLocalRuns && (
                      <span className="px-2 py-0.5 bg-cyan-500/20 border border-cyan-500/50 rounded text-xs text-cyan-300">
                        {localCreatedCount + localJoinedCount}
                      </span>
                    )}
                  </button>

                  {/* SuperUser-funktioner */}
                  {isSuperUser && (
                    <>
                      <div className="my-2 border-t border-slate-700" />
                      <button
                        onClick={() => { setIsMenuOpen(false); navigate('/superuser/all-runs'); }}
                        className="w-full px-4 py-2 text-left hover:bg-slate-800 transition-colors text-red-300"
                      >
                        Alla rundor
                      </button>
                      <button
                        onClick={() => { setIsMenuOpen(false); navigate('/superuser/users'); }}
                        className="w-full px-4 py-2 text-left hover:bg-slate-800 transition-colors text-red-300"
                      >
                        Alla användare
                      </button>
                      <button
                        onClick={() => { setIsMenuOpen(false); navigate('/admin/questions'); }}
                        className="w-full px-4 py-2 text-left hover:bg-slate-800 transition-colors text-red-300"
                      >
                        Frågebank
                      </button>
                    </>
                  )}

                  {/* Login/Logout */}
                  <div className="my-2 border-t border-slate-700" />
                  {isAuthenticated ? (
                    <button
                      onClick={handleLogout}
                      className="w-full px-4 py-2 text-left hover:bg-slate-800 transition-colors text-red-300"
                    >
                      Logga ut
                    </button>
                  ) : (
                    <button
                      onClick={handleLogin}
                      className="w-full px-4 py-2 text-left hover:bg-slate-800 transition-colors text-cyan-300 font-semibold"
                    >
                      Logga in
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;