/**
 * SuperUser-sida för att visa besöksstatistik och analytics
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { analyticsService } from '../services/analyticsService';
import { messageService } from '../services/messageService';
import Header from '../components/layout/Header';
import MessageDialog from '../components/shared/MessageDialog';

const SuperUserAnalyticsPage = () => {
  const navigate = useNavigate();
  const { isSuperUser, currentUser } = useAuth();
  const [stats, setStats] = useState(null);
  const [recentEvents, setRecentEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [eventFilter, setEventFilter] = useState('all');
  const [timeFilter, setTimeFilter] = useState('all'); // 'all', 'today', 'week', 'month'
  const [deviceTypeFilter, setDeviceTypeFilter] = useState('all');
  const [osFilter, setOsFilter] = useState('all');
  const [browserFilter, setBrowserFilter] = useState('all');
  const [showDeviceList, setShowDeviceList] = useState(false);
  const [selectedDevices, setSelectedDevices] = useState(new Set());
  const [showMessageDialog, setShowMessageDialog] = useState(false);
  const [messageTitle, setMessageTitle] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [dialogConfig, setDialogConfig] = useState({ isOpen: false, title: '', message: '', type: 'info' });

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

  // Filtrera events baserat på typ och tid
  const filteredEvents = recentEvents.filter(event => {
    // Filtrera på eventType
    if (eventFilter !== 'all' && event.eventType !== eventFilter) {
      return false;
    }

    // Filtrera på enhetstyp
    if (deviceTypeFilter !== 'all' && event.deviceType !== deviceTypeFilter) {
      return false;
    }

    // Filtrera på OS
    if (osFilter !== 'all' && event.os !== osFilter) {
      return false;
    }

    // Filtrera på webbläsare
    if (browserFilter !== 'all' && event.browser !== browserFilter) {
      return false;
    }

    // Filtrera på tid
    if (timeFilter !== 'all' && event.timestamp?.toDate) {
      const eventDate = event.timestamp.toDate();
      const now = new Date();
      const dayInMs = 24 * 60 * 60 * 1000;

      switch (timeFilter) {
        case 'today':
          const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          if (eventDate < startOfToday) return false;
          break;
        case 'week':
          const weekAgo = new Date(now.getTime() - 7 * dayInMs);
          if (eventDate < weekAgo) return false;
          break;
        case 'month':
          const monthAgo = new Date(now.getTime() - 30 * dayInMs);
          if (eventDate < monthAgo) return false;
          break;
        default:
          break;
      }
    }

    return true;
  });

  const formatTimestamp = (timestamp) => {
    if (!timestamp?.toDate) return 'N/A';
    return new Date(timestamp.toDate()).toLocaleString('sv-SE');
  };

  const formatAmount = (amount) => {
    return (amount / 100).toFixed(2) + ' kr';
  };

  // Samla unika värden för filter-dropdowns
  const uniqueDeviceTypes = [...new Set(recentEvents.map(e => e.deviceType).filter(Boolean))];
  const uniqueOSes = [...new Set(recentEvents.map(e => e.os).filter(Boolean))];
  const uniqueBrowsers = [...new Set(recentEvents.map(e => e.browser).filter(Boolean))];

  // Samla unika enheter med deras senaste info
  const uniqueDevicesMap = recentEvents.reduce((acc, event) => {
    if (!acc[event.deviceId] || event.timestamp?.toDate() > acc[event.deviceId].timestamp?.toDate()) {
      acc[event.deviceId] = {
        deviceId: event.deviceId,
        deviceType: event.deviceType,
        os: event.os,
        browser: event.browser,
        userId: event.userId,
        lastSeen: event.timestamp,
        eventCount: 1
      };
    } else {
      acc[event.deviceId].eventCount++;
    }
    return acc;
  }, {});

  const uniqueDevicesList = Object.values(uniqueDevicesMap);

  // Hantera enhetsval
  const toggleDeviceSelection = (deviceId) => {
    const newSelected = new Set(selectedDevices);
    if (newSelected.has(deviceId)) {
      newSelected.delete(deviceId);
    } else {
      newSelected.add(deviceId);
    }
    setSelectedDevices(newSelected);
  };

  const selectAllDevices = () => {
    setSelectedDevices(new Set(uniqueDevicesList.map(d => d.deviceId)));
  };

  const deselectAllDevices = () => {
    setSelectedDevices(new Set());
  };

  // Skicka meddelande till valda enheter
  const handleSendMessage = async () => {
    if (!messageTitle.trim() || !messageBody.trim()) {
      setDialogConfig({
        isOpen: true,
        title: 'Ogiltigt meddelande',
        message: 'Titel och meddelande får inte vara tomma',
        type: 'warning'
      });
      return;
    }

    if (selectedDevices.size === 0) {
      setDialogConfig({
        isOpen: true,
        title: 'Ingen markering',
        message: 'Välj minst en enhet att skicka till',
        type: 'warning'
      });
      return;
    }

    setIsSendingMessage(true);

    try {
      const promises = Array.from(selectedDevices).map(deviceId => {
        const device = uniqueDevicesList.find(d => d.deviceId === deviceId);
        return messageService.sendMessage({
          title: messageTitle,
          message: messageBody,
          userId: device?.userId || null,
          deviceId: deviceId,
          adminId: currentUser?.uid || null,
          type: 'system',
          metadata: {
            sentFrom: 'analytics_page',
            sentBy: 'superuser'
          }
        });
      });

      await Promise.all(promises);
      setDialogConfig({
        isOpen: true,
        title: 'Meddelande skickat',
        message: `Meddelande skickat till ${selectedDevices.size} enheter`,
        type: 'success'
      });
      setShowMessageDialog(false);
      setMessageTitle('');
      setMessageBody('');
      setSelectedDevices(new Set());
    } catch (error) {
      console.error('Kunde inte skicka meddelande:', error);
      setDialogConfig({
        isOpen: true,
        title: 'Kunde inte skicka meddelande',
        message: 'Kunde inte skicka meddelande. Se konsolen för detaljer.',
        type: 'error'
      });
    } finally {
      setIsSendingMessage(false);
    }
  };

  // Beräkna filtrerad statistik
  const filteredStats = {
    totalEvents: filteredEvents.length,
    uniqueDevices: new Set(filteredEvents.map(e => e.deviceId)).size,
    uniqueUsers: new Set(filteredEvents.filter(e => e.userId).map(e => e.userId)).size,
    eventsByType: filteredEvents.reduce((acc, e) => {
      acc[e.eventType] = (acc[e.eventType] || 0) + 1;
      return acc;
    }, {}),
    donations: {
      count: filteredEvents.filter(e => e.eventType === 'donation').length,
      total: filteredEvents
        .filter(e => e.eventType === 'donation' && e.metadata?.amount)
        .reduce((sum, e) => sum + e.metadata.amount, 0)
    }
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
            {/* Filter-kontroller */}
            <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-cyan-200 mb-2">Tidsperiod</label>
                  <select
                    value={timeFilter}
                    onChange={(e) => setTimeFilter(e.target.value)}
                    className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2 text-gray-200"
                  >
                    <option value="all">All tid</option>
                    <option value="today">Idag</option>
                    <option value="week">Senaste 7 dagarna</option>
                    <option value="month">Senaste 30 dagarna</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-cyan-200 mb-2">Händelsetyp</label>
                  <select
                    value={eventFilter}
                    onChange={(e) => setEventFilter(e.target.value)}
                    className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2 text-gray-200"
                  >
                    <option value="all">Alla händelser</option>
                    <option value="page_view">Sidvisningar</option>
                    <option value="create_run">Skapade rundor</option>
                    <option value="join_run">Anslutningar</option>
                    <option value="donation">Donationer</option>
                    <option value="device_linked">Länkade enheter</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-cyan-200 mb-2">Enhetstyp</label>
                  <select
                    value={deviceTypeFilter}
                    onChange={(e) => setDeviceTypeFilter(e.target.value)}
                    className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2 text-gray-200"
                  >
                    <option value="all">Alla enhetstyper</option>
                    {uniqueDeviceTypes.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-cyan-200 mb-2">Operativsystem</label>
                  <select
                    value={osFilter}
                    onChange={(e) => setOsFilter(e.target.value)}
                    className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2 text-gray-200"
                  >
                    <option value="all">Alla OS</option>
                    {uniqueOSes.map(os => (
                      <option key={os} value={os}>{os}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-cyan-200 mb-2">Webbläsare</label>
                  <select
                    value={browserFilter}
                    onChange={(e) => setBrowserFilter(e.target.value)}
                    className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2 text-gray-200"
                  >
                    <option value="all">Alla webbläsare</option>
                    {uniqueBrowsers.map(browser => (
                      <option key={browser} value={browser}>{browser}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    onClick={() => setShowDeviceList(!showDeviceList)}
                    className="w-full px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-black rounded-lg font-semibold transition-colors"
                  >
                    {showDeviceList ? 'Dölj enhetslista' : 'Visa unika enheter'}
                  </button>
                </div>
              </div>
            </div>

            {/* Översiktskort - Total statistik */}
            <div>
              <h2 className="text-lg font-semibold text-gray-300 mb-3">📊 Total statistik (all tid)</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-lg border border-purple-500/40 bg-purple-900/20 p-6">
                  <h3 className="text-sm font-semibold text-purple-200 mb-2">Totala händelser</h3>
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
            </div>

            {/* Filtrerad statistik */}
            {(timeFilter !== 'all' || eventFilter !== 'all') && (
              <div>
                <h2 className="text-lg font-semibold text-gray-300 mb-3">
                  🔍 Filtrerad statistik
                  <span className="text-sm font-normal text-gray-400 ml-2">
                    ({timeFilter === 'today' ? 'Idag' : timeFilter === 'week' ? 'Senaste 7 dagarna' : timeFilter === 'month' ? 'Senaste 30 dagarna' : 'All tid'}
                    {eventFilter !== 'all' && ` • ${eventFilter}`})
                  </span>
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="rounded-lg border border-purple-500/40 bg-purple-900/20 p-6">
                    <h3 className="text-sm font-semibold text-purple-200 mb-2">Händelser</h3>
                    <p className="text-3xl font-bold text-purple-100">{filteredStats.totalEvents}</p>
                  </div>

                  <div className="rounded-lg border border-cyan-500/40 bg-cyan-900/20 p-6">
                    <h3 className="text-sm font-semibold text-cyan-200 mb-2">Unika enheter</h3>
                    <p className="text-3xl font-bold text-cyan-100">{filteredStats.uniqueDevices}</p>
                    <p className="text-xs text-cyan-300 mt-1">
                      {filteredStats.uniqueUsers} användare
                    </p>
                  </div>

                  <div className="rounded-lg border border-green-500/40 bg-green-900/20 p-6">
                    <h3 className="text-sm font-semibold text-green-200 mb-2">Donationer</h3>
                    <p className="text-3xl font-bold text-green-100">{filteredStats.donations.count}</p>
                    <p className="text-sm text-green-300 mt-1">
                      {formatAmount(filteredStats.donations.total)}
                    </p>
                  </div>

                  <div className="rounded-lg border border-amber-500/40 bg-amber-900/20 p-6">
                    <h3 className="text-sm font-semibold text-amber-200 mb-2">Skapade rundor</h3>
                    <p className="text-3xl font-bold text-amber-100">
                      {filteredStats.eventsByType.create_run || 0}
                    </p>
                  </div>
                </div>
              </div>
            )}

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

            {/* Unika enheter lista */}
            {showDeviceList && (
              <div className="rounded-lg border border-cyan-500/40 bg-cyan-900/10 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-gray-200">
                    📱 Unika enheter ({uniqueDevicesList.length})
                  </h2>
                  <div className="flex gap-2">
                    {selectedDevices.size > 0 && (
                      <>
                        <button
                          onClick={() => setShowMessageDialog(true)}
                          className="px-4 py-2 bg-green-500 hover:bg-green-400 text-black rounded-lg font-semibold transition-colors"
                        >
                          Skicka meddelande ({selectedDevices.size})
                        </button>
                        <button
                          onClick={deselectAllDevices}
                          className="px-4 py-2 bg-red-500 hover:bg-red-400 text-white rounded-lg font-semibold transition-colors"
                        >
                          Avmarkera alla
                        </button>
                      </>
                    )}
                    <button
                      onClick={selectedDevices.size === uniqueDevicesList.length ? deselectAllDevices : selectAllDevices}
                      className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-gray-200 rounded-lg font-semibold transition-colors"
                    >
                      {selectedDevices.size === uniqueDevicesList.length ? 'Avmarkera alla' : 'Markera alla'}
                    </button>
                  </div>
                </div>

                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {uniqueDevicesList.map((device) => (
                    <div
                      key={device.deviceId}
                      onClick={() => toggleDeviceSelection(device.deviceId)}
                      className={`rounded border p-4 cursor-pointer transition-all ${
                        selectedDevices.has(device.deviceId)
                          ? 'border-cyan-500 bg-cyan-900/30 ring-2 ring-cyan-500/50'
                          : 'border-slate-700 bg-slate-800/40 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <input
                              type="checkbox"
                              checked={selectedDevices.has(device.deviceId)}
                              onChange={() => toggleDeviceSelection(device.deviceId)}
                              className="w-4 h-4"
                              onClick={(e) => e.stopPropagation()}
                            />
                            <span className="font-mono text-sm text-gray-300">{device.deviceId}</span>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                            {device.deviceType && (
                              <div className="flex items-center gap-1">
                                <span className="text-gray-400">Typ:</span>
                                <span className="text-cyan-200">{device.deviceType}</span>
                              </div>
                            )}
                            {device.os && (
                              <div className="flex items-center gap-1">
                                <span className="text-gray-400">OS:</span>
                                <span className="text-cyan-200">{device.os}</span>
                              </div>
                            )}
                            {device.browser && (
                              <div className="flex items-center gap-1">
                                <span className="text-gray-400">Webbläsare:</span>
                                <span className="text-cyan-200">{device.browser}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-1">
                              <span className="text-gray-400">Händelser:</span>
                              <span className="text-cyan-200">{device.eventCount}</span>
                            </div>
                          </div>

                          {device.userId && (
                            <div className="mt-2 text-xs text-gray-400">
                              Användare: {device.userId.substring(0, 12)}...
                            </div>
                          )}

                          <div className="mt-1 text-xs text-gray-500">
                            Senast sedd: {formatTimestamp(device.lastSeen)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Meddelandedialog */}
            {showMessageDialog && (
              <>
                <div
                  className="fixed inset-0 bg-black/60 z-40"
                  onClick={() => setShowMessageDialog(false)}
                />
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                  <div className="bg-slate-900 rounded-lg border border-slate-700 p-6 max-w-lg w-full">
                    <h3 className="text-xl font-bold text-gray-200 mb-4">
                      Skicka meddelande till {selectedDevices.size} enheter
                    </h3>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-300 mb-2">
                          Titel
                        </label>
                        <input
                          type="text"
                          value={messageTitle}
                          onChange={(e) => setMessageTitle(e.target.value)}
                          className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2 text-gray-200"
                          placeholder="Meddelandetitel..."
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-300 mb-2">
                          Meddelande
                        </label>
                        <textarea
                          value={messageBody}
                          onChange={(e) => setMessageBody(e.target.value)}
                          className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2 text-gray-200 min-h-32"
                          placeholder="Skriv ditt meddelande här..."
                        />
                      </div>

                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => setShowMessageDialog(false)}
                          disabled={isSendingMessage}
                          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-gray-200 rounded-lg font-semibold transition-colors disabled:opacity-50"
                        >
                          Avbryt
                        </button>
                        <button
                          onClick={handleSendMessage}
                          disabled={isSendingMessage}
                          className="px-4 py-2 bg-green-500 hover:bg-green-400 text-black rounded-lg font-semibold transition-colors disabled:opacity-50"
                        >
                          {isSendingMessage ? 'Skickar...' : 'Skicka'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Senaste händelser */}
            <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-200">
                  Senaste händelser
                  <span className="text-sm font-normal text-gray-400 ml-2">
                    ({filteredEvents.length} av {recentEvents.length})
                  </span>
                </h2>
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

                          {(event.deviceType || event.os || event.browser) && (
                            <div className="flex gap-3 text-xs mt-1">
                              {event.deviceType && (
                                <span className="text-cyan-300">{event.deviceType}</span>
                              )}
                              {event.os && (
                                <span className="text-cyan-300">{event.os}</span>
                              )}
                              {event.browser && (
                                <span className="text-cyan-300">{event.browser}</span>
                              )}
                            </div>
                          )}

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

      <MessageDialog
        isOpen={dialogConfig.isOpen}
        onClose={() => setDialogConfig({ ...dialogConfig, isOpen: false })}
        title={dialogConfig.title}
        message={dialogConfig.message}
        type={dialogConfig.type}
      />
    </div>
  );
};

export default SuperUserAnalyticsPage;
