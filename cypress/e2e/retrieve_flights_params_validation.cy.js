const { getFlightlabsApiKey } = require('../support/api');

describe('Retrieve flights (flight prices) endpoint - edge y negative cases', () => {
  const ENDPOINT = '/retrieveFlights';
  const UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const departureDate = () => {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    return date.toISOString().slice(0, 10);
  };

  const returnDateFrom = (departure) => {
    const date = new Date(`${departure}T00:00:00`);
    date.setDate(date.getDate() + 7);
    return date.toISOString().slice(0, 10);
  };

  const baseRoundtrip = () => {
    const date = departureDate();
    return {
      originIATACode: 'LGW',
      destinationIATACode: 'JFK',
      date,
      returnDate: returnDateFrom(date),
      sortBy: 'best',
      mode: 'roundtrip'
    };
  };

  const baseOneway = () => ({
    originIATACode: 'LGW',
    destinationIATACode: 'JFK',
    date: departureDate(),
    sortBy: 'best',
    mode: 'oneway'
  });

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
    return '';
  };

  const mergeRoundtrip = (overrides = {}) => ({ ...baseRoundtrip(), ...overrides });

  const assertAsyncJobQueued = (response, label) => {
    expect(response.status, `${label}: status`).to.eq(202);
    expect(response.body, `${label}: body`).to.be.an('object');
    expect(response.body.status).to.eq('processing');
    expect(response.body.jobId).to.be.a('string').and.match(UUID_REGEX);
    expect(response.body.message).to.be.a('string').and.not.be.empty;
  };

  const assertValidationError = (response, label, expectedFragment = '') => {
    expect(response.status, `${label}: status`).to.eq(422);
    expect(response.body.status).to.eq(false);
    const msg = getMessage(response.body).toLowerCase();
    expect(msg, `${label}: message`).to.not.be.empty;
    if (expectedFragment) {
      expect(msg).to.include(expectedFragment.toLowerCase());
    }
  };

  const assertCachedOrAsyncSuccess = (response, label) => {
    expect(response.status, `${label}: status`).to.be.oneOf([200, 202]);

    if (response.status === 202) {
      assertAsyncJobQueued(response, label);
      return;
    }

    const body = response.body;
    const hasFlightsArray = Array.isArray(body) && body.length > 0;
    const hasPairs = body?.pairs && Array.isArray(body.pairs) && body.pairs.length > 0;

    expect(hasFlightsArray || hasPairs, `${label}: respuesta cacheada con datos`).to.eq(true);
  };

  describe('job async aceptado (202 + jobId)', () => {
    const asyncCases = [
      { name: 'oneway baseline', params: () => baseOneway() },
      { name: 'roundtrip sin cache inmediato', params: () => mergeRoundtrip() },
      { name: 'sortBy cheapest', params: () => mergeRoundtrip({ sortBy: 'cheapest' }) },
      { name: 'sin sortBy', params: () => {
        const { sortBy, ...rest } = baseRoundtrip();
        return rest;
      } },
      { name: 'sin mode', params: () => {
        const { mode, ...rest } = baseRoundtrip();
        return rest;
      } }
    ];

    asyncCases.forEach((testCase) => {
      it(testCase.name, () => {
        makeRequest(testCase.params()).then((response) => {
          if (response.status === 202) {
            assertAsyncJobQueued(response, testCase.name);
          } else {
            assertCachedOrAsyncSuccess(response, testCase.name);
          }
        });
      });
    });
  });

  describe('params requeridos faltantes o vacios', () => {
    const requiredCases = [
      {
        name: 'sin originIATACode',
        params: () => {
          const { originIATACode, ...rest } = baseRoundtrip();
          return rest;
        },
        fragment: 'origin'
      },
      {
        name: 'sin destinationIATACode',
        params: () => {
          const { destinationIATACode, ...rest } = baseRoundtrip();
          return rest;
        },
        fragment: 'destination'
      },
      {
        name: 'sin date',
        params: () => {
          const { date, ...rest } = baseRoundtrip();
          return rest;
        },
        fragment: 'date'
      },
      {
        name: 'originIATACode vacio',
        params: () => mergeRoundtrip({ originIATACode: '' }),
        includeEmpty: true,
        fragment: 'origin'
      },
      {
        name: 'destinationIATACode vacio',
        params: () => mergeRoundtrip({ destinationIATACode: '' }),
        includeEmpty: true,
        fragment: 'destination'
      }
    ];

    requiredCases.forEach((testCase) => {
      it(testCase.name, () => {
        makeRequest(testCase.params(), { includeEmpty: testCase.includeEmpty }).then((response) => {
          assertValidationError(response, testCase.name, testCase.fragment);
        });
      });
    });
  });

  describe('originIATACode y destinationIATACode', () => {
    const airportCases = [
      {
        name: 'origin invalido largo',
        params: () => mergeRoundtrip({ originIATACode: 'ZZZZZ' }),
        issue: 'codigo invalido encola job async'
      },
      {
        name: 'destination invalido largo',
        params: () => mergeRoundtrip({ destinationIATACode: 'ZZZZZ' }),
        issue: 'codigo invalido encola job async'
      },
      {
        name: 'origin y destination iguales',
        params: () => mergeRoundtrip({ originIATACode: 'JFK', destinationIATACode: 'JFK' }),
        issue: 'mismo aeropuerto encola job async'
      },
      {
        name: 'origin 2 caracteres',
        params: () => mergeRoundtrip({ originIATACode: 'LG' }),
        issue: 'formato invalido encola job async'
      },
      {
        name: 'origin minusculas',
        params: () => mergeRoundtrip({ originIATACode: 'lgw' }),
        issue: 'case sensitivity ambigua encola job'
      },
      {
        name: 'origen y destino validos distintos',
        params: () => mergeRoundtrip({ originIATACode: 'LHR', destinationIATACode: 'CDG' }),
        expected: 'accepted'
      }
    ];

    airportCases.forEach((testCase) => {
      it(testCase.name, () => {
        makeRequest(testCase.params()).then((response) => {
          if (testCase.expected === 'accepted') {
            assertCachedOrAsyncSuccess(response, testCase.name);
            return;
          }

          cy.log(`${testCase.name}: status=${response.status} issue=${testCase.issue}`);
          expect(response.status).to.be.oneOf([200, 202, 422]);
        });
      });
    });
  });

  describe('date y returnDate', () => {
    const dateCases = [
      {
        name: 'fecha en el pasado',
        params: () => mergeRoundtrip({ date: '2020-01-01', returnDate: '2020-01-08' }),
        fragment: 'past'
      },
      {
        name: 'returnDate antes que date',
        params: () => mergeRoundtrip({ date: '2026-08-01', returnDate: '2026-07-01' }),
        fragment: 'return date'
      },
      {
        name: 'formato date invalido',
        params: () => mergeRoundtrip({ date: '11-06-2026' }),
        fragment: 'format'
      },
      {
        name: 'roundtrip sin returnDate',
        params: () => {
          const { returnDate, ...rest } = baseRoundtrip();
          return rest;
        },
        issue: 'roundtrip sin returnDate encola job'
      },
      {
        name: 'oneway con returnDate',
        params: () => ({
          ...baseOneway(),
          returnDate: returnDateFrom(departureDate())
        }),
        issue: 'oneway no deberia aceptar returnDate'
      }
    ];

    dateCases.forEach((testCase) => {
      it(testCase.name, () => {
        makeRequest(testCase.params()).then((response) => {
          if (testCase.fragment) {
            assertValidationError(response, testCase.name, testCase.fragment);
            return;
          }

          cy.log(`${testCase.name}: status=${response.status} issue=${testCase.issue}`);
          expect(response.status).to.be.oneOf([200, 202, 422]);
        });
      });
    });
  });

  describe('mode y sortBy', () => {
    const modeSortCases = [
      { name: 'mode invalido', params: () => mergeRoundtrip({ mode: 'multi' }), fragment: 'mode' },
      { name: 'sortBy invalido', params: () => mergeRoundtrip({ sortBy: 'fastest' }), fragment: 'sort by' },
      { name: 'mode oneway valido', params: () => baseOneway(), accepted: true },
      { name: 'mode roundtrip valido', params: () => mergeRoundtrip(), accepted: true },
      { name: 'sortBy best valido', params: () => mergeRoundtrip({ sortBy: 'best' }), accepted: true }
    ];

    modeSortCases.forEach((testCase) => {
      it(testCase.name, () => {
        makeRequest(testCase.params()).then((response) => {
          if (testCase.fragment) {
            assertValidationError(response, testCase.name, testCase.fragment);
            return;
          }

          if (testCase.accepted) {
            assertCachedOrAsyncSuccess(response, testCase.name);
          }
        });
      });
    });
  });

  describe('group_by_roundtrip', () => {
    it('group_by_roundtrip=true devuelve pairs o job async', () => {
      makeRequest(mergeRoundtrip({ group_by_roundtrip: 'true' })).then((response) => {
        if (response.status === 202) {
          assertAsyncJobQueued(response, 'group_by_roundtrip');
          return;
        }

        expect(response.status).to.eq(200);
        expect(response.body).to.have.property('pairs');
        expect(response.body.pairs).to.be.an('array').and.not.be.empty;
        expect(response.body.pairs[0]).to.have.property('outbound');
      });
    });

    it('group_by_roundtrip invalido', () => {
      makeRequest(mergeRoundtrip({ group_by_roundtrip: 'maybe' })).then((response) => {
        assertValidationError(response, 'group_by_roundtrip invalido', 'group by roundtrip');
      });
    });
  });

  describe('parametros no documentados', () => {
    it('alias incorrecto originIataCode', () => {
      makeRequest({
        originIataCode: 'LGW',
        destinationIATACode: 'JFK',
        date: departureDate(),
        mode: 'oneway',
        sortBy: 'best'
      }).then((response) => {
        assertValidationError(response, 'alias originIataCode', 'origin');
      });
    });

    it('parametro desconocido (comportamiento actual)', () => {
      makeRequest(mergeRoundtrip({ notAParam: 'x1' })).then((response) => {
        cy.log(`status=${response.status}`);
        expect(response.status).to.be.oneOf([200, 202]);
      });
    });
  });

  describe('regression: mensajes y edge cases mejorables', () => {
    const improvableCases = [
      {
        name: 'origin invalido encola job',
        params: () => mergeRoundtrip({ originIATACode: 'ZZZZZ' }),
        check: (r) => r.status === 202 && r.body?.status === 'processing'
      },
      {
        name: 'destino invalido encola job',
        params: () => mergeRoundtrip({ destinationIATACode: 'ZZZZZ' }),
        check: (r) => r.status === 202 && r.body?.status === 'processing'
      },
      {
        name: 'mismo origen y destino encola job',
        params: () => mergeRoundtrip({ originIATACode: 'JFK', destinationIATACode: 'JFK' }),
        check: (r) => r.status === 202 && r.body?.status === 'processing'
      },
      {
        name: 'origin 2 chars encola job',
        params: () => mergeRoundtrip({ originIATACode: 'LG' }),
        check: (r) => r.status === 202 && r.body?.status === 'processing'
      },
      {
        name: 'roundtrip sin returnDate encola job',
        params: () => {
          const { returnDate, ...rest } = baseRoundtrip();
          return rest;
        },
        check: (r) => r.status === 202 && r.body?.status === 'processing'
      },
      {
        name: 'oneway con returnDate encola job',
        params: () => ({ ...baseOneway(), returnDate: returnDateFrom(departureDate()) }),
        check: (r) => r.status === 202 && r.body?.status === 'processing'
      },
      {
        name: 'required faltante mensaje con espacios raros',
        params: () => {
          const { originIATACode, ...rest } = baseRoundtrip();
          return rest;
        },
        check: (r) => getMessage(r.body).toLowerCase().includes('i a t a')
      },
      {
        name: 'param desconocido ignorado',
        params: () => mergeRoundtrip({ notAParam: 'x1' }),
        check: (r) => r.status === 200 || r.status === 202
      }
    ];

    const findings = [];

    improvableCases.forEach((testCase) => {
      it(`detecta: ${testCase.name}`, () => {
        makeRequest(testCase.params()).then((response) => {
          if (testCase.check(response)) {
            findings.push({
              case: testCase.name,
              params: { ...testCase.params(), access_key: '[REDACTED]' },
              status: response.status,
              message: getMessage(response.body),
              jobId: response.body?.jobId || null
            });
          }
        });
      });
    });

    after(() => {
      if (findings.length > 0) {
        cy.log('Mensajes mejorables /retrieveFlights:');
        findings.forEach((f) => {
          cy.log(
            `- ${f.case} | params=${JSON.stringify(f.params)} | status=${f.status} | msg=${f.message} | jobId=${f.jobId}`
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
