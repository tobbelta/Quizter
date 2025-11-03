/**
 * serviceStatusService - Övervakar status på externa tjänster
 */

class ServiceStatusService {
  constructor() {
    this.statusCache = {
      lastCheck: null,
      services: {},
    };
    this.cacheTimeout = 5 * 60 * 1000; // 5 minuter
    this.recentErrors = this.loadRecentErrors();
  }

  /**
   * Laddar senaste felen från localStorage
   */
  loadRecentErrors() {
    try {
      const stored = localStorage.getItem('serviceErrors');
      if (stored) {
        const errors = JSON.parse(stored);
        // Ta bara med fel från senaste 30 minuterna
        const cutoff = Date.now() - 30 * 60 * 1000;
        return errors.filter(e => e.timestamp > cutoff);
      }
    } catch (error) {
      console.error('Kunde inte ladda servicefel:', error);
    }
    return [];
  }

  /**
   * Sparar ett fel från en tjänst
   */
  reportError(serviceName, errorMessage) {
    const error = {
      service: serviceName,
      message: errorMessage,
      timestamp: Date.now(),
    };

    this.recentErrors.push(error);

    // Håll bara senaste 10 felen
    if (this.recentErrors.length > 10) {
      this.recentErrors = this.recentErrors.slice(-10);
    }

    try {
      localStorage.setItem('serviceErrors', JSON.stringify(this.recentErrors));
    } catch (error) {
      console.error('Kunde inte spara servicefel:', error);
    }
  }

  /**
   * Kollar status på alla tjänster
   */
  async checkAllServices() {
    // Om vi har färsk cache, använd den
    if (
      this.statusCache.lastCheck &&
      Date.now() - this.statusCache.lastCheck < this.cacheTimeout
    ) {
      return this.statusCache.services;
    }

    const services = {
  // API kollas inte - om API är nere fungerar inget alls
      stripe: await this.checkStripe(),
      openrouteservice: await this.checkOpenRouteService(),
      anthropic: await this.checkAnthropic(),
    };

    this.statusCache = {
      lastCheck: Date.now(),
      services,
    };

    return services;
  }


  /**
  * Kollar Stripe status via API
   */
  async checkStripe() {
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 5000)
      );

  const checkPromise = fetch('/api/getStripeStatus');

      const response = await Promise.race([checkPromise, timeoutPromise]);
      const data = await response.json();

      if (data.success && data.payoutsEnabled) {
        return { status: 'operational', message: 'Stripe fungerar' };
      } else if (data.success) {
        return {
          status: 'degraded',
          message: 'Stripe fungerar men utbetalningar är avstängda',
        };
      } else {
        return {
          status: 'down',
          message: 'Stripe har problem',
        };
      }
    } catch (error) {
      return {
        status: 'down',
        message: 'Kunde inte kontrollera Stripe',
        error: error.message
      };
    }
  }

  /**
   * Kollar OpenRouteService status
   */
  async checkOpenRouteService() {
    try {
      const apiKey = process.env.REACT_APP_OPENROUTE_API_KEY;
      if (!apiKey) {
        return {
          status: 'error',
          message: 'OpenRouteService API-nyckel saknas'
        };
      }

      // OpenRouteService har ingen Cloud Function endpoint ännu
      // Vi förlitar oss på passiv felrapportering
      return {
        status: 'operational',
        message: 'OpenRouteService konfigurerad'
      };
    } catch (error) {
      return {
        status: 'error',
        message: 'Kunde inte kontrollera OpenRouteService',
        error: error.message
      };
    }
  }

  /**
  * Kollar OpenAI/Anthropic AI status via API
   */
  async checkAnthropic() {
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 5000)
      );

  const checkPromise = fetch('/api/getAIStatus');

      const response = await Promise.race([checkPromise, timeoutPromise]);
      const data = await response.json();

      if (data.available) {
        // Kolla om någon provider har problem
        const providers = data.providers || {};
        const hasIssues = Object.entries(providers).some(([name, p]) =>
          p.configured && !p.available
        );

        if (hasIssues) {
          const unavailable = Object.entries(providers)
            .filter(([_, p]) => p.configured && !p.available)
            .map(([name]) => name);

          return {
            status: 'degraded',
            message: `AI fungerar (${data.primaryProvider}) men ${unavailable.join(', ')} är nere`,
          };
        }

        return {
          status: 'operational',
          message: `AI-tjänster fungerar (${data.primaryProvider})`
        };
      } else {
        return {
          status: 'down',
          message: data.message || 'AI-tjänster är nere',
        };
      }
    } catch (error) {
      return {
        status: 'down',
        message: 'Kunde inte kontrollera AI-tjänster',
        error: error.message
      };
    }
  }

  /**
   * Hämtar endast tjänster som har problem
   */
  async getProblematicServices() {
    const services = await this.checkAllServices();
    const problems = [];

    Object.entries(services).forEach(([name, service]) => {
      if (service.status === 'down' || service.status === 'degraded' || service.status === 'error') {
        problems.push({
          name: this.getServiceDisplayName(name),
          ...service,
        });
      }
    });

    // Lägg till tjänster med senaste fel
    const cutoff = Date.now() - 10 * 60 * 1000; // 10 minuter
    const recentErrors = this.loadRecentErrors().filter(e => e.timestamp > cutoff);

    // Gruppera fel per tjänst
    const errorsByService = {};
    recentErrors.forEach(error => {
      if (!errorsByService[error.service]) {
        errorsByService[error.service] = [];
      }
      errorsByService[error.service].push(error);
    });

    // Lägg till tjänster med upprepade fel
    Object.entries(errorsByService).forEach(([service, errors]) => {
      if (errors.length >= 2 && !problems.find(p => p.name.includes(service))) {
        problems.push({
          name: this.getServiceDisplayName(service),
          status: 'degraded',
          message: `${errors.length} fel senaste 10 minuterna`,
        });
      }
    });

    return problems;
  }

  /**
   * Returnerar läsbart namn för tjänsten
   */
  getServiceDisplayName(serviceName) {
    const names = {
      stripe: 'Stripe (betalningar)',
      openrouteservice: 'OpenRouteService (kartor)',
      anthropic: 'AI-tjänster (frågegenerering)',
      OpenRouteService: 'OpenRouteService (kartor)',
    };
    return names[serviceName] || serviceName;
  }

  /**
   * Tvingar en ny kontroll (ignorerar cache)
   */
  async forceCheck() {
    this.statusCache.lastCheck = null;
    return this.checkAllServices();
  }
}

export const serviceStatusService = new ServiceStatusService();
