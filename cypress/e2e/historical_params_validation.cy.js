const { getFlightlabsApiKey } = require('../support/api');

describe('Historical endpoint - validacion de parametros', () => {
  const ENDPOINT = '/historical';

  const baseValid = {
    code: 'LGA',
    type: 'departure',
    date_from: '2026-06-02T08:00',
    date_to: '2026-06-02T20:00'
  };

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
    if (body.error && typeof body.error.message === 'string') return body.error.message;
    return '';
  };

  const assertValidFlightItem = (flight, label) => {
    expect(flight, `${label}: objeto`).to.be.an('object');
    expect(flight).to.have.property('number');
    expect(flight).to.have.property('status');
    expect(flight).to.have.property('movement');
    expect(flight.movement).to.have.property('airport');
    expect(flight.movement.airport).to.have.property('name');
    expect(flight.movement).to.have.property('scheduledTime');
    expect(flight.movement.scheduledTime).to.have.property('utc');
    expect(flight.movement.scheduledTime).to.have.property('local');
    expect(flight).to.have.property('airline');
    expect(flight.airline).to.have.property('iata');
    expect(flight.airline).to.have.property('icao');
  };

  const mergeParams = (overrides = {}) => ({ ...baseValid, ...overrides });

  describe('combinaciones validas (requeridos + opcionales)', () => {
    const validCases = [
      { name: 'baseline departure LGA', params: baseValid },
      { name: 'type arrival', params: mergeParams({ type: 'arrival' }) },
      { name: 'aeropuerto JFK departure', params: mergeParams({ code: 'JFK' }) },
      { name: 'aeropuerto JFK arrival', params: mergeParams({ code: 'JFK', type: 'arrival' }) },
      { name: 'rango corto 2h', params: mergeParams({ date_from: '2026-06-02T10:00', date_to: '2026-06-02T12:00' }) },
      { name: 'date opcional override', params: mergeParams({ date: '2026-06-02' }) },
      {
        name: 'solo date sin date_from/date_to',
        params: { code: 'LGA', type: 'departure', date: '2026-06-02' },
        timeout: 120000
      },
      {
        name: 'departure + arr_iataCode',
        params: mergeParams({ arr_iataCode: 'MIA' }),
        timeout: 120000
      },
      {
        name: 'arrival + dep_iataCode',
        params: mergeParams({ type: 'arrival', dep_iataCode: 'MIA' })
      },
      { name: 'airline_iata DL', params: mergeParams({ airline_iata: 'DL' }) },
      { name: 'airline_iata AA', params: mergeParams({ airline_iata: 'AA' }) },
      {
        name: 'compuesto airline + arr',
        params: mergeParams({ airline_iata: 'DL', arr_iataCode: 'ATL' })
      },
      {
        name: 'compuesto arrival dep + airline',
        params: mergeParams({ type: 'arrival', dep_iataCode: 'MIA', airline_iata: 'AA' })
      }
    ];

    validCases.forEach((testCase) => {
      it(testCase.name, () => {
        const req = testCase.timeout
          ? { method: 'GET', url: buildQuery(testCase.params), failOnStatusCode: false, timeout: testCase.timeout }
          : null;

        (req ? cy.request(req) : makeRequest(testCase.params)).then((response) => {
          expect(response.status, 'status').to.eq(200);
          expect(response.body).to.be.an('object');
          expect(response.body.success).to.eq(true);
          expect(response.body.data).to.be.an('array');

          if (response.body.data.length > 0) {
            assertValidFlightItem(response.body.data[0], testCase.name);
          }
        });
      });
    });
  });

  describe('params requeridos faltantes o vacios', () => {
    const requiredCases = [
      { name: 'sin code', params: { type: 'departure', date_from: baseValid.date_from, date_to: baseValid.date_to }, expectedStatus: 422, expectedMsg: 'code' },
      { name: 'code vacio', params: mergeParams({ code: '' }), includeEmpty: true, expectedStatus: 422, expectedMsg: 'code' },
      { name: 'sin type', params: { code: 'LGA', date_from: baseValid.date_from, date_to: baseValid.date_to }, expectedStatus: 422, expectedMsg: 'type' },
      { name: 'type vacio', params: mergeParams({ type: '' }), includeEmpty: true, expectedStatus: 422, expectedMsg: 'type' },
      { name: 'sin date_from', params: { code: 'LGA', type: 'departure', date_to: baseValid.date_to }, expectedStatus: 422, expectedMsg: 'date from' },
      { name: 'sin date_to', params: { code: 'LGA', type: 'departure', date_from: baseValid.date_from }, expectedStatus: 422, expectedMsg: 'date to' },
      { name: 'sin date ni rango', params: { code: 'LGA', type: 'departure' }, expectedStatus: 422, expectedMsg: 'date' }
    ];

    requiredCases.forEach((testCase) => {
      it(testCase.name, () => {
        makeRequest(testCase.params, { includeEmpty: testCase.includeEmpty }).then((response) => {
          expect(response.status).to.eq(testCase.expectedStatus);
          expect(getMessage(response.body).toLowerCase()).to.include(testCase.expectedMsg);
        });
      });
    });
  });

  describe('param requerido: code', () => {
    const codeCases = [
      { name: 'code invalido largo', params: mergeParams({ code: 'ZZZZZ' }), issue: 'formato invalido responde No data found' },
      { name: 'code numerico', params: mergeParams({ code: '123' }), issue: 'formato invalido responde No data found' },
      { name: 'code 2 chars', params: mergeParams({ code: 'LG' }), issue: 'formato invalido responde No data found' },
      { name: 'code minusculas', params: mergeParams({ code: 'lga' }), issue: 'case sensitivity ambigua' }
    ];

    codeCases.forEach((testCase) => {
      it(testCase.name, () => {
        makeRequest(testCase.params).then((response) => {
          const msg = getMessage(response.body);
          cy.log(`status=${response.status} msg=${msg} | issue=${testCase.issue}`);
          expect(response.status).to.be.oneOf([200, 404, 422]);
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
            expect(response.status).to.eq(testCase.expectedStatus);
            return;
          }

          cy.log(
            `BUG conocido: type invalido devuelve status=${response.status} dataLen=${response.body?.data?.length}`
          );
          expect(response.status).to.eq(200);
        });
      });
    });
  });

  describe('params requeridos: date_from, date_to y date opcional', () => {
    const dateCases = [
      {
        name: 'date_from formato invalido',
        params: mergeParams({ date_from: '02-06-2026T08:00' }),
        expectedStatus: 422,
        expectedMsg: 'date_from'
      },
      {
        name: 'date_to formato invalido',
        params: mergeParams({ date_to: '2026/06/02 20:00' }),
        issue: 'formato invalido responde 404 No data found'
      },
      {
        name: 'date_from sin hora',
        params: mergeParams({ date_from: '2026-06-02' }),
        expectedStatus: 422,
        expectedMsg: 'date_from'
      },
      {
        name: 'date opcional formato invalido',
        params: mergeParams({ date: '99-99-9999' }),
        expectedStatus: 422,
        expectedMsg: 'date'
      },
      {
        name: 'date opcional valido',
        params: { code: 'LGA', type: 'departure', date: '2026-06-02' },
        expectedStatus: 200
      },
      {
        name: 'date_from mayor que date_to',
        params: mergeParams({ date_from: '2026-06-02T20:00', date_to: '2026-06-02T08:00' }),
        issue: 'rango invertido deberia devolver error de validacion'
      },
      {
        name: 'fecha futura lejana',
        params: mergeParams({ date_from: '2030-01-01T00:00', date_to: '2030-01-01T23:59' }),
        issue: 'sin datos deberia mensaje no-results, no error generico'
      }
    ];

    dateCases.forEach((testCase) => {
      it(testCase.name, () => {
        makeRequest(testCase.params).then((response) => {
          if (testCase.expectedStatus) {
            expect(response.status).to.eq(testCase.expectedStatus);
            if (testCase.expectedMsg) {
              expect(getMessage(response.body).toLowerCase()).to.include(testCase.expectedMsg);
            }
            return;
          }

          if (testCase.issue?.includes('formato invalido')) {
            cy.log(`status=${response.status} msg=${getMessage(response.body)}`);
            expect(response.status).to.be.oneOf([404, 422]);
            return;
          }

          if (testCase.issue?.includes('rango invertido')) {
            cy.log(`rango invertido: status=${response.status} dataLen=${response.body?.data?.length}`);
            expect(response.status).to.be.oneOf([200, 400, 422]);
          }
        });
      });
    });
  });

  describe('params opcionales: dep_iataCode, arr_iataCode, airline_iata, flight_num', () => {
    const optionalCases = [
      {
        name: 'departure + arr_iataCode valido',
        params: mergeParams({ arr_iataCode: 'MIA' }),
        allowNotFound: true
      },
      {
        name: 'arrival + dep_iataCode valido',
        params: mergeParams({ type: 'arrival', dep_iataCode: 'MIA' }),
        allowNotFound: true
      },
      {
        name: 'airline_iata valido',
        params: mergeParams({ airline_iata: 'DL' }),
        expectedStatus: 200
      },
      {
        name: 'flight_num sin resultados',
        params: mergeParams({ flight_num: '5703' }),
        allowNotFound: true
      },
      {
        name: 'airline_iata invalido largo',
        params: mergeParams({ airline_iata: 'ZZZZZ' }),
        issue: 'formato invalido responde No data found'
      },
      {
        name: 'airline_iata 1 char',
        params: mergeParams({ airline_iata: 'D' }),
        issue: 'formato invalido responde No data found'
      },
      {
        name: 'arr_iataCode invalido',
        params: mergeParams({ arr_iataCode: 'ZZZZ' }),
        issue: 'formato invalido responde No data found'
      },
      {
        name: 'dep_iataCode invalido en arrival',
        params: mergeParams({ type: 'arrival', dep_iataCode: 'ZZZZ' }),
        issue: 'formato invalido responde No data found'
      },
      {
        name: 'flight_num no numerico',
        params: mergeParams({ flight_num: 'ABC' }),
        issue: 'formato invalido deberia validarse antes de buscar'
      }
    ];

    optionalCases.forEach((testCase) => {
      it(testCase.name, () => {
        makeRequest(testCase.params).then((response) => {
          if (testCase.expectedStatus) {
            expect(response.status).to.eq(testCase.expectedStatus);
            return;
          }

          if (testCase.allowNotFound) {
            expect(response.status).to.be.oneOf([200, 404]);
            return;
          }

          if (testCase.issue) {
            cy.log(`status=${response.status} msg=${getMessage(response.body)} | ${testCase.issue}`);
            expect(response.status).to.be.oneOf([200, 404, 422]);
          }
        });
      });
    });
  });

  describe('coherencia type vs filtros opcionales', () => {
    const coherenceCases = [
      {
        name: 'arrival con arr_iataCode (deberia usar dep_iataCode)',
        params: mergeParams({ type: 'arrival', arr_iataCode: 'LAX' }),
        expectedMsg: 'dep_iataCode'
      },
      {
        name: 'departure con dep_iataCode (deberia usar arr_iataCode)',
        params: mergeParams({ type: 'departure', dep_iataCode: 'JFK' }),
        expectedMsg: 'arr_iataCode'
      }
    ];

    coherenceCases.forEach((testCase) => {
      it(testCase.name, () => {
        makeRequest(testCase.params).then((response) => {
          expect(response.status).to.eq(404);
          expect(getMessage(response.body).toLowerCase()).to.include(
            testCase.expectedMsg.toLowerCase()
          );
        });
      });
    });
  });

  describe('parametros no documentados', () => {
    it('parametro desconocido (comportamiento actual)', () => {
      makeRequest(mergeParams({ notAParam: 'x1' })).then((response) => {
        cy.log(`notAParam: status=${response.status} dataLen=${response.body?.data?.length}`);
        expect(response.status).to.eq(200);
      });
    });

    it('alias incorrecto dateFrom (comportamiento actual)', () => {
      makeRequest(mergeParams({ dateFrom: '2026-06-02T08:00' })).then((response) => {
        cy.log(`dateFrom: status=${response.status} dataLen=${response.body?.data?.length}`);
        expect(response.status).to.eq(200);
      });
    });
  });

  describe('regression: mensajes mejorables detectados', () => {
    const improvableCases = [
      {
        name: 'type invalido devuelve 200',
        params: mergeParams({ type: 'landed' }),
        check: (r) => r.status === 200 && r.body?.success === true
      },
      {
        name: 'param desconocido ignorado',
        params: mergeParams({ notAParam: 'x1' }),
        check: (r) => r.status === 200 && Array.isArray(r.body?.data) && r.body.data.length > 100
      },
      {
        name: 'code invalido como not-found',
        params: mergeParams({ code: 'ZZZZZ' }),
        check: (r) => r.status === 404 && getMessage(r.body) === 'No data found'
      },
      {
        name: 'airline_iata invalido como not-found',
        params: mergeParams({ airline_iata: 'ZZZZZ' }),
        check: (r) => r.status === 404 && getMessage(r.body) === 'No data found'
      },
      {
        name: 'rango invertido aceptado',
        params: mergeParams({ date_from: '2026-06-02T20:00', date_to: '2026-06-02T08:00' }),
        check: (r) => r.status === 200
      },
      {
        name: 'date_to formato invalido como not-found',
        params: mergeParams({ date_to: '2026/06/02 20:00' }),
        check: (r) => r.status === 404 && getMessage(r.body) === 'No data found'
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
        cy.log('Mensajes mejorables /historical:');
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
