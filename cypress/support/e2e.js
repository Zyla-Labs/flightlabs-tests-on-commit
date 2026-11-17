// 120 requests por minuto: como mucho una cada 500 ms.
const MIN_REQUEST_INTERVAL_MS = 60000 / 120;

let nextRequestAt = 0;

const currentTest = () => {
  const runnable = cy.state('runnable');
  if (!runnable) return null;
  if (runnable.type === 'test') return runnable;
  if (runnable.ctx && runnable.ctx.currentTest) return runnable.ctx.currentTest;
  return null;
};

const formatRequest = (args) => {
  let method = 'GET';
  let url = '';

  if (typeof args[0] === 'string' && typeof args[1] === 'string') {
    method = args[0];
    url = args[1];
  } else if (typeof args[0] === 'string') {
    url = args[0];
  } else if (args[0] && typeof args[0] === 'object') {
    method = args[0].method || 'GET';
    url = args[0].url || '';
  }

  if (url.startsWith('/')) {
    const base = String(Cypress.config('baseUrl') || '').replace(/\/$/, '');
    url = `${base}${url}`;
  }

  return `${String(method).toUpperCase()} ${url}`;
};

const rememberRequest = (args) => {
  const test = currentTest();
  const entry = { line: formatRequest(args) };

  if (test) {
    if (!test._requests) test._requests = [];
    test._requests.push(entry);
  }

  return entry;
};

const trackResponse = (entry, result) =>
  Cypress.Promise.resolve(result).then(
    (response) => {
      if (response && response.status != null) {
        entry.line = `${entry.line} -> ${response.status}`;
      }
      return response;
    },
    (error) => {
      const status = error && (error.status || (error.response && error.response.status));
      if (status) entry.line = `${entry.line} -> ${status}`;
      throw error;
    }
  );

Cypress.Commands.overwrite('request', (originalFn, ...args) => {
  const now = Date.now();
  const startAt = Math.max(now, nextRequestAt);
  nextRequestAt = startAt + MIN_REQUEST_INTERVAL_MS;
  const waitMs = startAt - now;

  const send = () => {
    const entry = rememberRequest(args);
    return trackResponse(entry, originalFn(...args));
  };

  if (waitMs <= 0) {
    return send();
  }

  return Cypress.Promise.delay(waitMs).then(send);
});

afterEach(function () {
  const test = this.currentTest;
  if (!test || test.state !== 'failed' || !test._requests || !test._requests.length) return;

  const maxRetries = Cypress.config('retries') || 0;
  const currentRetry = test._currentRetry || 0;
  if (currentRetry < maxRetries) return;

  cy.task(
    'recordFailedRequests',
    {
      spec: Cypress.spec.relative,
      fullTitle: test.fullTitle(),
      requests: test._requests.map((entry) => entry.line)
    },
    { log: false }
  );
});
