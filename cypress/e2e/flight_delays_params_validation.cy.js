const { getFlightlabsApiKey } = require('../support/api');

describe('Flight delays endpoint - validacion de parametros', () => {
  const ENDPOINT = '/flight_delays';

  const noDataMessage = 'No data found';

  const baseValid = {
    delay: 60,
    type: 'departures'
  };

  const expectedFlightFields = [
    'airline_iata',
    'airline_icao',
    'flight_iata',
    'flight_icao',
    'flight_number',
    'dep_iata',
    'dep_icao',
    'arr_iata',
    'arr_icao',
    'status',
    'delayed',
    'dep_delayed',
    'arr_delayed'
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
      timeout: 90000
    });

  const getMessage = (body = {}) => {
    if (typeof body.message === 'string') return body.message;
    if (typeof body.error === 'string') return body.error;
    if (typeof body.data === 'string') return body.data;
    return '';
  };

  const mergeParams = (overrides = {}) => ({ ...baseValid, ...overrides });

  const assertValidFlightItem = (flight, label) => {
    expect(flight, `${label}: item`).to.be.an('object');
    expectedFlightFields.forEach((field) => {
      expect(flight, `${label}: campo ${field}`).to.have.property(field);
    });
  };

  describe('combinaciones validas', () => {
    const validCases = [
      { name: 'baseline delay=60 departures', params: baseValid },
      { name: 'type arrivals', params: mergeParams({ type: 'arrivals' }) },
      { name: 'delay minimo 30', params: mergeParams({ delay: 30 }) },
      { name: 'dep_iata LAX', params: mergeParams({ dep_iata: 'LAX' }) },
      { name: 'arr_iata JFK', params: mergeParams({ arr_iata: 'JFK' }) },
      { name: 'dep_icao KLAX', params: mergeParams({ dep_icao: 'KLAX' }) },
      { name: 'arr_icao KJFK', params: mergeParams({ type: 'arrivals', arr_icao: 'KJFK' }) },
      { name: 'airline_iata AA', params: mergeParams({ airline_iata: 'AA' }) },
      { name: 'airline_icao AAL', params: mergeParams({ airline_icao: 'AAL' }) },
      {
        name: 'airline_iata + airline_icao',
        params: mergeParams({ airline_iata: 'AA', airline_icao: 'AAL' })
      }
    ];

    validCases.forEach((testCase) => {
      it(testCase.name, () => {
        makeRequest(testCase.params).then((response) => {
          expect(response.status).to.eq(200);
          expect(response.body.success).to.eq(true);
          expect(response.body.data).to.be.an('array');

          if (response.body.data.length > 0) {
            assertValidFlightItem(response.body.data[0], testCase.name);
            expect(response.body.data[0].delayed).to.be.a('number');
          }
        });
      });
    });
  });

  describe('params requeridos: delay y type', () => {
    const requiredCases = [
      {
        name: 'sin delay',
        params: { type: 'departures' },
        expectedStatus: 422,
        expectedMsg: 'delay'
      },
      {
        name: 'delay vacio',
        params: mergeParams({ delay: '' }),
        includeEmpty: true,
        expectedStatus: 422,
        expectedMsg: 'delay'
      },
      {
        name: 'sin type',
        params: { delay: 60 },
        expectedStatus: 422,
        expectedMsg: 'type'
      },
      {
        name: 'type vacio',
        params: mergeParams({ type: '' }),
        includeEmpty: true,
        expectedStatus: 422,
        expectedMsg: 'type'
      },
      {
        name: 'delay 0',
        params: mergeParams({ delay: 0 }),
        expectedStatus: 422,
        expectedMsg: '30'
      },
      {
        name: 'delay 29 debajo del minimo',
        params: mergeParams({ delay: 29 }),
        expectedStatus: 422,
        expectedMsg: '30'
      },
      {
        name: 'delay negativo',
        params: mergeParams({ delay: -10 }),
        expectedStatus: 422,
        expectedMsg: '30'
      },
      {
        name: 'delay texto',
        params: mergeParams({ delay: 'abc' }),
        expectedStatus: 422,
        expectedMsg: 'integer'
      },
      {
        name: 'delay encima del maximo',
        params: mergeParams({ delay: 1000 }),
        expectedStatus: 422,
        expectedMsg: '720'
      }
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

  describe('param requerido: type', () => {
    const typeCases = [
      { name: 'type departures valido', params: mergeParams({ type: 'departures' }), accepted: true },
      { name: 'type arrivals valido', params: mergeParams({ type: 'arrivals' }), accepted: true },
      {
        name: 'type singular departure',
        params: mergeParams({ type: 'departure' }),
        issue: 'alias invalido responde No data found con status 200'
      },
      {
        name: 'type singular arrival',
        params: mergeParams({ type: 'arrival' }),
        issue: 'alias invalido responde No data found con status 200'
      },
      {
        name: 'type mayusculas DEPARTURES',
        params: mergeParams({ type: 'DEPARTURES' }),
        issue: 'case sensitive responde No data found'
      },
      {
        name: 'type invalido landed',
        params: mergeParams({ type: 'landed' }),
        issue: 'invalido responde No data found'
      }
    ];

    typeCases.forEach((testCase) => {
      it(testCase.name, () => {
        makeRequest(testCase.params).then((response) => {
          if (testCase.accepted) {
            expect(response.status).to.eq(200);
            expect(response.body.success).to.eq(true);
            return;
          }

          cy.log(
            `${testCase.name}: status=${response.status} success=${response.body.success} msg=${getMessage(response.body)} | ${testCase.issue}`
          );
          expect(response.status).to.be.oneOf([200, 400, 422]);
        });
      });
    });
  });

  describe('filtros opcionales invalidos o ambiguos', () => {
    const filterCases = [
      {
        name: 'dep_iata 2 chars',
        params: mergeParams({ dep_iata: 'LA' }),
        issue: 'formato invalido responde success true data vacia'
      },
      {
        name: 'arr_iata invalido',
        params: mergeParams({ arr_iata: 'ZZZZ' }),
        issue: 'formato invalido responde success true data vacia'
      },
      {
        name: 'dep_icao corto',
        params: mergeParams({ dep_icao: 'KL' }),
        issue: 'formato invalido responde success true data vacia'
      },
      {
        name: 'airline_iata 1 char',
        params: mergeParams({ airline_iata: 'A' }),
        issue: 'formato invalido responde success true data vacia'
      },
      {
        name: 'airline_icao corto',
        params: mergeParams({ airline_icao: 'AA' }),
        issue: 'formato invalido responde success true data vacia'
      },
      {
        name: 'flight_iata formato invalido',
        params: mergeParams({ flight_iata: '123' }),
        issue: 'formato invalido responde success true data vacia'
      },
      {
        name: 'flight_number no numerico',
        params: mergeParams({ flight_number: 'abc' }),
        issue: 'filtro ignorado o no validado'
      },
      {
        name: 'flight_iata sin resultados',
        params: mergeParams({ flight_iata: 'AA100' }),
        allowEmpty: true
      }
    ];

    filterCases.forEach((testCase) => {
      it(testCase.name, () => {
        makeRequest(testCase.params).then((response) => {
          cy.log(
            `${testCase.name}: status=${response.status} success=${response.body.success} dataLen=${response.body?.data?.length} | ${testCase.issue || ''}`
          );
          expect(response.status).to.eq(200);

          if (testCase.allowEmpty) {
            expect(response.body.data).to.be.an('array');
            return;
          }

          if (testCase.issue?.includes('ignorado')) {
            // flight_number=abc actualmente devuelve muchos resultados
            expect(response.body.data).to.be.an('array');
          }
        });
      });
    });
  });

  describe('parametros no documentados', () => {
    it('parametro desconocido (comportamiento actual)', () => {
      makeRequest(mergeParams({ notAParam: 'x1' })).then((response) => {
        cy.log(`status=${response.status} dataLen=${response.body?.data?.length}`);
        expect(response.status).to.eq(200);
        expect(response.body.success).to.eq(true);
      });
    });
  });

  describe('regression: mensajes y bugs mejorables', () => {
    const improvableCases = [
      {
        name: 'type singular departure como no-data',
        params: mergeParams({ type: 'departure' }),
        check: (r) =>
          r.status === 200 && r.body?.success === false && getMessage(r.body) === noDataMessage
      },
      {
        name: 'type singular arrival como no-data',
        params: mergeParams({ type: 'arrival' }),
        check: (r) =>
          r.status === 200 && r.body?.success === false && getMessage(r.body) === noDataMessage
      },
      {
        name: 'type mayusculas como no-data',
        params: mergeParams({ type: 'DEPARTURES' }),
        check: (r) =>
          r.status === 200 && r.body?.success === false && getMessage(r.body) === noDataMessage
      },
      {
        name: 'type invalido landed como no-data',
        params: mergeParams({ type: 'landed' }),
        check: (r) =>
          r.status === 200 && r.body?.success === false && getMessage(r.body) === noDataMessage
      },
      {
        name: 'dep_iata invalido como empty success',
        params: mergeParams({ dep_iata: 'ZZZZ' }),
        check: (r) =>
          r.status === 200 && r.body?.success === true && Array.isArray(r.body?.data) && r.body.data.length === 0
      },
      {
        name: 'airline_icao corto como empty success',
        params: mergeParams({ airline_icao: 'AA' }),
        check: (r) =>
          r.status === 200 && r.body?.success === true && Array.isArray(r.body?.data) && r.body.data.length === 0
      },
      {
        name: 'flight_number no numerico ignorado',
        params: mergeParams({ flight_number: 'abc' }),
        check: (r) =>
          r.status === 200 && r.body?.success === true && Array.isArray(r.body?.data) && r.body.data.length > 100
      },
      {
        name: 'param desconocido ignorado',
        params: mergeParams({ notAParam: 'x1' }),
        check: (r) =>
          r.status === 200 && r.body?.success === true && Array.isArray(r.body?.data) && r.body.data.length > 0
      },
      {
        name: 'validation error sin success false top-level',
        params: { type: 'departures' },
        check: (r) => r.status === 422 && r.body?.success === undefined
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
              success: response.body?.success,
              message: getMessage(response.body),
              dataLen: Array.isArray(response.body?.data) ? response.body.data.length : null
            });
          }
        });
      });
    });

    after(() => {
      if (findings.length > 0) {
        cy.log('Mensajes/bugs mejorables /flight_delays:');
        findings.forEach((f) => {
          cy.log(
            `- ${f.case} | params=${JSON.stringify(f.params)} | status=${f.status} | success=${f.success} | msg=${f.message} | dataLen=${f.dataLen}`
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
