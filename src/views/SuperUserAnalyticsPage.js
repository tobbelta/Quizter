/**
 * SuperUser-sida för att visa besöksstatistik och analytics
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { analyticsService } from '../services/analyticsService';
import Header from '../components/layout/Header';

const SuperUserAnalyticsPage = () => {
  const navigate = useNavigate();
  const { isSuperUser } = useAuth();
  const [stats, setStats] = useState(null);
  const [recentEvents, setRecentEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [eventFilter, setEventFilter] = useState('all');

  useEffect(() => {
    if (!isSuperUser) {
      navigate('/');
      return;
    }

    const loadAnalytics = async () => {
      try {
        setIsLoading(true);

        // Hämta aggregerad statistik
        const aggregatedStats = await analyticsService.getAggregatedStats();
        setStats(aggregatedStats);

        // Hämta senaste events
        const events = await analyticsService.getAnalytics({ limit: 100 });
        setRecentEvents(events);
      } catch (error) {
        console.error('Kunde inte ladda analytics:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadAnalytics();
  }, [isSuperUser, navigate]);

  const filteredEvents = eventFilter === 'all'
    ? recentEvents
    : recentEvents.filter(e => e.eventType === eventFilter);

  const formatTimestamp = (timestamp) => {
    if (!timestamp?.toDate) return 'N/A';
    return new Date(timestamp.toDate()).toLocaleString('sv-SE');
  };

  const formatAmount = (amount) => {
    return (amount / 100).toFixed(2) + ' kr';
  };

  if (!isSuperUser) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <Header title="Besöksstatistik" />

      <div className="mx-auto max-w-7xl px-4 pt-24 pb-8 space-y-8">
        {isLoading ? (
          <div className="text-center py-12 text-gray-400">Laddar statistik...</div>
        ) : (
          <>
            {/* Översiktskort */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-lg border border-purple-500/40 bg-purple-900/20 p-6">
                <h3 className="text-sm font-semibold text-purple-200 mb-2">Totala besök</h3>
                <p className="text-3xl font-bold text-purple-100">{stats?.totalVisits || 0}</p>
              </div>

              <div className="rounded-lg border border-cyan-500/40 bg-cyan-900/20 p-6">
                <h3 className="text-sm font-semibold text-cyan-200 mb-2">Unika enheter</h3>
                <p className="text-3xl font-bold text-cyan-100">{stats?.uniqueDevices || 0}</p>
              </div>

              <div className="rounded-lg border border-green-500/40 bg-green-900/20 p-6">
                <h3 className="text-sm font-semibold text-green-200 mb-2">Donationer</h3>
                <p className="text-3xl font-bold text-green-100">{stats?.donations?.count || 0}</p>
                <p className="text-sm text-green-300 mt-1">
                  {formatAmount(stats?.donations?.total || 0)}
                </p>
              </div>

              <div className="rounded-lg border border-amber-500/40 bg-amber-900/20 p-6">
                <h3 className="text-sm font-semibold text-amber-200 mb-2">Skapade rundor</h3>
                <p className="text-3xl font-bold text-amber-100">
                  {stats?.eventsByType?.create_run || 0}
                </p>
              </div>
            </div>

            {/* Händelsetyper */}
            <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-6">
              <h2 className="text-xl font-semibold text-gray-200 mb-4">Händelser per typ</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(stats?.eventsByType || {}).map(([type, count]) => (
                  <div key={type} className="rounded bg-slate-800/60 p-3">
                    <p className="text-sm text-gray-400">{type}</p>
                    <p className="text-2xl font-bold text-gray-100">{count}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Senaste händelser */}
            <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-200">Senaste händelser</h2>
                <select
                  value={eventFilter}
                  onChange={(e) => setEventFilter(e.target.value)}
                  className="rounded bg-slate-800 border border-slate-600 px-3 py-2 text-gray-200"
                >
                  <option value="all">Alla händelser</option>
                  <option value="page_view">Sidvisningar</option>
                  <option value="create_run">Skapade rundor</option>
                  <option value="join_run">Anslutningar</option>
                  <option value="donation">Donationer</option>
                  <option value="device_linked">Länkade enheter</option>
                </select>
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {filteredEvents.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">Inga händelser hittades</div>
                ) : (
                  filteredEvents.map((event) => (
                    <div
                      key={event.id}
                      className="rounded border border-slate-700 bg-slate-800/40 p-3 text-sm"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              event.eventType === 'donation' ? 'bg-green-500/20 text-green-200' :
                              event.eventType === 'create_run' ? 'bg-purple-500/20 text-purple-200' :
                              event.eventType === 'join_run' ? 'bg-cyan-500/20 text-cyan-200' :
                              event.eventType === 'page_view' ? 'bg-slate-500/20 text-slate-200' :
                              'bg-amber-500/20 text-amber-200'
                            }`}>
                              {event.eventType}
                            </span>
                            {event.userId && (
                              <span className="text-xs text-gray-400">
                                User: {event.userId.substring(0, 8)}...
                              </span>
                            )}
                          </div>

                          <div className="text-gray-300">
                            Device: <span className="font-mono text-xs">{event.deviceId}</span>
                          </div>

                          {event.metadata?.path && (
                            <div className="text-gray-400">Path: {event.metadata.path}</div>
                          )}

                          {event.metadata?.runId && (
                            <div className="text-gray-400">
                              Run: {event.metadata.runName || event.metadata.runId}
                            </div>
                          )}

                          {event.metadata?.amount && (
                            <div className="text-green-300 font-semibold">
                              Belopp: {formatAmount(event.metadata.amount)}
                            </div>
                          )}
                        </div>

                        <div className="text-xs text-gray-500 text-right">
                          {formatTimestamp(event.timestamp)}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default SuperUserAnalyticsPage;
