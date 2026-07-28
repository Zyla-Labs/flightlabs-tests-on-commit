const { getFlightlabsApiKey } = require('../support/api');

describe('Retrieve countries endpoint - validacion de parametros', () => {
  const ENDPOINT = '/retrieveCountries';
  const AIRPORTS_ENDPOINT = '/airports-by-filter';

  const expectedCountryFields = [
    'country',
    'countryCode',
    'market',
    'currencyTitle',
    'currency',
    'currencySymbol'
  ];

  const buildQuery = (params, { includeEmpty = false, includeAccessKey = true } = {}) => {
    const query = new URLSearchParams();

    if (includeAccessKey) {
      query.set('access_key', getFlightlabsApiKey());
    }

    Object.entries(params).forEach(([key, value]) => {
      if (key === 'access_key') return;
      if (value === undefined || value === null) return;
      if (!includeEmpty && value === '') return;
      query.set(key, String(value));
    });

    if (params.access_key !== undefined) {
      query.set('access_key', String(params.access_key));
    }

    return `${ENDPOINT}?${query.toString()}`;
  };

  const makeRequest = (params, options = {}) =>
    cy.request({
      method: options.method || 'GET',
      url: buildQuery(params, options),
      failOnStatusCode: false,
      timeout: 60000
    });

  const getMessage = (body = {}) => {
    if (typeof body.message === 'string') return body.message;
    if (typeof body.error === 'string') return body.error;
    if (typeof body.data === 'string') return body.data;
    return '';
  };

  const assertValidCountryItem = (country, label) => {
    expect(country, `${label}: item`).to.be.an('object');
    expectedCountryFields.forEach((field) => {
      expect(country, `${label}: campo ${field}`).to.have.property(field);
      expect(country[field], `${label}: ${field} no vacio`).to.not.equal('');
    });
  };

  describe('request valida', () => {
    it('baseline con access_key', () => {
      makeRequest({}).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.success).to.eq(true);
        expect(response.body.data).to.be.an('array').and.not.be.empty;
        expect(response.body.data.length).to.be.greaterThan(100);
        assertValidCountryItem(response.body.data[0], 'baseline');
      });
    });

    it('incluye United States con countryCode US', () => {
      makeRequest({}).then((response) => {
        const us = response.body.data.find((c) => c.countryCode === 'US');
        expect(us, 'US en lista').to.exist;
        expect(us.country).to.eq('United States');
        expect(us.currency).to.eq('USD');
      });
    });

    it('incluye United Kingdom con countryCode UK (no GB)', () => {
      makeRequest({}).then((response) => {
        const uk = response.body.data.find((c) => c.country === 'United Kingdom');
        expect(uk, 'United Kingdom en lista').to.exist;
        expect(uk.countryCode).to.eq('UK');
        const gb = response.body.data.find((c) => c.countryCode === 'GB');
        expect(gb, 'GB no deberia existir segun ISO').to.not.exist;
      });
    });
  });

  describe('calidad de datos', () => {
    it('todos los items tienen campos documentados', () => {
      makeRequest({}).then((response) => {
        response.body.data.forEach((country, index) => {
          assertValidCountryItem(country, `item[${index}]`);
        });
      });
    });

    it('countryCode unico por pais', () => {
      makeRequest({}).then((response) => {
        const codes = response.body.data.map((c) => c.countryCode);
        const unique = new Set(codes);
        expect(unique.size, 'sin countryCode duplicados').to.eq(codes.length);
      });
    });

    it('countryCode formato 2 letras mayusculas (con excepcion UK documentada)', () => {
      makeRequest({}).then((response) => {
        response.body.data.forEach((country) => {
          expect(country.countryCode).to.match(/^[A-Z]{2}$/);
        });
      });
    });
  });

  describe('access_key', () => {
    it('sin access_key', () => {
      cy.request({
        method: 'GET',
        url: ENDPOINT,
        failOnStatusCode: false
      }).then((response) => {
        cy.log(`status=${response.status} msg=${getMessage(response.body)}`);
        expect(response.status).to.eq(401);
        expect(getMessage(response.body)).to.include('API Key');
      });
    });

    it('access_key vacio', () => {
      makeRequest({ access_key: '' }, { includeEmpty: true, includeAccessKey: false }).then(
        (response) => {
          cy.log(`status=${response.status} msg=${getMessage(response.body)}`);
          expect(response.status).to.eq(400);
          expect(getMessage(response.body).toLowerCase()).to.include('invalid access key');
        }
      );
    });

    it('access_key invalido', () => {
      makeRequest(
        { access_key: 'invalid_key_12345' },
        { includeAccessKey: false }
      ).then((response) => {
        cy.log(`status=${response.status} msg=${getMessage(response.body)}`);
        expect(response.status).to.eq(401);
      });
    });
  });

  describe('parametros no documentados', () => {
    const undocumentedCases = [
      { name: 'notAParam', params: { notAParam: 'x1' } },
      { name: 'countryCode US', params: { countryCode: 'US' } },
      { name: 'country_code US', params: { country_code: 'US' } },
      { name: 'limit 5', params: { limit: '5' } },
      { name: 'limit 0', params: { limit: '0' } },
      { name: 'skip 5', params: { skip: '5' } }
    ];

    undocumentedCases.forEach((testCase) => {
      it(`${testCase.name} (comportamiento actual)`, () => {
        makeRequest(testCase.params).then((response) => {
          cy.log(
            `${testCase.name}: status=${response.status} dataLen=${response.body?.data?.length}`
          );
          expect(response.status).to.eq(200);
          expect(response.body.success).to.eq(true);
          expect(response.body.data).to.be.an('array');
          expect(response.body.data.length).to.be.greaterThan(100);
        });
      });
    });

    it('metodo POST no permitido', () => {
      makeRequest({}, { method: 'POST' }).then((response) => {
        cy.log(`status=${response.status}`);
        expect(response.status).to.eq(405);
      });
    });
  });

  describe('compatibilidad con airports-by-filter', () => {
    it('country_code GB en airports no coincide con countryCode UK en retrieveCountries', () => {
      makeRequest({}).then((countriesResponse) => {
        const ukEntry = countriesResponse.body.data.find((c) => c.country === 'United Kingdom');
        expect(ukEntry.countryCode).to.eq('UK');

        cy.request({
          method: 'GET',
          url: `${AIRPORTS_ENDPOINT}?access_key=${getFlightlabsApiKey()}&country_code=GB`,
          failOnStatusCode: false,
          timeout: 60000
        }).then((airportsResponse) => {
          expect(airportsResponse.status).to.eq(200);
          expect(airportsResponse.body.data).to.be.an('array').and.not.be.empty;
          expect(airportsResponse.body.data[0].country_code).to.eq('GB');

          cy.request({
            method: 'GET',
            url: `${AIRPORTS_ENDPOINT}?access_key=${getFlightlabsApiKey()}&country_code=UK`,
            failOnStatusCode: false,
            timeout: 60000
          }).then((ukAirportsResponse) => {
            cy.log(
              `airports country_code=UK: status=${ukAirportsResponse.status} msg=${getMessage(ukAirportsResponse.body)}`
            );
            expect(ukAirportsResponse.status).to.eq(404);
          });
        });
      });
    });
  });

  describe('regression: mensajes y bugs mejorables', () => {
    const improvableCases = [
      {
        name: 'countryCode UK en vez de ISO GB',
        params: {},
        check: (r) => {
          if (!Array.isArray(r.body?.data)) return false;
          const uk = r.body.data.find((c) => c.country === 'United Kingdom');
          return uk?.countryCode === 'UK';
        }
      },
      {
        name: 'param countryCode ignorado',
        params: { countryCode: 'US' },
        check: (r) =>
          r.status === 200 &&
          Array.isArray(r.body?.data) &&
          r.body.data.length > 1
      },
      {
        name: 'param limit ignorado',
        params: { limit: '5' },
        check: (r) =>
          r.status === 200 &&
          Array.isArray(r.body?.data) &&
          r.body.data.length > 10
      },
      {
        name: 'param skip ignorado',
        params: { skip: '5' },
        check: (r) =>
          r.status === 200 &&
          Array.isArray(r.body?.data) &&
          r.body.data.length > 10
      },
      {
        name: 'param desconocido ignorado',
        params: { notAParam: 'x1' },
        check: (r) => r.status === 200 && r.body?.success === true
      },
      {
        name: 'access_key invalido mensaje generico',
        params: { access_key: 'invalid_key_12345' },
        options: { includeAccessKey: false },
        check: (r) =>
          r.status === 401 &&
          getMessage(r.body) === 'You need to get your API Key to do API calls.'
      },
      {
        name: 'sin access_key mismo mensaje que invalido',
        params: {},
        options: { includeAccessKey: false, useBareEndpoint: true },
        check: (r) =>
          r.status === 401 &&
          getMessage(r.body) === 'You need to get your API Key to do API calls.'
      }
    ];

    const findings = [];

    improvableCases.forEach((testCase) => {
      it(`detecta: ${testCase.name}`, () => {
        const requestOptions = testCase.options || {};

        if (requestOptions.useBareEndpoint) {
          cy.request({
            method: 'GET',
            url: ENDPOINT,
            failOnStatusCode: false
          }).then((response) => {
            if (testCase.check(response)) {
              findings.push({
                case: testCase.name,
                params: { access_key: '[MISSING]' },
                status: response.status,
                message: getMessage(response.body)
              });
            }
          });
          return;
        }

        makeRequest(testCase.params, requestOptions).then((response) => {
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
        cy.log('Mensajes/bugs mejorables /retrieveCountries:');
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
