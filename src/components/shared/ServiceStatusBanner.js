/**
 * ServiceStatusBanner - Visar varning när externa tjänster har problem
 */
import React, { useEffect, useState } from 'react';
import { serviceStatusService } from '../../services/serviceStatusService';

const ServiceStatusBanner = () => {
  const [problems, setProblems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);

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

  const highPriorityProblems = problems.filter(p => p.status === 'down' || p.status === 'error');
  const hasCriticalIssues = highPriorityProblems.length > 0;

  return (
    <div
      className={`border-b ${
        hasCriticalIssues
          ? 'bg-red-900/20 border-red-500/40'
          : 'bg-amber-900/20 border-amber-500/40'
      }`}
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-2 flex items-center justify-between hover:bg-black/10 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg
            className={`w-5 h-5 ${hasCriticalIssues ? 'text-red-400' : 'text-amber-400'}`}
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
          <span
            className={`text-sm font-semibold ${
              hasCriticalIssues ? 'text-red-200' : 'text-amber-200'
            }`}
          >
            {problems.length} {problems.length === 1 ? 'tjänst' : 'tjänster'} har problem
          </span>
        </div>
        <svg
          className={`w-4 h-4 transition-transform ${
            isExpanded ? 'rotate-180' : ''
          } ${hasCriticalIssues ? 'text-red-400' : 'text-amber-400'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="px-4 pb-3 space-y-2">
          {problems.map((problem, index) => (
            <div
              key={index}
              className="flex items-start gap-2 text-sm rounded-lg bg-black/20 p-2"
            >
              <div
                className={`flex-shrink-0 w-2 h-2 rounded-full mt-1.5 ${
                  problem.status === 'down' || problem.status === 'error'
                    ? 'bg-red-500'
                    : 'bg-amber-500'
                }`}
              />
              <div className="flex-1">
                <span className="font-semibold text-gray-200">{problem.name}</span>
                <span className="text-gray-400"> - {problem.message}</span>
              </div>
            </div>
          ))}
          <button
            onClick={() => {
              setIsLoading(true);
              checkStatus();
            }}
            className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            Uppdatera status
          </button>
        </div>
      )}
    </div>
  );
};

export default ServiceStatusBanner;
