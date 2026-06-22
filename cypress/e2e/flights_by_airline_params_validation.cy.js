const { getFlightlabsApiKey } = require('../support/api');

describe('Flights by airline endpoint - validacion de airline_icao', () => {
  const ENDPOINT = '/flights-by-airline';

  const genericErrorMessage =
    'We could not complete your request. Please try again later. If the issue persists, please contact us: hello@goflightlabs.com';

  const expectedFlightFields = [
    'id',
    'icao_24bit',
    'latitude',
    'longitude',
    'heading',
    'altitude',
    'ground_speed',
    'squawk',
    'aircraft_code',
    'registration',
    'time',
    'origin_airport_iata',
    'destination_airport_iata',
    'number',
    'airline_iata',
    'on_ground',
    'vertical_speed',
    'callsign',
    'airline_icao'
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

  const assertValidFlightItem = (flight, label) => {
    expect(flight, `${label}: objeto`).to.be.an('object');
    expectedFlightFields.forEach((field) => {
      expect(flight, `${label}: campo ${field}`).to.have.property(field);
    });
  };

  describe('airline_icao valido', () => {
    const validCases = [
      { name: 'AZU (ejemplo doc)', params: { airline_icao: 'AZU' } },
      { name: 'AAL', params: { airline_icao: 'AAL' } },
      { name: 'DAL', params: { airline_icao: 'DAL' } },
      { name: 'GLO', params: { airline_icao: 'GLO' } }
    ];

    validCases.forEach((testCase) => {
      it(testCase.name, () => {
        makeRequest(testCase.params).then((response) => {
          expect(response.status).to.eq(200);
          expect(response.body.success).to.eq(true);
          expect(response.body.data).to.be.an('array').and.not.be.empty;

          assertValidFlightItem(response.body.data[0], testCase.name);

          response.body.data.slice(0, 10).forEach((flight, index) => {
            expect(
              flight.airline_icao,
              `${testCase.name}: item[${index}] airline_icao`
            ).to.eq(testCase.params.airline_icao);
          });
        });
      });
    });
  });

  describe('airline_icao requerido', () => {
    it('sin airline_icao devuelve mensaje de parametros', () => {
      makeRequest({}).then((response) => {
        expect(response.body.success).to.eq(false);
        expect(getMessage(response.body)).to.include('Please verify your parameters');
      });
    });

    it('airline_icao vacio', () => {
      makeRequest({ airline_icao: '' }, { includeEmpty: true }).then((response) => {
        cy.log(`status=${response.status} msg=${getMessage(response.body)}`);
        expect(response.status).to.be.oneOf([400, 404, 422]);
      });
    });
  });

  describe('airline_icao invalido o ambiguo', () => {
    const invalidCases = [
      {
        name: 'codigo corto 2 chars',
        params: { airline_icao: 'AA' },
        issue: 'acepta codigo corto y devuelve vuelos de otras aerolineas'
      },
      {
        name: 'codigo largo 4 chars',
        params: { airline_icao: 'AAAA' },
        issue: 'formato invalido responde error generico 404'
      },
      {
        name: 'codigo numerico',
        params: { airline_icao: '123' },
        issue: 'formato invalido responde error generico 404'
      },
      {
        name: 'codigo inexistente',
        params: { airline_icao: 'ZZZ' },
        issue: 'sin vuelos responde error generico en lugar de no-results'
      },
      {
        name: 'codigo en minusculas',
        params: { airline_icao: 'azu' },
        issue: 'case sensitivity no documentada, error generico'
      },
      {
        name: 'caracteres especiales',
        params: { airline_icao: '!!!' },
        issue: 'formato invalido responde error generico 404'
      }
    ];

    invalidCases.forEach((testCase) => {
      it(testCase.name, () => {
        makeRequest(testCase.params).then((response) => {
          const body = response.body || {};
          const msg = getMessage(body);
          cy.log(`${testCase.name}: status=${response.status} msg=${msg} issue=${testCase.issue}`);

          if (testCase.issue.includes('codigo corto')) {
            expect(response.status).to.eq(200);
            if (Array.isArray(body.data)) {
              const mismatched = body.data.filter(
                (f) => f.airline_icao !== testCase.params.airline_icao
              );
              cy.log(
                `BUG: airline_icao=AA devolvio ${mismatched.length}/${body.data.length} vuelos de otras aerolineas`
              );
            }
            return;
          }

          if (testCase.issue.includes('error generico') || testCase.issue.includes('no-results')) {
            cy.log(`comportamiento actual: status=${response.status} msg=${msg}`);
            expect(response.status).to.be.oneOf([404, 400, 422]);
          }
        });
      });
    });
  });

  describe('parametros no documentados', () => {
    it('alias incorrecto airlineIcao (comportamiento actual)', () => {
      makeRequest({ airlineIcao: 'AZU' }).then((response) => {
        cy.log(`status=${response.status} msg=${getMessage(response.body)}`);
        expect(response.status).to.eq(404);
      });
    });

    it('parametro desconocido con airline_icao valido (comportamiento actual)', () => {
      makeRequest({ airline_icao: 'AZU', notAParam: 'x1' }).then((response) => {
        cy.log(`status=${response.status} dataLen=${response.body?.data?.length}`);
        expect(response.status).to.eq(200);
        expect(response.body.success).to.eq(true);
      });
    });
  });

  describe('regression: mensajes mejorables detectados', () => {
    const improvableCases = [
      {
        name: 'sin airline_icao con status 200',
        params: {},
        check: (r) => r.status === 200 && r.body?.success === false
      },
      {
        name: 'codigo corto devuelve otras aerolineas',
        params: { airline_icao: 'AA' },
        check: (r) => {
          if (r.status !== 200 || !Array.isArray(r.body?.data)) return false;
          return r.body.data.some((f) => f.airline_icao !== 'AA');
        }
      },
      {
        name: 'formato invalido error generico',
        params: { airline_icao: 'AAAA' },
        check: (r) => r.status === 404 && getMessage(r.body) === genericErrorMessage
      },
      {
        name: 'inexistente error generico',
        params: { airline_icao: 'ZZZ' },
        check: (r) => r.status === 404 && getMessage(r.body) === genericErrorMessage
      },
      {
        name: 'minusculas error generico',
        params: { airline_icao: 'azu' },
        check: (r) => r.status === 404 && getMessage(r.body) === genericErrorMessage
      },
      {
        name: 'alias incorrecto error generico',
        params: { airlineIcao: 'AZU' },
        check: (r) => r.status === 404 && getMessage(r.body) === genericErrorMessage
      },
      {
        name: 'param desconocido ignorado',
        params: { airline_icao: 'AZU', notAParam: 'x1' },
        check: (r) => r.status === 200 && r.body?.success === true
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
        cy.log('Mensajes mejorables /flights-by-airline:');
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
