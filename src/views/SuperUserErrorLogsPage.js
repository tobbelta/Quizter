/**
 * SuperUser Error Logs Page
 * Visar felloggar och debug-information från Firestore
 */
import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../firebaseClient';
import { collection, query, orderBy, limit, getDocs, doc, writeBatch, onSnapshot } from 'firebase/firestore';
import PageLayout from '../components/layout/PageLayout';
import MessageDialog from '../components/shared/MessageDialog';

const SuperUserErrorLogsPage = () => {
  const [logs, setLogs] = useState([]);
  const [allLogs, setAllLogs] = useState([]); // Alla hämtade loggar
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, error, debug, info
  const [deviceFilter, setDeviceFilter] = useState('all'); // all eller specifikt deviceId
  const [limitState, setLimitState] = useState(50);
  const [availableDevices, setAvailableDevices] = useState([]);
  const [selectedLogs, setSelectedLogs] = useState(new Set());
  const [deleting, setDeleting] = useState(false);
  const [isLive, setIsLive] = useState(true);
  const [dialogConfig, setDialogConfig] = useState({ isOpen: false, title: '', message: '', type: 'info' });

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const logsRef = collection(db, 'errorLogs');
      // Hämta fler loggar för att ha tillräckligt för filtrering
      const fetchLimit = 500;
      const q = query(logsRef, orderBy('timestamp', 'desc'), limit(fetchLimit));

      const snapshot = await getDocs(q);
      const logsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate(),
      }));

      setAllLogs(logsData);

      // Extrahera unika enheter
      const devices = [...new Set(logsData.map(log => log.deviceId).filter(Boolean))];
      setAvailableDevices(devices);

    } catch (error) {
      console.error('Failed to load logs:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Sätt upp realtid-lyssning för nya loggar
  useEffect(() => {
    if (!isLive) return; // Om live mode är av, lyssna inte

    const logsRef = collection(db, 'errorLogs');
    const fetchLimit = 500;
    const q = query(logsRef, orderBy('timestamp', 'desc'), limit(fetchLimit));

    // Lyssna på förändringar i realtid
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate(),
      }));

      setAllLogs(logsData);

      // Uppdatera enheter
      const devices = [...new Set(logsData.map(log => log.deviceId).filter(Boolean))];
      setAvailableDevices(devices);

      // Första gången sätter vi loading till false
      setLoading(false);
    }, (error) => {
      console.error('Error listening to logs:', error);
      setLoading(false);
    });

    // Cleanup: avsluta prenumeration när komponenten unmountas
    return () => unsubscribe();
  }, [isLive]);

  // Filtrera loggar baserat på filter och deviceFilter
  useEffect(() => {
    let filtered = [...allLogs];

    // Filtrera på level
    if (filter !== 'all') {
      filtered = filtered.filter(log => log.level === filter);
    }

    // Filtrera på device
    if (deviceFilter !== 'all') {
      filtered = filtered.filter(log => log.deviceId === deviceFilter);
    }

    // Begränsa till limit
    filtered = filtered.slice(0, limitState);

    setLogs(filtered);
  }, [allLogs, filter, deviceFilter, limitState]);

  // Hantera val av loggar
  const toggleSelectLog = (logId) => {
    setSelectedLogs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(logId)) {
        newSet.delete(logId);
      } else {
        newSet.add(logId);
      }
      return newSet;
    });
  };

  const selectAllVisible = () => {
    setSelectedLogs(new Set(logs.map(log => log.id)));
  };

  const deselectAll = () => {
    setSelectedLogs(new Set());
  };

  // Ta bort valda loggar
  const deleteSelectedLogs = async () => {
    if (selectedLogs.size === 0) return;

    const confirmed = window.confirm(
      `Är du säker på att du vill ta bort ${selectedLogs.size} logg${selectedLogs.size !== 1 ? 'ar' : ''}?`
    );

    if (!confirmed) return;

    setDeleting(true);
    try {
      // Ta bort i batchar om fler än 500 (Firestore batch limit)
      const logIds = Array.from(selectedLogs);
      const batchSize = 500;

      for (let i = 0; i < logIds.length; i += batchSize) {
        const batch = writeBatch(db);
        const batchIds = logIds.slice(i, i + batchSize);

        batchIds.forEach(logId => {
          const logRef = doc(db, 'errorLogs', logId);
          batch.delete(logRef);
        });

        await batch.commit();
      }

      // Uppdatera lokala states
      setAllLogs(prev => prev.filter(log => !selectedLogs.has(log.id)));
      setSelectedLogs(new Set());

      setDialogConfig({
        isOpen: true,
        title: 'Loggar borttagna',
        message: `${logIds.length} logg${logIds.length !== 1 ? 'ar' : ''} togs bort`,
        type: 'success'
      });
    } catch (error) {
      console.error('Failed to delete logs:', error);
      setDialogConfig({
        isOpen: true,
        title: 'Kunde inte ta bort loggar',
        message: error.message,
        type: 'error'
      });
    } finally {
      setDeleting(false);
    }
  };

  // Ta bort ALLA loggar (inte bara filtrerade)
  const deleteAllLogs = async () => {
    const firstConfirm = window.confirm(
      `⚠️ VARNING! Du är på väg att ta bort ALLA loggar i systemet.\n\nDetta inkluderar ALLA ${allLogs.length}+ loggar, oavsett filter.\n\nÄr du säker på att du vill fortsätta?`
    );

    if (!firstConfirm) return;

    const secondConfirm = window.confirm(
      `⚠️ SISTA CHANSEN!\n\nDetta kommer att PERMANENT ta bort alla felloggar och debug-information.\n\nDetta kan INTE ångras!\n\nKlicka OK för att radera alla loggar.`
    );

    if (!secondConfirm) return;

    setDeleting(true);
    try {
      // Hämta ALLA loggar (inte bara de filtrerade)
      const logsRef = collection(db, 'errorLogs');
      const allLogsQuery = query(logsRef, orderBy('timestamp', 'desc'));
      const snapshot = await getDocs(allLogsQuery);

      const logIds = snapshot.docs.map(doc => doc.id);
      const batchSize = 500;

      for (let i = 0; i < logIds.length; i += batchSize) {
        const batch = writeBatch(db);
        const batchIds = logIds.slice(i, i + batchSize);

        batchIds.forEach(logId => {
          const logRef = doc(db, 'errorLogs', logId);
          batch.delete(logRef);
        });

        await batch.commit();
      }

      // Ladda om loggar
      await loadLogs();
      setSelectedLogs(new Set());

      setDialogConfig({
        isOpen: true,
        title: 'Alla loggar raderade',
        message: `Alla ${logIds.length} loggar har raderats`,
        type: 'success'
      });
    } catch (error) {
      console.error('Failed to delete all logs:', error);
      setDialogConfig({
        isOpen: true,
        title: 'Kunde inte ta bort loggar',
        message: error.message,
        type: 'error'
      });
    } finally {
      setDeleting(false);
    }
  };

  const getLevelColor = (level) => {
    switch (level) {
      case 'error':
        return 'bg-red-900/40 border-red-500/40 text-red-200';
      case 'debug':
        return 'bg-blue-900/40 border-blue-500/40 text-blue-200';
      case 'info':
        return 'bg-emerald-900/40 border-emerald-500/40 text-emerald-200';
      default:
        return 'bg-slate-900/40 border-slate-500/40 text-slate-200';
    }
  };

  const getLevelIcon = (level) => {
    switch (level) {
      case 'error':
        return '🔴';
      case 'debug':
        return '📍';
      case 'info':
        return 'ℹ️';
      default:
        return '📝';
    }
  };

  return (
    <PageLayout headerTitle="Error Logs" maxWidth="max-w-6xl">
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-slate-100">Error Logs & Debug Info</h1>
            {isLive && (
              <div className="flex items-center gap-2 px-3 py-1 bg-green-900/40 border border-green-500/40 rounded-full">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                <span className="text-xs text-green-300 font-semibold">LIVE</span>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setIsLive(!isLive)}
              className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                isLive
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
              }`}
            >
              {isLive ? '⏸️ Pausa live' : '▶️ Aktivera live'}
            </button>
            <button
              onClick={loadLogs}
              disabled={isLive}
              className="px-4 py-2 bg-cyan-500 text-black rounded-lg font-semibold hover:bg-cyan-400 disabled:bg-slate-600 disabled:text-gray-400"
            >
              Uppdatera
            </button>
            {selectedLogs.size > 0 && (
              <button
                onClick={deleteSelectedLogs}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 disabled:bg-gray-600"
              >
                {deleting ? 'Tar bort...' : `🗑️ Ta bort valda (${selectedLogs.size})`}
              </button>
            )}
          </div>
        </div>

        {/* Selection controls */}
        {logs.length > 0 && (
          <div className="flex items-center gap-3 bg-slate-800/50 rounded-lg p-3">
            <button
              onClick={selectAllVisible}
              className="px-3 py-1 bg-slate-700 text-white rounded text-sm hover:bg-slate-600"
            >
              Markera alla ({logs.length})
            </button>
            <button
              onClick={deselectAll}
              className="px-3 py-1 bg-slate-700 text-white rounded text-sm hover:bg-slate-600"
            >
              Avmarkera alla
            </button>
            <div className="flex-1"></div>
            <button
              onClick={deleteAllLogs}
              disabled={deleting}
              className="px-3 py-1 bg-red-700 text-white rounded text-sm hover:bg-red-800 disabled:bg-gray-600 font-semibold"
            >
              🗑️ Radera alla loggar
            </button>
          </div>
        )}

        {/* Filter buttons */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
              filter === 'all'
                ? 'bg-slate-700 text-white'
                : 'bg-slate-800 text-gray-400 hover:text-white'
            }`}
          >
            Alla ({logs.length})
          </button>
          <button
            onClick={() => setFilter('error')}
            className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
              filter === 'error'
                ? 'bg-red-700 text-white'
                : 'bg-slate-800 text-gray-400 hover:text-white'
            }`}
          >
            🔴 Errors
          </button>
          <button
            onClick={() => setFilter('debug')}
            className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
              filter === 'debug'
                ? 'bg-blue-700 text-white'
                : 'bg-slate-800 text-gray-400 hover:text-white'
            }`}
          >
            📍 GPS Debug
          </button>
          <button
            onClick={() => setFilter('info')}
            className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
              filter === 'info'
                ? 'bg-emerald-700 text-white'
                : 'bg-slate-800 text-gray-400 hover:text-white'
            }`}
          >
            ℹ️ Info
          </button>
        </div>

        {/* Device filter */}
        <div className="space-y-2">
          <span className="text-sm text-gray-400">Filtrera enhet:</span>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setDeviceFilter('all')}
              className={`px-3 py-1 rounded text-sm ${
                deviceFilter === 'all'
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-800 text-gray-400 hover:text-white'
              }`}
            >
              Alla enheter
            </button>
            {availableDevices.slice(0, 10).map(deviceId => (
              <button
                key={deviceId}
                onClick={() => setDeviceFilter(deviceId)}
                className={`px-3 py-1 rounded text-sm font-mono ${
                  deviceFilter === deviceId
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-800 text-gray-400 hover:text-white'
                }`}
                title={deviceId}
              >
                {deviceId.substring(0, 8)}...
              </button>
            ))}
          </div>
        </div>

        {/* Limit selector */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">Visa:</span>
          {[50, 100, 200].map(num => (
            <button
              key={num}
              onClick={() => setLimitState(num)}
              className={`px-3 py-1 rounded text-sm ${
                limitState === num
                  ? 'bg-cyan-600 text-white'
                  : 'bg-slate-800 text-gray-400 hover:text-white'
              }`}
            >
              {num}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
            <p className="mt-4 text-gray-400">Laddar loggar...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            Inga loggar hittades
          </div>
        ) : (
          <div className="space-y-4">
            {logs.map((log) => (
              <div
                key={log.id}
                className={`rounded-2xl border p-4 ${getLevelColor(log.level)} ${
                  selectedLogs.has(log.id) ? 'ring-2 ring-cyan-500' : ''
                }`}
              >
                <div className="flex items-start gap-4">
                  <input
                    type="checkbox"
                    checked={selectedLogs.has(log.id)}
                    onChange={() => toggleSelectLog(log.id)}
                    className="mt-1 h-5 w-5 rounded border-gray-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500 cursor-pointer"
                  />
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{getLevelIcon(log.level)}</span>
                      <span className="font-semibold">{log.type}</span>
                      <span className="text-xs opacity-60">
                        {log.timestamp?.toLocaleString('sv-SE')}
                      </span>
                    </div>

                    {log.message && (
                      <p className="text-sm font-mono">{log.message}</p>
                    )}

                    {/* Error location info - för alla errors */}
                    {log.level === 'error' && (
                      <div className="bg-red-900/20 rounded p-3 text-xs space-y-2">
                        <div className="font-semibold text-red-300">📍 Error Location:</div>
                        {log.filename && (
                          <div className="font-mono">
                            <span className="text-gray-400">File: </span>
                            <span className="text-red-200">{log.filename}</span>
                            {log.lineno && (
                              <span className="text-red-300"> : line {log.lineno}</span>
                            )}
                            {log.colno && (
                              <span className="text-red-300"> : col {log.colno}</span>
                            )}
                          </div>
                        )}
                        {log.pathname && (
                          <div className="font-mono">
                            <span className="text-gray-400">Page: </span>
                            <span className="text-red-200">{log.pathname}</span>
                          </div>
                        )}
                        {log.stackInfo && log.stackInfo.length > 0 && (
                          <div className="space-y-1 mt-2">
                            <div className="font-semibold text-red-300">Call Stack:</div>
                            {log.stackInfo.map((frame, i) => (
                              <div key={i} className="font-mono pl-2 border-l-2 border-red-500/30">
                                {frame.function && (
                                  <div className="text-yellow-300">{frame.function}</div>
                                )}
                                <div className="text-red-200">
                                  {frame.file}:{frame.line}:{frame.column}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {log.browserInfo && (
                          <div className="mt-2 pt-2 border-t border-red-500/20">
                            <div className="font-semibold text-red-300 mb-1">Browser Info:</div>
                            <div className="grid grid-cols-2 gap-1">
                              <div><span className="text-gray-400">Platform:</span> {log.browserInfo.platform}</div>
                              <div><span className="text-gray-400">Language:</span> {log.browserInfo.language}</div>
                              <div><span className="text-gray-400">Screen:</span> {log.browserInfo.screenResolution}</div>
                              <div><span className="text-gray-400">Viewport:</span> {log.browserInfo.viewport}</div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* GPS Debug specific fields */}
                    {log.type === 'gps_debug' && (
                      <div className="bg-black/20 rounded p-3 text-xs font-mono space-y-1">
                        <div>GPS Status: <span className="text-cyan-300">{log.gpsStatus}</span></div>
                        <div>Tracking Enabled: <span className="text-cyan-300">{String(log.trackingEnabled)}</span></div>
                        {log.coords && (
                          <>
                            <div>Latitude: <span className="text-cyan-300">{log.coords.latitude}</span></div>
                            <div>Longitude: <span className="text-cyan-300">{log.coords.longitude}</span></div>
                            <div>Accuracy: <span className="text-cyan-300">{log.coords.accuracy}m</span></div>
                          </>
                        )}
                      </div>
                    )}

                    {/* Route Generation specific fields */}
                    {log.type === 'route_generation' && (
                      <div className="bg-black/20 rounded p-3 text-xs font-mono space-y-1">
                        <div>Has GPS: <span className="text-cyan-300">{String(log.hasGPS)}</span></div>
                        <div>Origin: <span className="text-cyan-300">
                          {log.originPosition?.lat?.toFixed(4)}, {log.originPosition?.lng?.toFixed(4)}
                        </span></div>
                        {log.formData && (
                          <>
                            <div>Name: <span className="text-cyan-300">{log.formData.name}</span></div>
                            <div>Length: <span className="text-cyan-300">{log.formData.lengthMeters}m</span></div>
                          </>
                        )}
                      </div>
                    )}

                    {/* Breadcrumbs - vad gjorde användaren innan felet? */}
                    {log.breadcrumbs && log.breadcrumbs.length > 0 && (
                      <details className="bg-purple-900/20 border border-purple-500/30 rounded p-3">
                        <summary className="text-xs cursor-pointer font-semibold text-purple-300">
                          🍞 User Activity Trail ({log.breadcrumbs.length} events)
                        </summary>
                        <div className="mt-2 space-y-2 max-h-60 overflow-y-auto">
                          {log.breadcrumbs.map((crumb, i) => (
                            <div key={i} className="text-xs border-l-2 border-purple-500/30 pl-2">
                              <div className="flex items-center gap-2">
                                <span className="text-purple-400 font-mono">
                                  {new Date(crumb.timestamp).toLocaleTimeString('sv-SE')}
                                </span>
                                <span className="px-1.5 py-0.5 bg-purple-500/20 rounded text-purple-300 text-[10px] font-semibold">
                                  {crumb.category}
                                </span>
                                <span className="text-gray-300">{crumb.message}</span>
                              </div>
                              {crumb.url && (
                                <div className="text-gray-500 font-mono text-[10px] mt-0.5">
                                  {crumb.url}
                                </div>
                              )}
                              {crumb.data && Object.keys(crumb.data).length > 0 && (
                                <div className="text-gray-400 font-mono text-[10px] mt-0.5">
                                  {JSON.stringify(crumb.data)}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </details>
                    )}

                    {/* Error specific fields */}
                    {log.stack && (
                      <details className="bg-black/20 rounded p-3">
                        <summary className="text-xs cursor-pointer">Stack Trace</summary>
                        <pre className="text-xs mt-2 overflow-x-auto whitespace-pre-wrap">{log.stack}</pre>
                      </details>
                    )}

                    {/* Device info */}
                    <div className="text-xs opacity-60 space-y-1">
                      <div>Device ID: {log.deviceId}</div>
                      <div>URL: {log.url}</div>
                      {log.userAgent && (
                        <div>User Agent: {log.userAgent}</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
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

export default SuperUserErrorLogsPage;
