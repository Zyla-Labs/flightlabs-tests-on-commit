const { getFlightlabsApiKey } = require('../support/api');

describe('Retrieve airlines endpoint - validacion de parametros', () => {
  const ENDPOINT = '/airlines';

  const noDataMessage =
    'No data found, please try again or contact with us hello@goflightlabs.com';

  const expectedAirlineFields = [
    'name',
    'country_code',
    'iata_code',
    'iata_prefix',
    'iata_accounting',
    'icao_code',
    'callsign',
    'is_international',
    'iosa_registered',
    'iosa_expiry',
    'is_passenger',
    'is_cargo',
    'is_scheduled',
    'total_aircrafts',
    'average_fleet_age',
    'accidents_last_5y',
    'crashes_last_5y',
    'website',
    'twitter',
    'facebook',
    'instagram',
    'linkedin',
    'airline_logo'
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

  const assertValidAirlineItem = (airline, label, { requireLogo = true } = {}) => {
    expect(airline, `${label}: item`).to.be.an('object');
    expectedAirlineFields.forEach((field) => {
      if (!requireLogo && field === 'airline_logo') return;
      expect(airline, `${label}: campo ${field}`).to.have.property(field);
    });
  };

  describe('combinaciones validas', () => {
    const validCases = [
      { name: 'codeIataAirline AA', params: { codeIataAirline: 'AA' } },
      { name: 'codeIso2Country US', params: { codeIso2Country: 'US' }, allowLarge: true },
      {
        name: 'codeIataAirline + codeIso2Country',
        params: { codeIataAirline: 'AA', codeIso2Country: 'US' }
      },
      { name: 'iata minusculas', params: { codeIataAirline: 'aa' } },
      { name: 'country minusculas', params: { codeIso2Country: 'us' }, allowLarge: true },
      { name: 'sin filtros (lista completa)', params: {}, allowLarge: true }
    ];

    validCases.forEach((testCase) => {
      it(testCase.name, () => {
        makeRequest(testCase.params).then((response) => {
        if (response.status === 429) return;
          expect(response.status).to.eq(200);
          expect(response.body.success).to.eq(true);
          expect(response.body.data).to.be.an('array').and.not.be.empty;

          if (testCase.allowLarge) {
            expect(response.body.data[0]).to.have.property('name');
            expect(response.body.data[0]).to.have.property('country_code');
          } else {
            assertValidAirlineItem(response.body.data[0], testCase.name);
          }

          if (testCase.params.codeIataAirline) {
            const expectedIata = testCase.params.codeIataAirline.toUpperCase();
            response.body.data.forEach((airline, index) => {
              expect(
                airline.iata_code,
                `${testCase.name}: item[${index}] iata_code`
              ).to.eq(expectedIata);
            });
          }

          if (!testCase.allowLarge) {
            expect(response.body.data.length).to.be.lessThan(50);
          }
        });
      });
    });
  });

  describe('calidad de datos por filtro', () => {
    it('AA devuelve todos los campos documentados con airline_logo', () => {
      makeRequest({ codeIataAirline: 'AA' }).then((response) => {
        if (response.status === 429) return;
        assertValidAirlineItem(response.body.data[0], 'AA');
        expect(response.body.data[0].airline_logo).to.be.a('string').and.not.be.empty;
      });
    });

    it('US incluye airline_logo en todas las aerolineas', () => {
      makeRequest({ codeIso2Country: 'US' }).then((response) => {
        if (response.status === 429) return;
        const withoutLogo = response.body.data.filter((airline) => !('airline_logo' in airline));
        cy.log(`US sin airline_logo: ${withoutLogo.length}/${response.body.data.length}`);
        expect(withoutLogo.length).to.eq(0);
      });
    });
  });

  describe('filtros vacios', () => {
    it('codeIataAirline vacio', () => {
      makeRequest({ codeIataAirline: '' }, { includeEmpty: true }).then((response) => {
        if (response.status === 429) return;
        expect(response.status).to.eq(400);
        expect(response.body.success).to.eq(false);
        expect(getMessage(response.body)).to.eq('codeIataAirline cannot be empty when provided');
      });
    });

    it('codeIso2Country vacio', () => {
      makeRequest({ codeIso2Country: '' }, { includeEmpty: true }).then((response) => {
        if (response.status === 429) return;
        expect(response.status).to.eq(400);
        expect(response.body.success).to.eq(false);
        expect(getMessage(response.body)).to.eq('codeIso2Country cannot be empty when provided');
      });
    });
  });

  describe('formatos invalidos', () => {
    const invalidCases = [
      { name: 'iata 4 chars', params: { codeIataAirline: 'ZZZZ' } },
      { name: 'iata numerico', params: { codeIataAirline: '123' } },
      { name: 'country 3 chars', params: { codeIso2Country: 'USA' } },
      { name: 'country 1 char', params: { codeIso2Country: 'U' } },
      { name: 'icao en campo iata (AAL)', params: { codeIataAirline: 'AAL' } }
    ];

    invalidCases.forEach((testCase) => {
      it(testCase.name, () => {
        makeRequest(testCase.params).then((response) => {
        if (response.status === 429) return;
          cy.log(`status=${response.status} msg=${getMessage(response.body)}`);
          expect(response.status).to.be.oneOf([400, 404, 422]);
        });
      });
    });
  });

  describe('sin resultados / filtros conflictivos', () => {
    const emptyCases = [
      { name: 'iata inexistente ZZ', params: { codeIataAirline: 'ZZ' } },
      { name: 'country inexistente XX', params: { codeIso2Country: 'XX' } },
      {
        name: 'filtros conflictivos AA + BR',
        params: { codeIataAirline: 'AA', codeIso2Country: 'BR' },
        expectedStatus: 400,
        expectedMsg: 'No airline matches both codeIataAirline and codeIso2Country'
      }
    ];

    emptyCases.forEach((testCase) => {
      it(testCase.name, () => {
        makeRequest(testCase.params).then((response) => {
        if (response.status === 429) return;
          cy.log(
            `${testCase.name}: status=${response.status} dataType=${typeof response.body?.data} msg=${getMessage(response.body)}`
          );
          if (testCase.expectedStatus) {
            expect(response.status).to.eq(testCase.expectedStatus);
            expect(getMessage(response.body)).to.eq(testCase.expectedMsg);
            return;
          }
          expect(response.status).to.be.oneOf([200, 404]);
        });
      });
    });
  });

  describe('ambiguedad iata corto', () => {
    it('iata 1 char', () => {
      makeRequest({ codeIataAirline: 'A' }).then((response) => {
        if (response.status === 429) return;
        expect(response.status).to.eq(400);
        expect(response.body.success).to.eq(false);
        expect(getMessage(response.body)).to.eq('codeIataAirline must be a 2-character IATA code');
      });
    });
  });

  describe('country UK vs GB', () => {
    it('UK y GB devuelven la misma cantidad', () => {
      makeRequest({ codeIso2Country: 'UK' }).then((ukResponse) => {
        if (ukResponse.status === 429) return;
        expect(ukResponse.status).to.eq(200);
        expect(ukResponse.body.data).to.be.an('array').and.not.be.empty;

        makeRequest({ codeIso2Country: 'GB' }).then((gbResponse) => {
        if (gbResponse.status === 429) return;
          expect(gbResponse.status).to.eq(200);
          expect(gbResponse.body.data).to.be.an('array').and.not.be.empty;
          cy.log(`UK=${ukResponse.body.data.length} GB=${gbResponse.body.data.length}`);
          expect(ukResponse.body.data.length).to.eq(gbResponse.body.data.length);
        });
      });
    });
  });

  describe('parametros no documentados', () => {
    it('alias incorrecto iata_code', () => {
      makeRequest({ iata_code: 'AA' }).then((response) => {
        if (response.status === 429) return;
        expect(response.status).to.eq(400);
        expect(response.body.success).to.eq(false);
        expect(getMessage(response.body)).to.eq(
          'Unknown query parameter: iata_code. Did you mean codeIataAirline?'
        );
      });
    });

    it('alias incorrecto code_iata_airline', () => {
      makeRequest({ code_iata_airline: 'AA' }).then((response) => {
        if (response.status === 429) return;
        expect(response.status).to.eq(400);
        expect(response.body.success).to.eq(false);
        expect(getMessage(response.body)).to.eq('Unknown query parameter: code_iata_airline');
      });
    });

    it('parametro desconocido con filtro valido', () => {
      makeRequest({ codeIataAirline: 'AA', notAParam: 'x1' }).then((response) => {
        if (response.status === 429) return;
        expect(response.status).to.eq(400);
        expect(response.body.success).to.eq(false);
        expect(getMessage(response.body)).to.eq('Unknown query parameter: notAParam');
      });
    });
  });

  describe('regression: mensajes y bugs mejorables', () => {
    const improvableCases = [
      {
        name: 'iata vacio devuelve lista completa',
        params: { codeIataAirline: '' },
        options: { includeEmpty: true },
        check: (r) =>
          r.status === 200 &&
          Array.isArray(r.body?.data) &&
          r.body.data.length > 1000
      },
      {
        name: 'country vacio devuelve lista completa',
        params: { codeIso2Country: '' },
        options: { includeEmpty: true },
        check: (r) =>
          r.status === 200 &&
          Array.isArray(r.body?.data) &&
          r.body.data.length > 1000
      },
      {
        name: 'icao en campo iata como no-data',
        params: { codeIataAirline: 'AAL' },
        check: (r) => r.status === 404 && getMessage(r.body) === noDataMessage
      },
      {
        name: 'iata formato invalido como no-data',
        params: { codeIataAirline: 'ZZZZ' },
        check: (r) => r.status === 404 && getMessage(r.body) === noDataMessage
      },
      {
        name: 'country formato invalido como no-data',
        params: { codeIso2Country: 'USA' },
        check: (r) => r.status === 404 && getMessage(r.body) === noDataMessage
      },
      {
        name: 'no-data usa data como string',
        params: { codeIataAirline: 'ZZ' },
        check: (r) => r.status === 404 && typeof r.body?.data === 'string'
      },
      {
        name: 'filtros conflictivos como no-data string',
        params: { codeIataAirline: 'AA', codeIso2Country: 'BR' },
        check: (r) =>
          r.status === 404 &&
          typeof r.body?.data === 'string' &&
          getMessage(r.body) === noDataMessage
      },
      {
        name: 'alias iata_code ignorado',
        params: { iata_code: 'AA' },
        check: (r) =>
          r.status === 200 &&
          Array.isArray(r.body?.data) &&
          r.body.data.length > 1000
      },
      {
        name: 'param desconocido ignorado',
        params: { codeIataAirline: 'AA', notAParam: 'x1' },
        check: (r) => r.status === 200 && r.body?.success === true
      },
      {
        name: 'iata 1 char match incorrecto',
        params: { codeIataAirline: 'A' },
        check: (r) => {
          if (r.status !== 200 || !Array.isArray(r.body?.data) || !r.body.data[0]) {
            return false;
          }
          return r.body.data[0].iata_code !== 'A';
        }
      },
      {
        name: 'UK y GB resultados inconsistentes',
        params: { codeIso2Country: 'UK' },
        check: () => true,
        asyncCheck: () =>
          cy
            .request({
              method: 'GET',
              url: buildQuery({ codeIso2Country: 'UK' }),
              failOnStatusCode: false,
              timeout: 120000
            })
            .then((ukResponse) =>
              cy
                .request({
                  method: 'GET',
                  url: buildQuery({ codeIso2Country: 'GB' }),
                  failOnStatusCode: false,
                  timeout: 120000
                })
                .then((gbResponse) => {
        if (gbResponse.status === 429) return;
                  const ukLen = ukResponse.body?.data?.length || 0;
                  const gbLen = gbResponse.body?.data?.length || 0;
                  return (
                    ukResponse.status === 200 &&
                    gbResponse.status === 200 &&
                    ukLen > 0 &&
                    gbLen > 0 &&
                    ukLen !== gbLen
                  );
                })
            )
      },
      {
        name: 'country US sin airline_logo en muchos items',
        params: { codeIso2Country: 'US' },
        check: (r) => {
          if (!Array.isArray(r.body?.data)) return false;
          const withoutLogo = r.body.data.filter((airline) => !('airline_logo' in airline));
          return withoutLogo.length > r.body.data.length * 0.5;
        }
      }
    ];

    const findings = [];

    improvableCases.forEach((testCase) => {
      it(`detecta: ${testCase.name}`, () => {
        const options = testCase.options || {};

        if (testCase.asyncCheck) {
          testCase.asyncCheck().then((matched) => {
            if (matched) {
              findings.push({
                case: testCase.name,
                params: { ...testCase.params, access_key: '[REDACTED]' },
                status: 200,
                message: 'UK y GB devuelven cantidades distintas de aerolineas'
              });
            }
          });
          return;
        }

        makeRequest(testCase.params, options).then((response) => {
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
                : typeof response.body?.data,
              dataLen: Array.isArray(response.body?.data) ? response.body.data.length : null
            });
          }
        });
      });
    });

    after(() => {
      if (findings.length > 0) {
        cy.log('Mensajes/bugs mejorables /airlines:');
        findings.forEach((f) => {
          cy.log(
            `- ${f.case} | params=${JSON.stringify(f.params)} | status=${f.status} | msg=${f.message} | dataType=${f.dataType} | dataLen=${f.dataLen}`
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
