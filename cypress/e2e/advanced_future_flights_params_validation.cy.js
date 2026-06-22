const { getFlightlabsApiKey } = require('../support/api');

describe('Advanced future flights endpoint - validacion de parametros', () => {
  const ENDPOINT = '/advanced-future-flights';

  const genericValidationMessage =
    'Validation failed. Please try again or contact with us hello@goflightlabs.com';

  const futureDate = () => {
    const date = new Date();
    date.setDate(date.getDate() + 15);
    return date.toISOString().slice(0, 10);
  };

  const baseValid = () => ({
    iataCode: 'BER',
    type: 'departure',
    date: futureDate()
  });

  const expectedFlightFields = [
    'sortTime',
    'departureTime',
    'arrivalTime',
    'carrier',
    'operatedBy',
    'airport'
  ];

  const buildQuery = (params, { includeEmpty = false } = {}) => {
    const query = new URLSearchParams({ access_key: getFlightlabsApiKey() });

    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      if (!includeEmpty && value === '') return;
      query.set(key, String(value));
    });

    return `${ENDPOINT}?${query.toString()}`;
  };

  const makeRequest = (params, options = {}) =>
    cy.request({
      method: 'GET',
      url: buildQuery(params, options),
      failOnStatusCode: false,
      timeout: 60000
    });

  const getMessage = (body = {}) => {
    if (typeof body.message === 'string') return body.message;
    if (typeof body.error === 'string') return body.error;
    return '';
  };

  const mergeParams = (overrides = {}) => ({ ...baseValid(), ...overrides });

  const noDataMessage =
    'No data found, please try again or contact with us hello@goflightlabs.com';

  const isValidationError = (response) =>
    response.status === 400 && getMessage(response.body) === genericValidationMessage;

  const assertAcceptedRequest = (response, label) => {
    expect(isValidationError(response), `${label}: no deberia ser error de validacion`).to.eq(false);
    expect(response.status, `${label}: status`).to.be.oneOf([200, 404]);

    if (response.status === 200) {
      expect(response.body.success).to.eq(true);
      expect(response.body.data).to.be.an('array');
      if (response.body.data.length > 0) {
        assertValidFlightItem(response.body.data[0], label);
      }
    }
  };

  const assertValidFlightItem = (flight, label) => {
    expect(flight, `${label}: objeto`).to.be.an('object');

    expectedFlightFields.forEach((field) => {
      expect(flight, `${label}: campo ${field}`).to.have.property(field);
    });

    expect(flight.departureTime).to.have.property('timeAMPM');
    expect(flight.departureTime).to.have.property('time24');
    expect(flight.arrivalTime).to.have.property('timeAMPM');
    expect(flight.arrivalTime).to.have.property('time24');
    expect(flight.carrier).to.have.property('fs');
    expect(flight.carrier).to.have.property('name');
    expect(flight.carrier).to.have.property('flightNumber');
    expect(flight.airport).to.have.property('fs');
    expect(flight.airport).to.have.property('city');
  };

  describe('combinaciones validas (iataCode + type + date futura)', () => {
    const validCases = [
      { name: 'baseline BER departure (doc)', params: () => baseValid() },
      { name: 'BER arrival', params: () => mergeParams({ type: 'arrival' }) },
      { name: 'JFK departure', params: () => mergeParams({ iataCode: 'JFK' }) },
      { name: 'LGA arrival', params: () => mergeParams({ iataCode: 'LGA', type: 'arrival' }) },
      {
        name: 'fecha futura dinamica +20 dias',
        params: () => {
          const date = new Date();
          date.setDate(date.getDate() + 20);
          return mergeParams({ date: date.toISOString().slice(0, 10) });
        }
      },
      { name: 'iataCode minusculas', params: () => mergeParams({ iataCode: 'ber' }) }
    ];

    validCases.forEach((testCase) => {
      it(testCase.name, () => {
        makeRequest(testCase.params()).then((response) => {
          assertAcceptedRequest(response, testCase.name);
        });
      });
    });
  });

  describe('params requeridos: iataCode, type, date', () => {
    const requiredCases = [
      { name: 'sin iataCode', params: { type: 'departure', date: futureDate() }, field: 'iatacode' },
      { name: 'sin type', params: { iataCode: 'BER', date: futureDate() }, field: 'type' },
      { name: 'sin date', params: { iataCode: 'BER', type: 'departure' }, field: 'date' },
      { name: 'iataCode vacio', params: mergeParams({ iataCode: '' }), includeEmpty: true, field: 'iatacode' },
      { name: 'type vacio', params: mergeParams({ type: '' }), includeEmpty: true, field: 'type' },
      { name: 'date vacio', params: mergeParams({ date: '' }), includeEmpty: true, field: 'date' }
    ];

    requiredCases.forEach((testCase) => {
      it(testCase.name, () => {
        makeRequest(testCase.params, { includeEmpty: testCase.includeEmpty }).then((response) => {
          expect(response.status).to.eq(400);
          expect(response.body.success).to.eq(false);
          cy.log(`msg=${getMessage(response.body)}`);
          expect(getMessage(response.body)).to.eq(genericValidationMessage);
        });
      });
    });
  });

  describe('param requerido: iataCode', () => {
    const iataCases = [
      { name: 'iataCode invalido largo', params: mergeParams({ iataCode: 'ZZZZZ' }) },
      { name: 'iataCode 2 chars', params: mergeParams({ iataCode: 'BE' }) },
      { name: 'iataCode numerico', params: mergeParams({ iataCode: '123' }) }
    ];

    iataCases.forEach((testCase) => {
      it(testCase.name, () => {
        makeRequest(testCase.params).then((response) => {
          const msg = getMessage(response.body);
          cy.log(`status=${response.status} msg=${msg}`);
          expect(response.status).to.be.oneOf([400, 404, 422]);
        });
      });
    });
  });

  describe('param requerido: type', () => {
    const typeCases = [
      { name: 'type invalido landed', params: mergeParams({ type: 'landed' }) },
      { name: 'type invalido inbound', params: mergeParams({ type: 'inbound' }) },
      { name: 'type mayusculas DEPARTURE', params: mergeParams({ type: 'DEPARTURE' }) },
      { name: 'type typo departur', params: mergeParams({ type: 'departur' }) },
      { name: 'type valido departure', params: mergeParams({ type: 'departure' }), expectedStatus: 200 },
      { name: 'type valido arrival', params: mergeParams({ type: 'arrival' }), expectedStatus: 200 }
    ];

    typeCases.forEach((testCase) => {
      it(testCase.name, () => {
        makeRequest(testCase.params).then((response) => {
          if (testCase.expectedStatus) {
            assertAcceptedRequest(response, testCase.name);
            return;
          }

          cy.log(
            `comportamiento: type=${testCase.params.type} status=${response.status} body=${JSON.stringify(response.body).slice(0, 120)}`
          );
          expect(isValidationError(response)).to.eq(false);
        });
      });
    });
  });

  describe('param requerido: date (debe ser futura)', () => {
    const dateCases = [
      {
        name: 'fecha en el pasado',
        params: mergeParams({ date: '2020-01-01' }),
        expectedStatus: 400,
        expectedMsg: genericValidationMessage
      },
      {
        name: 'fecha hoy',
        params: mergeParams({ date: '2026-06-02' }),
        expectedStatus: 400,
        expectedMsg: genericValidationMessage
      },
      {
        name: 'fecha ayer',
        params: mergeParams({ date: '2026-06-01' }),
        expectedStatus: 400
      },
      {
        name: 'formato invalido DD-MM-YYYY',
        params: mergeParams({ date: '17-06-2026' }),
        issue: 'formato invalido responde 404 sin mensaje'
      },
      {
        name: 'formato invalido con slash',
        params: mergeParams({ date: '2026/06/17' }),
        issue: 'formato invalido responde 404 sin mensaje'
      },
      {
        name: 'fecha muy futura',
        params: mergeParams({ date: '2035-12-31' }),
        expectedStatus: 400
      },
      {
        name: 'fecha futura valida dinamica',
        params: mergeParams(),
        expectedStatus: 200
      },
      {
        name: 'fecha futura fuera de horizonte',
        params: mergeParams({ date: '2026-12-25' }),
        issue: 'fecha lejana responde validacion generica sin indicar limite'
      }
    ];

    dateCases.forEach((testCase) => {
      it(testCase.name, () => {
        makeRequest(testCase.params).then((response) => {
          if (testCase.expectedStatus === 200) {
            assertAcceptedRequest(response, testCase.name);
            return;
          }

          if (testCase.expectedStatus) {
            expect(response.status).to.eq(testCase.expectedStatus);
            if (testCase.expectedMsg) {
              expect(getMessage(response.body)).to.eq(testCase.expectedMsg);
            }
            return;
          }

          if (testCase.issue) {
            cy.log(`status=${response.status} msg=${getMessage(response.body)}`);
            expect(response.status).to.be.oneOf([400, 404, 422]);
          }
        });
      });
    });
  });

  describe('parametros no documentados', () => {
    it('alias incorrecto iata_code', () => {
      makeRequest({ iata_code: 'BER', type: 'departure', date: futureDate() }).then((response) => {
        expect(response.status).to.eq(400);
        expect(response.body.success).to.eq(false);
      });
    });

    it('parametro desconocido (comportamiento actual)', () => {
      makeRequest(mergeParams({ notAParam: 'x1' })).then((response) => {
        cy.log(`status=${response.status} body=${JSON.stringify(response.body).slice(0, 120)}`);
        assertAcceptedRequest(response, 'notAParam');
      });
    });
  });

  describe('regression: mensajes mejorables detectados', () => {
    const improvableCases = [
      {
        name: 'type invalido indistinguible de request valido',
        params: mergeParams({ type: 'landed' }),
        check: (r) => r.status === 404 && r.body?.data === noDataMessage
      },
      {
        name: 'type typo indistinguible de request valido',
        params: mergeParams({ type: 'departur' }),
        check: (r) => r.status === 404 && r.body?.data === noDataMessage
      },
      {
        name: 'no-data usa data como string',
        params: baseValid(),
        check: (r) => r.status === 404 && typeof r.body?.data === 'string'
      },
      {
        name: 'iataCode invalido mismo mensaje no-data',
        params: mergeParams({ iataCode: 'ZZZZZ' }),
        check: (r) => r.status === 404 && r.body?.data === noDataMessage
      },
      {
        name: 'date formato invalido mismo mensaje no-data',
        params: mergeParams({ date: '17-06-2026' }),
        check: (r) => r.status === 404 && r.body?.data === noDataMessage
      },
      {
        name: 'required faltante mensaje generico',
        params: { type: 'departure', date: '2026-06-17' },
        check: (r) =>
          r.status === 400 &&
          getMessage(r.body) === genericValidationMessage &&
          !getMessage(r.body).toLowerCase().includes('iatacode')
      },
      {
        name: 'fecha pasado mensaje generico',
        params: mergeParams({ date: '2020-01-01' }),
        check: (r) => r.status === 400 && getMessage(r.body) === genericValidationMessage
      },
      {
        name: 'fecha fuera de horizonte mensaje generico',
        params: mergeParams({ date: '2026-12-25' }),
        check: (r) => r.status === 400 && getMessage(r.body) === genericValidationMessage
      }
    ];

    const findings = [];

    improvableCases.forEach((testCase) => {
      it(`detecta: ${testCase.name}`, () => {
        makeRequest(testCase.params).then((response) => {
          if (testCase.check(response)) {
            findings.push({
              case: testCase.name,
              params: { ...testCase.params, access_key: '[REDACTED]' },
              status: response.status,
              message: getMessage(response.body),
              dataLen: Array.isArray(response.body?.data) ? response.body.data.length : null
            });
          }
        });
      });
    });

    after(() => {
      if (findings.length > 0) {
        cy.log('Mensajes mejorables /advanced-future-flights:');
        findings.forEach((f) => {
          cy.log(
            `- ${f.case} | params=${JSON.stringify(f.params)} | status=${f.status} | msg=${f.message} | dataLen=${f.dataLen}`
          );
        });
      }

      expect(
        findings,
        `Se detectaron ${findings.length} casos con mensaje/comportamiento mejorable`
      ).to.have.length(0);
    });
  });
});
