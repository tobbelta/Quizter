/**
 * Hook som automatiskt loggar användarhändelser för bättre felspårning
 */
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { errorLogService } from '../services/errorLogService';

export const useBreadcrumbs = () => {
  const location = useLocation();

  // Logga navigering
  useEffect(() => {
    errorLogService.addBreadcrumb('navigation', `Navigated to ${location.pathname}`, {
      pathname: location.pathname,
      search: location.search,
    });
  }, [location.pathname, location.search]);

  return {
    // Hjälpfunktioner för att logga specifika händelser
    logClick: (elementName, data = {}) => {
      errorLogService.addBreadcrumb('user_action', `Clicked: ${elementName}`, data);
    },
    logFormSubmit: (formName, data = {}) => {
      errorLogService.addBreadcrumb('form', `Submitted form: ${formName}`, data);
    },
    logApiCall: (endpoint, data = {}) => {
      errorLogService.addBreadcrumb('api', `API call: ${endpoint}`, data);
    },
    logStateChange: (description, data = {}) => {
      errorLogService.addBreadcrumb('state', description, data);
    },
  };
};
