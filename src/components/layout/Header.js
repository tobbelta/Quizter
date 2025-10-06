/**
 * Header-komponent med logotyp, dynamisk titel och hamburger-meny
 *
 * Props:
 * - title: Text som visas i mitten (default: "GeoQuest")
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { localStorageService } from '../../services/localStorageService';
import { messageService } from '../../services/messageService';
import { analyticsService } from '../../services/analyticsService';
import useRunLocation from '../../hooks/useRunLocation';
import AboutDialog from '../shared/AboutDialog';
import MessagesDropdown from '../shared/MessagesDropdown';
import { VERSION, BUILD_DATE } from '../../version';

const Header = ({ title = 'RouteQuest' }) => {
  const navigate = useNavigate();
  const { currentUser, isAuthenticated, isSuperUser, logout } = useAuth();
  const { status: gpsStatus, coords, trackingEnabled } = useRunLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);

  console.log('Header isSuperUser:', isSuperUser);

  // Lyssna på olästa meddelanden i realtid
  useEffect(() => {
    const deviceId = analyticsService.getDeviceId();
    const userId = currentUser?.isAnonymous ? null : currentUser?.id;

    // Prenumerera på meddelanden i realtid
    const unsubscribe = messageService.subscribeToMessages(userId, deviceId, (messages) => {
      const unreadCount = messages.filter(m => !m.read && !m.deleted).length;
      setUnreadMessageCount(unreadCount);
    });

    return () => unsubscribe();
  }, [currentUser]);

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

  // GPS-status visuella indikatorer
  const getGPSIndicator = () => {
    if (!trackingEnabled) {
      return { color: 'opacity-40', spin: false, title: 'GPS avstängd', textColor: 'text-gray-400' };
    }

    switch (gpsStatus) {
      case 'idle':
      case 'pending':
        return { color: 'opacity-60', spin: true, title: 'Söker GPS...', textColor: 'text-gray-400' };
      case 'active':
        const accuracy = coords?.accuracy ? Math.round(coords.accuracy) : null;
        if (accuracy && accuracy < 20) {
          return { color: 'drop-shadow-[0_0_8px_rgba(52,211,153,0.6)]', spin: false, title: `±${accuracy}m`, textColor: 'text-emerald-400' };
        } else if (accuracy && accuracy < 50) {
          return { color: 'drop-shadow-[0_0_8px_rgba(34,211,238,0.6)]', spin: false, title: `±${accuracy}m`, textColor: 'text-cyan-400' };
        }
        return { color: 'drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]', spin: false, title: accuracy ? `±${accuracy}m` : 'GPS aktiv', textColor: 'text-amber-400' };
      case 'denied':
        return { color: 'opacity-40 saturate-0', spin: false, title: 'GPS nekad', textColor: 'text-red-400' };
      case 'unsupported':
        return { color: 'opacity-30', spin: false, title: 'GPS stöds ej', textColor: 'text-gray-400' };
      default:
        return { color: 'opacity-60', spin: false, title: 'GPS ej tillgänglig', textColor: 'text-gray-400' };
    }
  };

  const gpsIndicator = getGPSIndicator();

  return (
    <>
    <header className="bg-slate-900/95 backdrop-blur-sm border-b border-slate-700 fixed top-0 left-0 right-0 z-50 safe-area-inset">
      <div className="w-full px-4 py-3 grid grid-cols-[auto_1fr_auto] items-center gap-4">
        {/* Vänster: Logotyp med GPS-status */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/')}
            className="hover:opacity-80 transition-opacity"
            aria-label="Gå till startsidan"
          >
            <img
              src="/logo-compass.svg"
              alt="RouteQuest"
              className={`w-10 h-10 flex-shrink-0 transition-all ${gpsIndicator.color} ${gpsIndicator.spin ? 'animate-spin' : ''}`}
              style={gpsIndicator.spin ? { animationDuration: '2s' } : {}}
            />
          </button>
          {/* GPS-status text - synlig på mobil */}
          <span className={`text-xs font-medium whitespace-nowrap ${gpsIndicator.textColor}`}>
            {gpsIndicator.title}
          </span>
        </div>

        {/* Mitten: Dynamisk titel */}
        <div className="text-center px-2 flex flex-col items-center justify-center overflow-hidden">
          <div className="flex items-center">
            <h1 className="text-lg md:text-xl font-bold bg-gradient-to-r from-cyan-400 to-indigo-400 bg-clip-text text-transparent whitespace-nowrap">
              {title}
            </h1>
            {isSuperUser && (
              <span className="ml-2 px-2 py-0.5 bg-red-500/20 border border-red-500/50 rounded text-xs text-red-300">
                SuperUser
              </span>
            )}
          </div>
          {/* Version info - diskret */}
          <span className="text-[10px] text-gray-500 mt-0.5">
            v{VERSION}
          </span>
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
            {/* Badge för olästa meddelanden (prioritet) eller lokala rundor */}
            {unreadMessageCount > 0 ? (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-xs font-bold text-white flex items-center justify-center animate-pulse">
                {unreadMessageCount}
              </span>
            ) : hasLocalRuns ? (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-cyan-500 rounded-full text-xs font-bold text-black flex items-center justify-center">
                {localCreatedCount + localJoinedCount}
              </span>
            ) : null}
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
                  {/* Meddelanden */}
                  <button
                    onClick={() => { setShowMessages(!showMessages); }}
                    className="w-full px-4 py-2 text-left hover:bg-slate-800 transition-colors flex items-center justify-between"
                  >
                    <span className="text-gray-200">Meddelanden</span>
                    {unreadMessageCount > 0 && (
                      <span className="px-2 py-0.5 bg-cyan-500 rounded text-xs font-bold text-black">
                        {unreadMessageCount}
                      </span>
                    )}
                  </button>

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
                      <button
                        onClick={() => { setIsMenuOpen(false); navigate('/superuser/analytics'); }}
                        className="w-full px-4 py-2 text-left hover:bg-slate-800 transition-colors text-red-300"
                      >
                        Besöksstatistik
                      </button>
                      <button
                        onClick={() => { setIsMenuOpen(false); navigate('/superuser/messages'); }}
                        className="w-full px-4 py-2 text-left hover:bg-slate-800 transition-colors text-red-300"
                      >
                        Meddelanden
                      </button>
                    </>
                  )}

                  {/* Om RouteQuest */}
                  <div className="my-2 border-t border-slate-700" />
                  <button
                    onClick={() => { setIsMenuOpen(false); setShowAbout(true); }}
                    className="w-full px-4 py-2 text-left hover:bg-slate-800 transition-colors text-gray-200"
                  >
                    Om RouteQuest
                  </button>

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

    {/* About Dialog - måste vara utanför header */}
    <AboutDialog isOpen={showAbout} onClose={() => setShowAbout(false)} />

    {/* Messages Dropdown */}
    {showMessages && (
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowMessages(false)}
        />
        {/* Dropdown positioned near hamburger menu */}
        <div className="fixed top-16 right-4 z-50">
          <MessagesDropdown
            isOpen={showMessages}
            onClose={() => setShowMessages(false)}
          />
        </div>
      </>
    )}
    </>
  );
};

export default Header;