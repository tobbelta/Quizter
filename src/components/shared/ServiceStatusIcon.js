/**
 * ServiceStatusBanner - Visar varning när externa tjänster har problem
 */
import React, { useEffect, useState } from 'react';
import { serviceStatusService } from '../../services/serviceStatusService';

const ServiceStatusIcon = () => {
  const [problems, setProblems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => {
    checkStatus();
    // Kolla status var 5:e minut
    const interval = setInterval(checkStatus, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const checkStatus = async () => {
    try {
      const problematicServices = await serviceStatusService.getProblematicServices();
      setProblems(problematicServices);
    } catch (error) {
      console.error('Kunde inte kontrollera tjänstestatus:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading || problems.length === 0) {
    return null;
  }

  const highPriorityProblems = problems.filter(
    (problem) => problem.status === 'down' || problem.status === 'error'
  );
  const hasCriticalIssues = highPriorityProblems.length > 0;

  return (
    <>
      <button
        onClick={() => setIsDialogOpen(true)}
        className={`fixed bottom-4 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full border shadow-lg transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 ${
          hasCriticalIssues
            ? 'bg-red-900/80 border-red-400 text-red-100 focus:ring-red-400'
            : 'bg-amber-900/80 border-amber-400 text-amber-100 focus:ring-amber-400'
        }`}
        aria-label="Visa status för externa tjänster"
      >
        <div className="relative flex items-center justify-center">
          <svg
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <span className="absolute -top-2 -right-2 rounded-full bg-black/70 px-2 py-0.5 text-xs font-semibold text-white">
            {problems.length}
          </span>
        </div>
      </button>

      {isDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-end sm:items-center sm:justify-center">
          <button
            className="absolute inset-0 bg-black/60"
            aria-label="Stäng dialogen"
            onClick={() => setIsDialogOpen(false)}
          />
          <div className="relative m-4 w-full max-w-md overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
            <div
              className={`flex items-center justify-between px-4 py-3 border-b ${
                hasCriticalIssues ? 'border-red-500/40 bg-red-900/20' : 'border-amber-500/40 bg-amber-900/20'
              }`}
            >
              <div className="flex items-center gap-3">
                <svg
                  className={`h-6 w-6 ${hasCriticalIssues ? 'text-red-300' : 'text-amber-300'}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-gray-100">
                    {problems.length} {problems.length === 1 ? 'tjänst påverkas' : 'tjänster påverkas'}
                  </span>
                  <span className="text-xs text-gray-400">
                    {hasCriticalIssues ? 'Kritiska störningar upptäckta' : 'Mindre störningar upptäckta'}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setIsDialogOpen(false)}
                className="rounded-md p-1 text-gray-400 hover:bg-white/10 hover:text-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                aria-label="Stäng"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto px-4 py-4 space-y-3">
              {problems.map((problem, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 rounded-lg border border-white/5 bg-white/5 p-3 text-sm"
                >
                  <div
                    className={`mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full ${
                      problem.status === 'down' || problem.status === 'error' ? 'bg-red-500' : 'bg-amber-500'
                    }`}
                  />
                  <div className="flex-1">
                    <p className="font-semibold text-gray-100">{problem.name}</p>
                    <p className="text-gray-300">{problem.message}</p>
                    {problem.since && (
                      <p className="text-xs text-gray-500 mt-1">Sedan: {new Date(problem.since).toLocaleString('sv-SE')}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between border-t border-slate-700 bg-black/30 px-4 py-3">
              <button
                onClick={() => setIsDialogOpen(false)}
                className="text-sm text-gray-300 hover:text-gray-100 transition-colors"
              >
                Stäng
              </button>
              <button
                onClick={() => {
                  setIsLoading(true);
                  checkStatus();
                }}
                className="text-sm font-semibold text-cyan-400 hover:text-cyan-200 transition-colors"
              >
                Uppdatera status
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ServiceStatusIcon;
