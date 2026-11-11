// 120 requests por minuto: como mucho una cada 500 ms.
const MIN_REQUEST_INTERVAL_MS = 60000 / 120;

let nextRequestAt = 0;

Cypress.Commands.overwrite('request', (originalFn, ...args) => {
  const now = Date.now();
  const startAt = Math.max(now, nextRequestAt);
  nextRequestAt = startAt + MIN_REQUEST_INTERVAL_MS;
  const waitMs = startAt - now;
  const send = () => originalFn(...args);

  if (waitMs <= 0) {
    return send();
  }

  return Cypress.Promise.delay(waitMs).then(send);
});
