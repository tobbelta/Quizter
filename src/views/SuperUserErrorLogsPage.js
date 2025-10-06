/**
 * SuperUser Error Logs Page
 * Visar felloggar och debug-information från Firestore
 */
import React, { useState, useEffect } from 'react';
import { db } from '../firebaseClient';
import { collection, query, orderBy, limit, getDocs, where } from 'firebase/firestore';
import PageLayout from '../components/layout/PageLayout';

const SuperUserErrorLogsPage = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, error, debug, info
  const [limit State, setLimitState] = useState(50);

  useEffect(() => {
    loadLogs();
  }, [filter, limitState]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const logsRef = collection(db, 'errorLogs');
      let q = query(logsRef, orderBy('timestamp', 'desc'), limit(limitState));

      if (filter !== 'all') {
        q = query(logsRef, where('level', '==', filter), orderBy('timestamp', 'desc'), limit(limitState));
      }

      const snapshot = await getDocs(q);
      const logsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate(),
      }));

      setLogs(logsData);
    } catch (error) {
      console.error('Failed to load logs:', error);
    } finally {
      setLoading(false);
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
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-slate-100">Error Logs & Debug Info</h1>
          <button
            onClick={loadLogs}
            className="px-4 py-2 bg-cyan-500 text-black rounded-lg font-semibold hover:bg-cyan-400"
          >
            Uppdatera
          </button>
        </div>

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
                className={`rounded-2xl border p-4 ${getLevelColor(log.level)}`}
              >
                <div className="flex items-start justify-between gap-4">
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
    </PageLayout>
  );
};

export default SuperUserErrorLogsPage;
