/**
 * Header-komponent med logotyp, dynamisk titel och hamburger-meny
 *
 * Props:
 * - title: Text som visas i mitten (default: "GeoQuest")
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { localStorageService } from '../../services/localStorageService';
import { messageService } from '../../services/messageService';
import { analyticsService } from '../../services/analyticsService';
import { userPreferencesService } from '../../services/userPreferencesService';
import useRunLocation from '../../hooks/useRunLocation';
import AboutDialog from '../shared/AboutDialog';
import MessagesDropdown from '../shared/MessagesDropdown';
import MessageDialog from '../shared/MessageDialog';

import { VERSION, BUILD_DATE } from '../../version';
import { useBackgroundTasks } from '../../context/BackgroundTaskContext';
import BackgroundTasksDropdown from '../backgroundTasks/BackgroundTasksDropdown';

const Header = ({ title = 'RouteQuest' }) => {
  const navigate = useNavigate();
  const { currentUser, isAuthenticated, isSuperUser, logout } = useAuth();
  const { status: gpsStatus, coords, trackingEnabled, enableTracking, disableTracking } = useRunLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const [showTasks, setShowTasks] = useState(false);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const {
    myTrackedTasks,
    unreadTaskIds,
    unreadCount: taskUnreadCount,
    hasActiveTrackedTasks,
    markTaskAsSeen,
    markAllTasksAsSeen,
  } = useBackgroundTasks();
  const [guestAlias, setGuestAlias] = useState(() => {
    if (typeof window === 'undefined') return '';
    return userPreferencesService.getAlias();
  });
  const [language, setLanguage] = useState(() => {
    if (typeof window === 'undefined') return 'sv';
    return localStorage.getItem('routequest:language') || 'sv';
  });
  const [dialogConfig, setDialogConfig] = useState({ isOpen: false, title: '', message: '', type: 'info' });

  const handleRemoveAlias = useCallback(() => {
    try {
      userPreferencesService.removeAlias();
      userPreferencesService.removeContact();
    } catch (error) {
      console.warn('[Header] Kunde inte ta bort alias:', error);
    }
    setGuestAlias('');
    setIsMenuOpen(false);
  }, []);

  useEffect(() => {
    if (!isMenuOpen) return;
    try {
      setGuestAlias(userPreferencesService.getAlias());
    } catch (error) {
      console.warn('[Header] Kunde inte läsa gästalias:', error);
    }
  }, [isMenuOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleStorage = (event) => {
      if (!event.key || event.key === 'geoquest:preferences') {
        setGuestAlias(userPreferencesService.getAlias());
      }
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('userPreferences:changed', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('userPreferences:changed', handleStorage);
    };
  }, []);

  useEffect(() => {
    if (!currentUser || currentUser.isAnonymous) {
      setGuestAlias(userPreferencesService.getAlias());
    }
  }, [currentUser]);

    // Hämta aktuell oläst-meddelanderäkning
  useEffect(() => {
    let isMounted = true;
    const deviceId = analyticsService.getDeviceId();
    const userId = currentUser?.isAnonymous ? null : currentUser?.uid;

    const loadUnread = async () => {
      try {
        const count = await messageService.getUnreadCount(userId, deviceId);
        if (isMounted) {
          setUnreadMessageCount(count);
        }
      } catch (error) {
        console.error('[Header] Failed to load unread message count:', error);
      }
    };

    loadUnread();

    return () => {
      isMounted = false;
    };
  }, [currentUser]);

  useEffect(() => {
    if (!isAuthenticated) {
      setShowTasks(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (showMessages) {
      setShowTasks(false);
    }
  }, [showMessages]);

  useEffect(() => {
    if (showTasks) {
      setShowMessages(false);
    }
  }, [showTasks]);

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

  const handleLanguageChange = (lang) => {
    setLanguage(lang);
    if (typeof window !== 'undefined') {
      localStorage.setItem('routequest:language', lang);
      // Skicka custom event så andra komponenter kan reagera
      window.dispatchEvent(new Event('languageChange'));
    }
  };

  const handleToggleGPS = () => {
    if (trackingEnabled) {
      disableTracking();
    } else {
      enableTracking();
    }
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
    <header className="bg-slate-900/95 backdrop-blur-sm border-b border-slate-700 fixed top-0 left-0 right-0 z-50">
      

      <div className="mx-auto w-full max-w-6xl px-3 py-2 grid grid-cols-[auto_1fr_auto] items-center gap-2 sm:gap-3">
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
              className={`w-8 h-8 sm:w-9 sm:h-9 flex-shrink-0 transition-all ${gpsIndicator.color} ${gpsIndicator.spin ? 'animate-spin' : ''}`}
              style={gpsIndicator.spin ? { animationDuration: '2s' } : {}}
            />
          </button>
        </div>

        {/* Mitten: Dynamisk titel */}
        <div className="text-center px-1 flex items-center justify-center overflow-hidden gap-1.5">
          <h1 className="text-sm sm:text-base md:text-lg font-bold bg-gradient-to-r from-cyan-400 to-indigo-400 bg-clip-text text-transparent whitespace-nowrap">
            {title}
          </h1>
          {isSuperUser && (
            <span className="px-1.5 py-0.5 bg-red-500/20 border border-red-500/50 rounded text-[10px] text-red-300">
              SU
            </span>
          )}
        </div>

        {/* Höger: Hamburger-meny */}
        <div className="relative flex justify-end">
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="p-1.5 rounded-lg hover:bg-slate-800 transition-colors relative"
            aria-label="Meny"
          >
            <div className="w-5 h-5 flex flex-col justify-center gap-1">
              <span className={`block h-0.5 bg-gray-300 transition-all ${isMenuOpen ? 'rotate-45 translate-y-1.5' : ''}`} />
              <span className={`block h-0.5 bg-gray-300 transition-all ${isMenuOpen ? 'opacity-0' : ''}`} />
              <span className={`block h-0.5 bg-gray-300 transition-all ${isMenuOpen ? '-rotate-45 -translate-y-1.5' : ''}`} />
            </div>
            {/* Badge för bakgrundsjobb, meddelanden eller lokala rundor */}
            {taskUnreadCount > 0 ? (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-amber-500 rounded-full text-xs font-bold text-black flex items-center justify-center animate-pulse">
                {taskUnreadCount}
              </span>
            ) : unreadMessageCount > 0 ? (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-xs font-bold text-white flex items-center justify-center animate-pulse">
                {unreadMessageCount}
              </span>
            ) : hasActiveTrackedTasks ? (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-amber-400 rounded-full animate-ping" />
            ) : hasLocalRuns ? (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-cyan-500 rounded-full text-xs font-bold text-black flex items-center justify-center">
                {localCreatedCount + localJoinedCount}
              </span>
            ) : null}
          </button>

          {/* Meny trigger placeholder */}
        </div>
      </div>
    </header>

    {/* Dropdown-meny - utanför header */}
    {isMenuOpen && (
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 z-[60]"
          onClick={() => setIsMenuOpen(false)}
        />

        {/* Meny */}
        <div className="fixed top-[4.5rem] right-4 w-64 bg-slate-900 rounded-lg border border-slate-700 shadow-xl z-[70] max-h-[calc(100vh-6rem)] overflow-hidden">
          <div className="max-h-[calc(100vh-7rem)] overflow-y-auto">

                {/* Användarinfo - visa bara för riktigt inloggade */}
                {isAuthenticated && !currentUser?.isAnonymous && (
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

                {/* Gäststatus - visa bara för anonyma */}
                {((isAuthenticated && currentUser?.isAnonymous) || (!isAuthenticated && guestAlias)) && (
                  <div className="px-4 py-3 border-b border-slate-700">
                    <p className="text-sm text-gray-400">Gäst (ej inloggad)</p>
                    {guestAlias ? (
                      <>
                        <p className="mt-1 text-sm font-semibold text-gray-200">{guestAlias}</p>
                        <button
                          type="button"
                          onClick={handleRemoveAlias}
                          className="mt-2 text-xs font-semibold text-red-300 hover:text-red-200"
                        >
                          Ta bort alias
                        </button>
                      </>
                    ) : (
                      <p className="mt-1 text-xs text-gray-500">Alias visas här när du sparat ett.</p>
                    )}
                  </div>
                )}

                {/* Menyalternativ */}
                <div className="py-2">
                  {/* Meddelanden */}
                  <button
                    onClick={() => { setIsMenuOpen(false); setShowMessages(!showMessages); }}
                    className="w-full px-4 py-2 text-left hover:bg-slate-800 transition-colors flex items-center justify-between"
                  >
                    <span className="text-gray-200">Meddelanden</span>
                    {unreadMessageCount > 0 && (
                      <span className="px-2 py-0.5 bg-cyan-500 rounded text-xs font-bold text-black">
                        {unreadMessageCount}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => { setIsMenuOpen(false); setShowTasks(true); }}
                    className="w-full px-4 py-2 text-left hover:bg-slate-800 transition-colors flex items-center justify-between"
                  >
                    <span className="text-gray-200">Bakgrundsjobb</span>
                    {taskUnreadCount > 0 ? (
                      <span className="px-2 py-0.5 bg-amber-500 rounded text-xs font-bold text-black">
                        {taskUnreadCount}
                      </span>
                    ) : hasActiveTrackedTasks ? (
                      <span className="px-2 py-0.5 bg-amber-500/20 border border-amber-500/40 text-amber-300 rounded text-[11px] font-semibold">
                        Pågår
                      </span>
                    ) : null}
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

                  {/* Inställningar */}
                  <div className="my-2 border-t border-slate-700" />
                  <div className="px-4 py-2 text-xs text-gray-500 font-semibold">
                    INSTÄLLNINGAR
                  </div>

                  {/* GPS-status och toggle */}
                  <div className="px-4 py-2">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-300">GPS-spårning</span>
                      <button
                        onClick={handleToggleGPS}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          trackingEnabled ? 'bg-emerald-500' : 'bg-slate-600'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            trackingEnabled ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                    {/* Visa alltid GPS-status */}
                    <div className="text-xs space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className={gpsIndicator.textColor}>●</span>
                        <span className={gpsIndicator.textColor + ' font-medium'}>{gpsIndicator.title}</span>
                      </div>
                      {trackingEnabled && coords && coords.lat && coords.lng && (
                        <div className="font-mono text-[10px] text-gray-400 pl-4">
                          {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Språkval */}
                  <div className="px-4 py-2">
                    <div className="text-sm text-gray-300 mb-2">Språk</div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleLanguageChange('sv')}
                        className={`flex-1 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                          language === 'sv'
                            ? 'bg-cyan-500 text-black'
                            : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                        }`}
                      >
                        Svenska
                      </button>
                      <button
                        onClick={() => handleLanguageChange('en')}
                        className={`flex-1 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                          language === 'en'
                            ? 'bg-cyan-500 text-black'
                            : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                        }`}
                      >
                        English
                      </button>
                    </div>
                  </div>

                  {/* SuperUser-funktioner */}
                  {isSuperUser && (
                    <>
                      <div className="my-2 border-t border-slate-700" />
                      <button
                        onClick={() => { setIsMenuOpen(false); navigate('/superuser/notifications'); }}
                        className="w-full px-4 py-2 text-left hover:bg-slate-800 transition-colors text-red-300"
                      >
                        Systemnotiser
                      </button>
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
                      <button
                        onClick={() => { setIsMenuOpen(false); navigate('/superuser/tasks'); }}
                        className="w-full px-4 py-2 text-left hover:bg-slate-800 transition-colors text-red-300 flex items-center justify-between"
                      >
                        <span>Bakgrundsjobb</span>
                        {taskUnreadCount > 0 && (
                          <span className="px-2 py-0.5 bg-amber-500 rounded text-xs font-bold text-black">
                            {taskUnreadCount}
                          </span>
                        )}
                      </button>
                      <button
                        onClick={() => { setIsMenuOpen(false); navigate('/superuser/logs'); }}
                        className="w-full px-4 py-2 text-left hover:bg-slate-800 transition-colors text-red-300"
                      >
                        🔴 Error Logs
                      </button>

                      {/* Developer Tools - Endast localhost */}
                      {window.location.hostname === 'localhost' && (
                        <>
                          <div className="my-2 border-t border-slate-700" />
                          <div className="px-4 py-2 text-xs text-gray-500 font-semibold">
                            DEVELOPER TOOLS
                          </div>
                          <button
                            onClick={async () => {
                              setIsMenuOpen(false);
                              if (window.confirm('Uppdatera alla frågor med createdAt-fält?\n\nDetta kan ta några sekunder.')) {
                                try {
                                  const response = await fetch('https://europe-west1-geoquest2-7e45c.cloudfunctions.net/updateQuestionsCreatedAt');
                                  const data = await response.json();
                                  setDialogConfig({
                                    isOpen: true,
                                    title: 'Uppdatering klar',
                                    message: `✅ Klart!\n\nUppdaterade: ${data.updated}\nHade redan: ${data.alreadyHad}\nTotalt: ${data.total}`,
                                    type: 'success'
                                  });
                                  // Ladda om sidan för att visa uppdaterade datum
                                  setTimeout(() => window.location.reload(), 2000);
                                } catch (error) {
                                  setDialogConfig({
                                    isOpen: true,
                                    title: 'Fel vid uppdatering',
                                    message: `❌ Fel: ${error.message}`,
                                    type: 'error'
                                  });
                                }
                              }
                            }}
                            className="w-full px-4 py-2 text-left hover:bg-slate-800 transition-colors text-yellow-300 text-sm"
                          >
                            🔧 Update Questions createdAt
                          </button>
                        </>
                      )}
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

                  {/* Version */}
                  <div className="px-4 py-3 text-xs text-gray-400">
                    <div>Version {VERSION}</div>
                    <div className="text-gray-500 mt-1">
                      Build: {new Date(BUILD_DATE).toLocaleString('sv-SE', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: false
                      }).replace(',', '')}
                    </div>
                  </div>

                  {/* Login/Logout */}
                  <div className="my-2 border-t border-slate-700" />
                  {isAuthenticated && !currentUser?.isAnonymous ? (
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
        </div>
      </>
    )}

    {/* About Dialog - måste vara utanför header */}
    <AboutDialog isOpen={showAbout} onClose={() => setShowAbout(false)} />

    {/* Background task dropdown */}
    {showTasks && (
      <>
        <div
          className="fixed inset-0 z-[60]"
          onClick={() => setShowTasks(false)}
        />
        <BackgroundTasksDropdown
          isOpen={showTasks}
          tasks={myTrackedTasks}
          unreadTaskIds={unreadTaskIds}
          onMarkTaskSeen={markTaskAsSeen}
          onMarkAllSeen={() => {
            markAllTasksAsSeen();
            setShowTasks(false);
          }}
          onClose={() => setShowTasks(false)}
          isSuperUser={isSuperUser}
        />
      </>
    )}

    {/* Messages Dropdown */}
    {showMessages && (
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 z-[60]"
          onClick={() => setShowMessages(false)}
        />
        {/* Dropdown positioned near hamburger menu */}
        <div className="fixed top-16 right-4 z-[70]">
          <MessagesDropdown
            isOpen={showMessages}
            onClose={() => setShowMessages(false)}
            onUnreadChange={setUnreadMessageCount}
          />
        </div>
      </>
    )}

    <MessageDialog
      isOpen={dialogConfig.isOpen}
      onClose={() => setDialogConfig({ ...dialogConfig, isOpen: false })}
      title={dialogConfig.title}
      message={dialogConfig.message}
      type={dialogConfig.type}
    />
    </>
  );
};

export default Header;
