const { getFlightlabsApiKey } = require('../support/api');

describe('Flight data by date (v2/flight) - validacion de parametros', () => {
  const ENDPOINT = '/v2/flight';

  const noDataMessagePrefix = 'No data was found';

  const baseValid = {
    search_by: 'number',
    flight_number: 'LH811',
    date: '2026-07-22'
  };

  const expectedFlightFields = [
    'DATE',
    'FROM',
    'TO',
    'AIRCRAFT',
    'FLIGHT TIME',
    'STD',
    'ATD',
    'STA',
    'STATUS'
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
      { name: 'baseline doc con date', params: baseValid, expectObjectWithDate: true },
      { name: 'sin date', params: { search_by: 'number', flight_number: 'LH811' } },
      { name: 'sin search_by con date', params: { flight_number: 'LH811', date: '2026-07-22' }, expectObjectWithDate: true },
      { name: 'solo flight_number', params: { flight_number: 'LH811' } },
      { name: 'WN579 con date', params: mergeParams({ flight_number: 'WN579' }), expectObjectWithDate: true },
      { name: 'minusculas', params: mergeParams({ flight_number: 'lh811' }), expectObjectWithDate: true },
      { name: 'con espacios', params: mergeParams({ flight_number: 'LH 811' }), expectObjectWithDate: true }
    ];

    validCases.forEach((testCase) => {
      it(testCase.name, () => {
        makeRequest(testCase.params).then((response) => {
          expect(response.status).to.eq(200);
          expect(response.body.success).to.eq(true);

          if (testCase.expectObjectWithDate) {
            // Comportamiento actual con date: data es objeto.
            if (Array.isArray(response.body.data)) {
              expect(response.body.data).to.not.be.empty;
              assertValidFlightItem(response.body.data[0], testCase.name);
            } else {
              expect(response.body.data).to.be.an('object');
              const first = Object.values(response.body.data)[0];
              assertValidFlightItem(first, testCase.name);
            }
            return;
          }

          expect(response.body.data).to.be.an('array').and.not.be.empty;
          assertValidFlightItem(response.body.data[0], testCase.name);
        });
      });
    });
  });

  describe('param requerido: flight_number', () => {
    const requiredCases = [
      {
        name: 'sin flight_number',
        params: { search_by: 'number', date: '2026-07-22' },
        expectedStatus: 400,
        expectedMsg: 'flight_number'
      },
      {
        name: 'flight_number vacio',
        params: mergeParams({ flight_number: '' }),
        includeEmpty: true,
        expectedStatus: 400,
        expectedMsg: 'flight_number'
      },
      {
        name: 'solo numeros',
        params: mergeParams({ flight_number: '811' }),
        expectedStatus: 400,
        expectedMsg: 'airline code'
      },
      {
        name: 'solo letras',
        params: mergeParams({ flight_number: 'LH' }),
        issue: 'formato incompleto responde no-data'
      },
      {
        name: 'inexistente ZZ9999',
        params: mergeParams({ flight_number: 'ZZ9999' }),
        issue: 'no-data'
      }
    ];

    requiredCases.forEach((testCase) => {
      it(testCase.name, () => {
        makeRequest(testCase.params, { includeEmpty: testCase.includeEmpty }).then((response) => {
          if (testCase.expectedStatus) {
            expect(response.status).to.eq(testCase.expectedStatus);
            expect(getMessage(response.body).toLowerCase()).to.include(
              testCase.expectedMsg.toLowerCase()
            );
            return;
          }

          cy.log(
            `${testCase.name}: status=${response.status} msg=${getMessage(response.body)} | ${testCase.issue}`
          );
          expect(response.status).to.be.oneOf([400, 404, 422, 504]);
        });
      });
    });
  });

  describe('param opcional: date', () => {
    const dateCases = [
      {
        name: 'date valida',
        params: baseValid,
        checkShape: true
      },
      {
        name: 'date formato DD-MM-YYYY',
        params: mergeParams({ date: '22-07-2026' }),
        issue: 'formato invalido aceptado'
      },
      {
        name: 'date formato slash',
        params: mergeParams({ date: '2026/07/22' }),
        issue: 'formato invalido aceptado'
      },
      {
        name: 'date invalida 99-99-9999',
        params: mergeParams({ date: '99-99-9999' }),
        issue: 'fecha invalida ignorada'
      },
      {
        name: 'date pasado',
        params: mergeParams({ date: '2024-03-20' }),
        issue: 'pasado responde no-data'
      },
      {
        name: 'date futuro lejano',
        params: mergeParams({ date: '2030-01-01' }),
        issue: 'futuro lejano responde no-data'
      }
    ];

    dateCases.forEach((testCase) => {
      it(testCase.name, () => {
        makeRequest(testCase.params).then((response) => {
          if (testCase.checkShape && response.status === 200 && response.body.success === true) {
            cy.log(
              `data isArray=${Array.isArray(response.body.data)} type=${typeof response.body.data}`
            );
            if (!Array.isArray(response.body.data) && typeof response.body.data === 'object') {
              cy.log(
                `BUG: con date, data es objeto keys=${Object.keys(response.body.data).join(',')}`
              );
            }
          }

          cy.log(
            `${testCase.name}: status=${response.status} msg=${getMessage(response.body)} | ${testCase.issue || ''}`
          );
          expect(response.status).to.be.oneOf([200, 400, 404, 422]);
        });
      });
    });
  });

  describe('param opcional: search_by', () => {
    const searchByCases = [
      { name: 'search_by number', params: baseValid, accepted: true },
      {
        name: 'search_by invalido code',
        params: mergeParams({ search_by: 'code' }),
        issue: 'valor invalido ignorado'
      },
      {
        name: 'search_by vacio',
        params: mergeParams({ search_by: '' }),
        includeEmpty: true,
        issue: 'vacio ignorado'
      },
      {
        name: 'sin search_by',
        params: { flight_number: 'LH811', date: '2026-07-22' },
        accepted: true
      }
    ];

    searchByCases.forEach((testCase) => {
      it(testCase.name, () => {
        makeRequest(testCase.params, { includeEmpty: testCase.includeEmpty }).then((response) => {
          cy.log(
            `${testCase.name}: status=${response.status} success=${response.body.success} | ${testCase.issue || ''}`
          );
          expect(response.status).to.be.oneOf([200, 400, 422]);
        });
      });
    });
  });

  describe('campo ATA documentado', () => {
    it('respuesta incluye ATA segun documentacion', () => {
      makeRequest({ flight_number: 'LH811' }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.data).to.be.an('array').and.not.be.empty;
        const item = response.body.data[0];
        cy.log(`keys=${Object.keys(item).join(',')}`);
        // Doc lista ATA; comportamiento actual no lo incluye.
        if (!Object.prototype.hasOwnProperty.call(item, 'ATA')) {
          cy.log('BUG: campo ATA documentado no viene en la respuesta');
        }
        expect(item).to.have.property('STATUS');
      });
    });
  });

  describe('parametros no documentados', () => {
    it('alias incorrecto flightNumber', () => {
      makeRequest({ search_by: 'number', flightNumber: 'LH811', date: '2026-07-22' }).then(
        (response) => {
          expect(response.status).to.eq(400);
          expect(getMessage(response.body).toLowerCase()).to.include('flight_number');
        }
      );
    });

    it('parametro desconocido (comportamiento actual)', () => {
      makeRequest(mergeParams({ notAParam: 'x1' })).then((response) => {
        cy.log(`status=${response.status}`);
        expect(response.status).to.eq(200);
        expect(response.body.success).to.eq(true);
      });
    });
  });

  describe('regression: mensajes y bugs mejorables', () => {
    const improvableCases = [
      {
        name: 'date convierte data en objeto',
        params: baseValid,
        check: (r) =>
          r.status === 200 &&
          r.body?.success === true &&
          r.body?.data &&
          !Array.isArray(r.body.data) &&
          typeof r.body.data === 'object'
      },
      {
        name: 'date formato DD-MM-YYYY aceptado',
        params: mergeParams({ date: '22-07-2026' }),
        check: (r) => r.status === 200 && r.body?.success === true
      },
      {
        name: 'date formato slash aceptado',
        params: mergeParams({ date: '2026/07/22' }),
        check: (r) => r.status === 200 && r.body?.success === true
      },
      {
        name: 'date invalida ignorada',
        params: mergeParams({ date: '99-99-9999' }),
        check: (r) =>
          r.status === 200 &&
          r.body?.success === true &&
          Array.isArray(r.body?.data) &&
          r.body.data.length > 1
      },
      {
        name: 'search_by invalido ignorado',
        params: mergeParams({ search_by: 'code' }),
        check: (r) => r.status === 200 && r.body?.success === true
      },
      {
        name: 'solo letras responde no-data string',
        params: mergeParams({ flight_number: 'LH' }),
        check: (r) =>
          r.status === 404 &&
          typeof r.body?.data === 'string' &&
          getMessage(r.body).startsWith(noDataMessagePrefix)
      },
      {
        name: 'no-data usa data como string',
        params: mergeParams({ date: '2024-03-20' }),
        check: (r) => r.status === 404 && typeof r.body?.data === 'string'
      },
      {
        name: 'campo ATA ausente',
        params: { flight_number: 'LH811' },
        check: (r) =>
          r.status === 200 &&
          Array.isArray(r.body?.data) &&
          r.body.data.length > 0 &&
          !Object.prototype.hasOwnProperty.call(r.body.data[0], 'ATA')
      },
      {
        name: 'param desconocido ignorado',
        params: mergeParams({ notAParam: 'x1' }),
        check: (r) => r.status === 200 && r.body?.success === true
      },
      {
        name: 'alias flightNumber sin sugerencia',
        params: { search_by: 'number', flightNumber: 'LH811', date: '2026-07-22' },
        check: (r) =>
          r.status === 400 &&
          getMessage(r.body).toLowerCase().includes('flight_number') &&
          !getMessage(r.body).toLowerCase().includes('did you mean')
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
              dataType: Array.isArray(response.body?.data)
                ? 'array'
                : typeof response.body?.data
            });
          }
        });
      });
    });

    after(() => {
      if (findings.length > 0) {
        cy.log('Mensajes/bugs mejorables /v2/flight:');
        findings.forEach((f) => {
          cy.log(
            `- ${f.case} | params=${JSON.stringify(f.params)} | status=${f.status} | msg=${f.message} | dataType=${f.dataType}`
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
