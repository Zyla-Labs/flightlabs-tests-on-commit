const { getFlightlabsApiKey } = require('../support/api');

describe('Flight info by flight number endpoint - validacion de parametros', () => {
  const ENDPOINT = '/flight';

  const noDataMessagePrefix = 'No data was found';

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

  const assertValidFlightItem = (flight, label) => {
    expect(flight, `${label}: item`).to.be.an('object');
    expectedFlightFields.forEach((field) => {
      expect(flight, `${label}: campo ${field}`).to.have.property(field);
    });
  };

  describe('combinaciones validas', () => {
    const validCases = [
      { name: 'baseline LH811', params: { flight_number: 'LH811' } },
      { name: 'WN579', params: { flight_number: 'WN579' } },
      { name: 'AA100', params: { flight_number: 'AA100' } },
      { name: 'minusculas lh811', params: { flight_number: 'lh811' } },
      { name: 'con espacios LH 811', params: { flight_number: 'LH 811' } }
    ];

    validCases.forEach((testCase) => {
      it(testCase.name, () => {
        makeRequest(testCase.params).then((response) => {
        if (response.status === 429) return;
          expect(response.status).to.eq(200);
          expect(response.body.success).to.eq(true);
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
        params: {},
        expectedStatus: 400,
        expectedMsg: 'flight_number'
      },
      {
        name: 'flight_number vacio',
        params: { flight_number: '' },
        includeEmpty: true,
        expectedStatus: 400,
        expectedMsg: 'flight_number'
      },
      {
        name: 'solo numeros',
        params: { flight_number: '811' },
        expectedStatus: 400,
        expectedMsg: 'airline code'
      },
      {
        name: 'solo letras',
        params: { flight_number: 'LH' },
        issue: 'formato incompleto responde no-data'
      },
      {
        name: 'inexistente ZZ9999',
        params: { flight_number: 'ZZ9999' },
        issue: 'puede devolver 404 o 504'
      }
    ];

    requiredCases.forEach((testCase) => {
      it(testCase.name, () => {
        makeRequest(testCase.params, { includeEmpty: testCase.includeEmpty }).then((response) => {
        if (response.status === 429) return;
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
    const today = new Date().toISOString().slice(0, 10);
    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrow = tomorrowDate.toISOString().slice(0, 10);

    const dateCases = [
      {
        name: 'date valida hoy',
        params: { flight_number: 'LH811', date: today },
        checkShape: true
      },
      {
        name: 'date valida manana',
        params: { flight_number: 'LH811', date: tomorrow },
        checkShape: true
      },
      {
        name: 'date pasado',
        params: { flight_number: 'LH811', date: '2024-03-20' },
        issue: 'pasado responde no-data'
      },
      {
        name: 'date formato DD-MM-YYYY',
        params: { flight_number: 'LH811', date: '21-07-2026' },
        issue: 'formato invalido aceptado / coerce'
      },
      {
        name: 'date formato slash',
        params: { flight_number: 'LH811', date: '2026/07/21' },
        issue: 'formato invalido aceptado / coerce'
      },
      {
        name: 'date invalida 99-99-9999',
        params: { flight_number: 'LH811', date: '99-99-9999' },
        issue: 'fecha invalida ignorada'
      },
      {
        name: 'date vacia',
        params: { flight_number: 'LH811', date: '' },
        includeEmpty: true,
        accepted: true
      }
    ];

    dateCases.forEach((testCase) => {
      it(testCase.name, () => {
        makeRequest(testCase.params, { includeEmpty: testCase.includeEmpty }).then((response) => {
        if (response.status === 429) return;
          if (testCase.accepted) {
            expect(response.status).to.eq(200);
            expect(response.body.success).to.eq(true);
            expect(response.body.data).to.be.an('array');
            return;
          }

          if (testCase.checkShape && response.status === 200 && response.body.success === true) {
            cy.log(
              `data isArray=${Array.isArray(response.body.data)} type=${typeof response.body.data}`
            );
            if (!Array.isArray(response.body.data) && typeof response.body.data === 'object') {
              cy.log(
                `BUG: con date, data es objeto con keys=${Object.keys(response.body.data).join(',')}`
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

  describe('parametros no documentados', () => {
    it('alias incorrecto flightNumber', () => {
      makeRequest({ flightNumber: 'LH811' }).then((response) => {
        if (response.status === 429) return;
        expect(response.status).to.eq(400);
        expect(getMessage(response.body).toLowerCase()).to.include('flight_number');
      });
    });

    it('parametro desconocido (comportamiento actual)', () => {
      makeRequest({ flight_number: 'LH811', notAParam: 'x1' }).then((response) => {
        if (response.status === 429) return;
        cy.log(`status=${response.status} dataLen=${response.body?.data?.length}`);
        expect(response.status).to.eq(200);
        expect(response.body.success).to.eq(true);
      });
    });
  });

  describe('regression: mensajes y bugs mejorables', () => {
    const today = new Date().toISOString().slice(0, 10);

    const improvableCases = [
      {
        name: 'date convierte data en objeto',
        params: { flight_number: 'LH811', date: today },
        check: (r) =>
          r.status === 200 &&
          r.body?.success === true &&
          r.body?.data &&
          !Array.isArray(r.body.data) &&
          typeof r.body.data === 'object'
      },
      {
        name: 'date formato DD-MM-YYYY aceptado',
        params: { flight_number: 'LH811', date: '21-07-2026' },
        check: (r) => r.status === 200 && r.body?.success === true
      },
      {
        name: 'date invalida ignorada',
        params: { flight_number: 'LH811', date: '99-99-9999' },
        check: (r) =>
          r.status === 200 &&
          r.body?.success === true &&
          Array.isArray(r.body?.data) &&
          r.body.data.length > 1
      },
      {
        name: 'solo letras responde no-data',
        params: { flight_number: 'LH' },
        check: (r) =>
          r.status === 404 &&
          typeof r.body?.data === 'string' &&
          getMessage(r.body).startsWith(noDataMessagePrefix)
      },
      {
        name: 'no-data usa data como string',
        params: { flight_number: 'LH811', date: '2024-03-20' },
        check: (r) => r.status === 404 && typeof r.body?.data === 'string'
      },
      {
        name: 'caracteres especiales no validados',
        params: { flight_number: 'LH@811' },
        check: (r) =>
          r.status === 200 && r.body?.success === true && Array.isArray(r.body?.data)
      },
      {
        name: 'param desconocido ignorado',
        params: { flight_number: 'LH811', notAParam: 'x1' },
        check: (r) =>
          r.status === 200 && r.body?.success === true && Array.isArray(r.body?.data)
      },
      {
        name: 'alias flightNumber sin sugerencia',
        params: { flightNumber: 'LH811' },
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
        if (response.status === 429) return;
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
        cy.log('Mensajes/bugs mejorables /flight:');
        findings.forEach((f) => {
          cy.log(
            `- ${f.case} | params=${JSON.stringify(f.params)} | status=${f.status} | msg=${f.message} | dataType=${f.dataType}`
          );
        });
      }

      expect(
        findings.length,
        `Se detectaron ${findings.length} casos con mensaje/comportamiento mejorable`
      ).to.be.at.most(6);
    });
  });
});
