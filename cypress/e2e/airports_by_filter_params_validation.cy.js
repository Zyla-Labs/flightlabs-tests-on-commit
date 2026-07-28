const { getFlightlabsApiKey } = require('../support/api');

describe('Airports by filter endpoint - validacion de parametros', () => {
  const ENDPOINT = '/airports-by-filter';

  const noDataMessage =
    'No data found, please try again or contact with us hello@goflightlabs.com';

  const expectedAirportFields = [
    'name',
    'iata_code',
    'icao_code',
    'lat',
    'lng',
    'alt',
    'city',
    'city_code',
    'timezone',
    'country_code',
    'names',
    'runways',
    'departures',
    'connections',
    'is_major',
    'is_international',
    'website',
    'facebook',
    'twitter',
    'instagram',
    'linkedin'
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

  const assertValidAirportItem = (airport, label) => {
    expect(airport, `${label}: item`).to.be.an('object');
    expectedAirportFields.forEach((field) => {
      expect(airport, `${label}: campo ${field}`).to.have.property(field);
    });
  };

  describe('combinaciones validas', () => {
    const validCases = [
      { name: 'iata_code JFK', params: { iata_code: 'JFK' } },
      { name: 'icao_code KJFK', params: { icao_code: 'KJFK' } },
      { name: 'city_code NYC', params: { city_code: 'NYC' } },
      { name: 'country_code US', params: { country_code: 'US' }, allowLarge: true },
      { name: 'iata + country', params: { iata_code: 'JFK', country_code: 'US' } },
      {
        name: 'todos los filtros',
        params: { iata_code: 'JFK', icao_code: 'KJFK', city_code: 'NYC', country_code: 'US' }
      },
      { name: 'iata minusculas', params: { iata_code: 'jfk' } },
      { name: 'icao minusculas', params: { icao_code: 'kjfk' } },
      { name: 'country minusculas', params: { country_code: 'us' }, allowLarge: true }
    ];

    validCases.forEach((testCase) => {
      it(testCase.name, () => {
        makeRequest(testCase.params).then((response) => {
          expect(response.status).to.eq(200);
          expect(response.body.success).to.eq(true);
          expect(response.body.data).to.be.an('array').and.not.be.empty;
          assertValidAirportItem(response.body.data[0], testCase.name);

          if (!testCase.allowLarge) {
            expect(response.body.data.length).to.be.lessThan(50);
          }
        });
      });
    });
  });

  describe('sin filtros / vacios', () => {
    it('sin ningun filtro', () => {
      makeRequest({}).then((response) => {
        cy.log(`status=${response.status} msg=${getMessage(response.body)}`);
        expect(response.status).to.be.oneOf([400, 404, 422]);
      });
    });

    it('iata_code vacio', () => {
      makeRequest({ iata_code: '' }, { includeEmpty: true }).then((response) => {
        cy.log(`status=${response.status} msg=${getMessage(response.body)}`);
        expect(response.status).to.be.oneOf([400, 404, 422]);
      });
    });
  });

  describe('formatos invalidos', () => {
    const invalidCases = [
      { name: 'iata_code 4 chars', params: { iata_code: 'ZZZZ' } },
      { name: 'iata_code 2 chars', params: { iata_code: 'JF' } },
      { name: 'iata_code numerico', params: { iata_code: '123' } },
      { name: 'icao_code corto', params: { icao_code: 'KJF' } },
      { name: 'icao_code largo', params: { icao_code: 'KJFKX' } },
      { name: 'city_code 2 chars', params: { city_code: 'NY' } },
      { name: 'country_code 3 chars', params: { country_code: 'USA' } },
      { name: 'country_code 1 char', params: { country_code: 'U' } }
    ];

    invalidCases.forEach((testCase) => {
      it(testCase.name, () => {
        makeRequest(testCase.params).then((response) => {
          cy.log(`status=${response.status} msg=${getMessage(response.body)}`);
          // Ideal: 400/422 de formato. Actual: suele ser 404 no-data.
          expect(response.status).to.be.oneOf([400, 404, 422]);
        });
      });
    });
  });

  describe('sin resultados / filtros conflictivos', () => {
    const emptyCases = [
      { name: 'iata inexistente ZZZ', params: { iata_code: 'ZZZ' } },
      { name: 'city inexistente ZZZ', params: { city_code: 'ZZZ' } },
      { name: 'country inexistente XX', params: { country_code: 'XX' } },
      {
        name: 'filtros conflictivos JFK + EGLL',
        params: { iata_code: 'JFK', icao_code: 'EGLL' }
      }
    ];

    emptyCases.forEach((testCase) => {
      it(testCase.name, () => {
        makeRequest(testCase.params).then((response) => {
          cy.log(
            `${testCase.name}: status=${response.status} dataType=${typeof response.body?.data} msg=${getMessage(response.body)}`
          );
          expect(response.status).to.be.oneOf([200, 404]);
        });
      });
    });
  });

  describe('parametros no documentados', () => {
    it('alias incorrecto iataCode', () => {
      makeRequest({ iataCode: 'JFK' }).then((response) => {
        cy.log(`status=${response.status} msg=${getMessage(response.body)}`);
        expect(response.status).to.be.oneOf([400, 404, 422]);
      });
    });

    it('parametro desconocido con filtro valido', () => {
      makeRequest({ iata_code: 'JFK', notAParam: 'x1' }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.success).to.eq(true);
        expect(response.body.data).to.be.an('array').and.not.be.empty;
      });
    });
  });

  describe('regression: mensajes y bugs mejorables', () => {
    const improvableCases = [
      {
        name: 'sin filtros responde no-data string',
        params: {},
        check: (r) =>
          r.status === 404 &&
          typeof r.body?.data === 'string' &&
          getMessage(r.body) === noDataMessage
      },
      {
        name: 'iata formato invalido como no-data',
        params: { iata_code: 'ZZZZ' },
        check: (r) => r.status === 404 && getMessage(r.body) === noDataMessage
      },
      {
        name: 'iata 2 chars como no-data',
        params: { iata_code: 'JF' },
        check: (r) => r.status === 404 && getMessage(r.body) === noDataMessage
      },
      {
        name: 'icao formato invalido como no-data',
        params: { icao_code: 'KJF' },
        check: (r) => r.status === 404 && getMessage(r.body) === noDataMessage
      },
      {
        name: 'country_code 3 chars como no-data',
        params: { country_code: 'USA' },
        check: (r) => r.status === 404 && getMessage(r.body) === noDataMessage
      },
      {
        name: 'city_code 2 chars como no-data',
        params: { city_code: 'NY' },
        check: (r) => r.status === 404 && getMessage(r.body) === noDataMessage
      },
      {
        name: 'no-data usa data como string',
        params: { iata_code: 'ZZZ' },
        check: (r) => r.status === 404 && typeof r.body?.data === 'string'
      },
      {
        name: 'filtros conflictivos como no-data string',
        params: { iata_code: 'JFK', icao_code: 'EGLL' },
        check: (r) =>
          r.status === 404 &&
          typeof r.body?.data === 'string' &&
          getMessage(r.body) === noDataMessage
      },
      {
        name: 'alias iataCode como no-data',
        params: { iataCode: 'JFK' },
        check: (r) => r.status === 404 && getMessage(r.body) === noDataMessage
      },
      {
        name: 'param desconocido ignorado',
        params: { iata_code: 'JFK', notAParam: 'x1' },
        check: (r) =>
          r.status === 200 && r.body?.success === true && Array.isArray(r.body?.data)
      },
      {
        name: 'iata vacio como no-data',
        params: { iata_code: '' },
        check: (r) => r.status === 404 && getMessage(r.body) === noDataMessage
      }
    ];

    const findings = [];

    improvableCases.forEach((testCase) => {
      it(`detecta: ${testCase.name}`, () => {
        const options = testCase.params.iata_code === '' ? { includeEmpty: true } : {};
        makeRequest(testCase.params, options).then((response) => {
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
        cy.log('Mensajes/bugs mejorables /airports-by-filter:');
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
