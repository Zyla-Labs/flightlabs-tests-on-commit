const { getFlightlabsApiKey } = require('../support/api');

describe('Airlines routes endpoint - validacion de parametros', () => {
  const ENDPOINT = '/routes';

  const genericValidationMessage =
    'Validation failed. Please try again or contact with us hello@goflightlabs.com';

  const expectedRouteFields = [
    'airline_iata',
    'airline_icao',
    'flight_number',
    'flight_iata',
    'flight_icao',
    'cs_airline_iata',
    'cs_flight_iata',
    'cs_flight_number',
    'dep_iata',
    'dep_icao',
    'dep_terminals',
    'dep_time',
    'dep_time_utc',
    'arr_iata',
    'arr_icao',
    'arr_terminals',
    'arr_time',
    'arr_time_utc',
    'duration',
    'aircraft_icao',
    'counter',
    'updated',
    'days'
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
      timeout: 120000
    });

  const getMessage = (body = {}) => {
    if (typeof body.message === 'string') return body.message;
    if (typeof body.error === 'string') return body.error;
    if (typeof body.data === 'string') return body.data;
    return '';
  };

  const assertValidRouteItem = (route, label) => {
    expect(route, `${label}: item`).to.be.an('object');
    expectedRouteFields.forEach((field) => {
      expect(route, `${label}: campo ${field}`).to.have.property(field);
    });
  };

  describe('combinaciones validas', () => {
    const validCases = [
      { name: 'dep_iata LAX', params: { dep_iata: 'LAX' } },
      { name: 'dep_icao KLAX', params: { dep_icao: 'KLAX' } },
      { name: 'arr_iata JFK', params: { arr_iata: 'JFK' } },
      { name: 'airline_icao AAL', params: { airline_icao: 'AAL' } },
      { name: 'airline_iata AA', params: { airline_iata: 'AA' } },
      { name: 'dep_iata + limit 5', params: { dep_iata: 'LAX', limit: 5 }, expectedLen: 5 },
      {
        name: 'dep_iata + _fields',
        params: { dep_iata: 'LAX', _fields: 'airline_iata,flight_number' },
        expectedSubset: true
      }
    ];

    validCases.forEach((testCase) => {
      it(testCase.name, () => {
        makeRequest(testCase.params).then((response) => {
          expect(response.status).to.eq(200);
          expect(response.body.success).to.eq(true);
          expect(response.body.data).to.be.an('array');

          if (testCase.expectedSubset) {
            expect(response.body.data).to.not.be.empty;
            const keys = Object.keys(response.body.data[0]);
            expect(keys).to.deep.eq(['airline_iata', 'flight_number']);
            return;
          }

          expect(response.body.data).to.not.be.empty;
          assertValidRouteItem(response.body.data[0], testCase.name);

          if (testCase.expectedLen) {
            expect(response.body.data.length).to.eq(testCase.expectedLen);
          }
        });
      });
    });
  });

  describe('filtros requeridos de facto', () => {
    it('sin filtros', () => {
      makeRequest({}).then((response) => {
        expect(response.status).to.be.oneOf([400, 422]);
        expect(response.body.success).to.eq(false);
        expect(getMessage(response.body)).to.eq(genericValidationMessage);
      });
    });

    it('dep_iata vacio', () => {
      makeRequest({ dep_iata: '' }, { includeEmpty: true }).then((response) => {
        expect(response.status).to.be.oneOf([400, 422]);
        expect(response.body.success).to.eq(false);
      });
    });
  });

  describe('formatos invalidos', () => {
    const invalidCases = [
      { name: 'dep_iata 2 chars', params: { dep_iata: 'LA' } },
      { name: 'dep_icao corto', params: { dep_icao: 'KLA' } },
      { name: 'airline_iata 3 chars', params: { airline_iata: 'AAL' } },
      { name: 'airline_icao 2 chars', params: { airline_icao: 'AA' } },
      { name: 'flight_number texto', params: { flight_number: 'ABC' } },
      { name: 'flight_iata invalido AA100', params: { flight_iata: 'AA100' } }
    ];

    invalidCases.forEach((testCase) => {
      it(testCase.name, () => {
        makeRequest(testCase.params).then((response) => {
          cy.log(`status=${response.status} msg=${getMessage(response.body)}`);
          expect(response.status).to.be.oneOf([200, 400, 404, 422]);
        });
      });
    });
  });

  describe('sin resultados / filtros conflictivos', () => {
    const emptyCases = [
      { name: 'dep_iata inexistente ZZZ', params: { dep_iata: 'ZZZ' } },
      { name: 'arr_iata inexistente ZZZ', params: { arr_iata: 'ZZZ' } },
      {
        name: 'dep_iata + dep_icao conflictivos',
        params: { dep_iata: 'LAX', dep_icao: 'KJFK' }
      }
    ];

    emptyCases.forEach((testCase) => {
      it(testCase.name, () => {
        makeRequest(testCase.params).then((response) => {
          expect(response.status).to.eq(200);
          expect(response.body.success).to.eq(true);
          expect(response.body.data).to.be.an('array');
        });
      });
    });
  });

  describe('parametros no documentados', () => {
    it('alias incorrecto depIata', () => {
      makeRequest({ depIata: 'LAX' }).then((response) => {
        expect(response.status).to.be.oneOf([400, 422]);
        expect(response.body.success).to.eq(false);
      });
    });

    it('parametro desconocido con filtro valido', () => {
      makeRequest({ dep_iata: 'LAX', notAParam: 'x1' }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.success).to.eq(true);
        expect(response.body.data).to.be.an('array').and.not.be.empty;
      });
    });
  });

  describe('limit behavior', () => {
    it('limit 0 se ignora y vuelve a 500', () => {
      makeRequest({ dep_iata: 'LAX', limit: 0 }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.success).to.eq(true);
        expect(response.body.data).to.be.an('array');
        expect(response.body.data.length).to.eq(500);
      });
    });

    it('limit mayor a 500 se clampa a 500', () => {
      makeRequest({ dep_iata: 'LAX', limit: 999 }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.success).to.eq(true);
        expect(response.body.data).to.be.an('array');
        expect(response.body.data.length).to.eq(500);
      });
    });
  });

  describe('regression: mensajes y bugs mejorables', () => {
    const findings = [];

    const improvableCases = [
      {
        name: 'dep_iata formato invalido devuelve exito vacio',
        params: { dep_iata: 'LA' },
        check: (r) => r.status === 200 && r.body?.success === true && Array.isArray(r.body?.data)
      },
      {
        name: 'dep_icao formato invalido devuelve exito vacio',
        params: { dep_icao: 'KLA' },
        check: (r) => r.status === 200 && r.body?.success === true && Array.isArray(r.body?.data)
      },
      {
        name: 'airline_iata formato invalido devuelve exito vacio',
        params: { airline_iata: 'AAL' },
        check: (r) => r.status === 200 && r.body?.success === true && Array.isArray(r.body?.data)
      },
      {
        name: 'airline_icao formato invalido devuelve exito vacio',
        params: { airline_icao: 'AA' },
        check: (r) => r.status === 200 && r.body?.success === true && Array.isArray(r.body?.data)
      },
      {
        name: 'sin filtros mensaje generico',
        params: {},
        check: (r) => r.status === 400 && getMessage(r.body) === genericValidationMessage
      },
      {
        name: 'flight_iata valido semantico falla validacion generica',
        params: { flight_iata: 'AA100' },
        check: (r) => r.status === 400 && getMessage(r.body) === genericValidationMessage
      },
      {
        name: 'flight_number texto falla validacion generica',
        params: { flight_number: 'ABC' },
        check: (r) => r.status === 400 && getMessage(r.body) === genericValidationMessage
      },
      {
        name: 'limit 0 ignorado',
        params: { dep_iata: 'LAX', limit: 0 },
        check: (r) =>
          r.status === 200 &&
          Array.isArray(r.body?.data) &&
          r.body.data.length === 500
      },
      {
        name: 'limit > 500 se clampa sin aviso',
        params: { dep_iata: 'LAX', limit: 999 },
        check: (r) =>
          r.status === 200 &&
          Array.isArray(r.body?.data) &&
          r.body.data.length === 500
      },
      {
        name: 'parametro desconocido ignorado',
        params: { dep_iata: 'LAX', notAParam: 'x1' },
        check: (r) => r.status === 200 && r.body?.success === true
      },
      {
        name: 'conflicto dep_iata/dep_icao como exito vacio',
        params: { dep_iata: 'LAX', dep_icao: 'KJFK' },
        check: (r) =>
          r.status === 200 &&
          r.body?.success === true &&
          Array.isArray(r.body?.data) &&
          r.body.data.length === 0
      }
    ];

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
              dataType: Array.isArray(response.body?.data)
                ? 'array'
                : typeof response.body?.data,
              dataLen: Array.isArray(response.body?.data) ? response.body.data.length : null
            });
          }
        });
      });
    });

    after(() => {
      if (findings.length > 0) {
        cy.log('Mensajes/bugs mejorables /routes:');
        findings.forEach((f) => {
          cy.log(
            `- ${f.case} | params=${JSON.stringify(f.params)} | status=${f.status} | msg=${f.message} | dataType=${f.dataType} | dataLen=${f.dataLen}`
          );
        });
      }

      expect(
        findings,
        `Se detectaron ${findings.length} casos con mensaje/comportamiento mejorable`
      ).to.have.length(11);
    });
  });
});
