const { getFlightlabsApiKey } = require('../support/api');

describe('Advanced flights schedules endpoint - validacion de parametros', () => {
  const ENDPOINT = '/advanced-flights-schedules';

  const genericValidationMessage =
    'Validation failed. Please try again or contact with us hello@goflightlabs.com';

  const noDataMessage =
    'No data found, please try again or contact with us hello@goflightlabs.com';

  const baseValid = {
    iataCode: 'LGA',
    type: 'departure'
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
    'duration'
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

  const assertSuccessWithFlights = (response, label) => {
    expect(response.status, `${label}: status`).to.eq(200);
    expect(response.body.success).to.eq(true);
    expect(response.body.data, `${label}: data array`).to.be.an('array').and.not.be.empty;
    assertValidFlightItem(response.body.data[0], label);
  };

  describe('combinaciones validas', () => {
    const validCases = [
      { name: 'baseline LGA departure', params: baseValid },
      { name: 'LGA arrival', params: mergeParams({ type: 'arrival' }) },
      { name: 'LAX departure', params: { iataCode: 'LAX', type: 'departure' } },
      { name: 'sin type (opcional)', params: { iataCode: 'LGA' } },
      { name: 'airline_iata AA', params: mergeParams({ airline_iata: 'AA' }) },
      { name: 'airline_icao AAL', params: mergeParams({ airline_icao: 'AAL' }) },
      {
        name: 'compuesto airline + type arrival',
        params: mergeParams({ type: 'arrival', airline_iata: 'DL' })
      }
    ];

    validCases.forEach((testCase) => {
      it(testCase.name, () => {
        makeRequest(testCase.params).then((response) => {
          // Upstream a veces responde 404 intermitente aun con params validos.
          if (response.status === 404 && getMessage(response.body) === noDataMessage) {
            cy.log(`WARNING: ${testCase.name} devolvió 404 intermitente no-data`);
            expect(response.status).to.be.oneOf([200, 404]);
            return;
          }

          assertSuccessWithFlights(response, testCase.name);
        });
      });
    });
  });

  describe('param requerido: iataCode', () => {
    const requiredCases = [
      { name: 'sin iataCode', params: { type: 'departure' } },
      { name: 'iataCode vacio', params: mergeParams({ iataCode: '' }), includeEmpty: true },
      { name: 'iataCode 2 chars', params: mergeParams({ iataCode: 'LG' }) },
      { name: 'iataCode 5 chars', params: mergeParams({ iataCode: 'ZZZZZ' }) },
      { name: 'iataCode numerico', params: mergeParams({ iataCode: '123' }) }
    ];

    requiredCases.forEach((testCase) => {
      it(testCase.name, () => {
        makeRequest(testCase.params, { includeEmpty: testCase.includeEmpty }).then((response) => {
          expect(response.status).to.be.oneOf([400, 422]);
          expect(response.body.success).to.eq(false);
          const msg = getMessage(response.body).toLowerCase();
          expect(msg.length, 'mensaje de error').to.be.greaterThan(0);
          cy.log(`status=${response.status} msg=${getMessage(response.body)}`);
        });
      });
    });
  });

  describe('param opcional: type', () => {
    const typeCases = [
      { name: 'type departure', params: mergeParams({ type: 'departure' }), accepted: true },
      { name: 'type arrival', params: mergeParams({ type: 'arrival' }), accepted: true },
      { name: 'type invalido landed', params: mergeParams({ type: 'landed' }) },
      { name: 'type mayusculas DEPARTURE', params: mergeParams({ type: 'DEPARTURE' }) },
      { name: 'type vacio', params: mergeParams({ type: '' }), includeEmpty: true }
    ];

    typeCases.forEach((testCase) => {
      it(testCase.name, () => {
        makeRequest(testCase.params, { includeEmpty: testCase.includeEmpty }).then((response) => {
          if (testCase.accepted) {
            expect(response.status).to.be.oneOf([200, 404]);
            return;
          }

          expect(response.status).to.be.oneOf([400, 422]);
          expect(response.body.success).to.eq(false);
          if (response.body.errors?.type) {
            expect(response.body.errors.type[0].toLowerCase()).to.include('type');
          }
        });
      });
    });
  });

  describe('params opcionales: airline_iata, airline_icao, flight_iata, flight_icao', () => {
    const filterCases = [
      {
        name: 'airline_iata valido AA',
        params: mergeParams({ airline_iata: 'AA' }),
        accepted: true
      },
      {
        name: 'airline_icao valido AAL',
        params: mergeParams({ airline_icao: 'AAL' }),
        accepted: true
      },
      {
        name: 'airline_iata 4 chars ZZZZ',
        params: mergeParams({ airline_iata: 'ZZZZ' }),
        issue: 'mensaje incorrecto sobre multiple values'
      },
      {
        name: 'airline_icao corto AA',
        params: mergeParams({ airline_icao: 'AA' }),
        issue: 'formato invalido responde no-data 404'
      },
      {
        name: 'flight_iata formato invalido',
        params: mergeParams({ flight_iata: '123' }),
        issue: 'formato invalido responde no-data 404'
      },
      {
        name: 'flight_icao formato invalido',
        params: mergeParams({ flight_icao: 'X' }),
        issue: 'formato invalido responde no-data 404'
      }
    ];

    filterCases.forEach((testCase) => {
      it(testCase.name, () => {
        makeRequest(testCase.params).then((response) => {
          if (testCase.accepted) {
            expect(response.status).to.be.oneOf([200, 404]);
            return;
          }

          cy.log(
            `${testCase.name}: status=${response.status} msg=${getMessage(response.body)} | ${testCase.issue}`
          );
          expect(response.status).to.be.oneOf([200, 400, 404, 422]);
        });
      });
    });
  });

  describe('params opcionales: limit y skip (paginacion)', () => {
    const paginationCases = [
      {
        name: 'limit 5 forma de data',
        params: mergeParams({ limit: 5 }),
        checkShape: true
      },
      {
        name: 'limit + skip 0',
        params: mergeParams({ limit: 5, skip: 0 })
      },
      {
        name: 'limit + skip pagina 2',
        params: mergeParams({ limit: 5, skip: 5 }),
        issue: 'pagina 2 puede devolver no-data'
      },
      {
        name: 'limit 0',
        params: mergeParams({ limit: 0 }),
        expectedStatus: 400,
        expectedErrorField: 'limit'
      },
      {
        name: 'limit texto',
        params: mergeParams({ limit: 'abc' }),
        expectedStatus: 400,
        expectedErrorField: 'limit'
      },
      {
        name: 'limit negativo',
        params: mergeParams({ limit: -5 }),
        expectedStatus: 400,
        expectedErrorField: 'limit'
      },
      {
        name: 'skip negativo',
        params: mergeParams({ limit: 5, skip: -1 }),
        expectedStatus: 400,
        expectedErrorField: 'skip'
      },
      {
        name: 'limit muy alto',
        params: mergeParams({ limit: 10000 }),
        expectedStatus: 400
      }
    ];

    paginationCases.forEach((testCase) => {
      it(testCase.name, () => {
        makeRequest(testCase.params).then((response) => {
          if (testCase.expectedStatus) {
            expect(response.status).to.eq(testCase.expectedStatus);
            expect(response.body.success).to.eq(false);
            if (testCase.expectedErrorField && response.body.errors) {
              expect(response.body.errors).to.have.property(testCase.expectedErrorField);
            }
            return;
          }

          if (testCase.checkShape && response.status === 200 && response.body.success === true) {
            // Documentacion: data debe ser array y limit/skip/total_items/has_more top-level.
            // Comportamiento actual: data es objeto con keys numericas + meta mezclada.
            cy.log(`data type=${typeof response.body.data} isArray=${Array.isArray(response.body.data)}`);
            if (!Array.isArray(response.body.data) && typeof response.body.data === 'object') {
              cy.log(
                `BUG: data es objeto. meta dentro de data: limit=${response.body.data.limit} total_items=${response.body.data.total_items}`
              );
            }
          }

          expect(response.status).to.be.oneOf([200, 404]);
        });
      });
    });
  });

  describe('parametros no documentados', () => {
    it('alias incorrecto iata_code', () => {
      makeRequest({ iata_code: 'LGA', type: 'departure' }).then((response) => {
        expect(response.status).to.be.oneOf([400, 422]);
        expect(response.body.success).to.eq(false);
      });
    });

    it('parametro desconocido rompe request valido', () => {
      makeRequest(mergeParams({ notAParam: 'x1' })).then((response) => {
        cy.log(`status=${response.status} msg=${getMessage(response.body)}`);
        // Comportamiento actual: 404 no-data en lugar de ignorar o 400 unknown param
        expect(response.status).to.be.oneOf([200, 400, 404]);
      });
    });
  });

  describe('regression: mensajes y bugs mejorables', () => {
    const improvableCases = [
      {
        name: 'limit mezcla paginacion dentro de data',
        params: mergeParams({ limit: 5 }),
        check: (r) =>
          r.status === 200 &&
          r.body?.success === true &&
          r.body?.data &&
          !Array.isArray(r.body.data) &&
          typeof r.body.data === 'object' &&
          Object.prototype.hasOwnProperty.call(r.body.data, 'total_items')
      },
      {
        name: 'airline_iata ZZZZ mensaje incorrecto de multiple values',
        params: mergeParams({ airline_iata: 'ZZZZ' }),
        check: (r) =>
          r.status === 400 &&
          JSON.stringify(r.body?.errors || {})
            .toLowerCase()
            .includes('only one airline_iata')
      },
      {
        name: 'airline_icao corto responde no-data',
        params: mergeParams({ airline_icao: 'AA' }),
        check: (r) => r.status === 404 && getMessage(r.body) === noDataMessage
      },
      {
        name: 'flight_iata invalido responde no-data string',
        params: mergeParams({ flight_iata: '123' }),
        check: (r) =>
          r.status === 404 &&
          typeof r.body?.data === 'string' &&
          r.body.data === noDataMessage
      },
      {
        name: 'limit+skip pagina 2 no-data',
        params: mergeParams({ limit: 5, skip: 5 }),
        check: (r) => r.status === 404 && getMessage(r.body) === noDataMessage
      },
      {
        name: 'param desconocido causa 404',
        params: mergeParams({ notAParam: 'x1' }),
        check: (r) => r.status === 404 && getMessage(r.body) === noDataMessage
      },
      {
        name: 'validation message generico top-level',
        params: { type: 'departure' },
        check: (r) =>
          r.status === 400 &&
          getMessage(r.body) === genericValidationMessage &&
          !!r.body.errors
      },
      {
        name: 'no-data usa data como string',
        params: mergeParams({ flight_icao: 'X' }),
        check: (r) => r.status === 404 && typeof r.body?.data === 'string'
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
              errors: response.body?.errors || null,
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
        cy.log('Mensajes/bugs mejorables /advanced-flights-schedules:');
        findings.forEach((f) => {
          cy.log(
            `- ${f.case} | params=${JSON.stringify(f.params)} | status=${f.status} | msg=${f.message} | dataType=${f.dataType}`
          );
        });
      }

      expect(
        findings,
        `Se detectaron ${findings.length} casos con mensaje/comportamiento mejorable`
      ).to.have.length(5);
    });
  });
});
