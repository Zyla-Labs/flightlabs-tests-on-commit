const { getFlightlabsApiKey } = require('../support/api');

describe('Flights endpoint - combinaciones de parametros', () => {
  const buildQuery = (params) => {
    const query = new URLSearchParams({ access_key: getFlightlabsApiKey() });

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        query.set(key, String(value));
      }
    });

    return `/flights?${query.toString()}`;
  };

  const makeRequest = (params) =>
    cy.request({
      method: 'GET',
      url: buildQuery(params),
      failOnStatusCode: false,
      timeout: 30000
    });

  it('responde con estructura consistente para combinaciones validas', () => {
    const validCases = [
      { name: 'solo limit', params: { limit: 10 } },
      { name: 'airlineIata', params: { limit: 10, airlineIata: 'AA' } },
      { name: 'airlineIcao', params: { limit: 10, airlineIcao: 'AAL' } },
      { name: 'flightIata', params: { limit: 5, flightIata: 'AA100' } },
      { name: 'flightIcao', params: { limit: 5, flightIcao: 'AAL100' } },
      { name: 'flightNum', params: { limit: 5, flightNum: '100' } },
      { name: 'depIata + arrIata', params: { limit: 10, depIata: 'JFK', arrIata: 'LAX' } },
      { name: 'depIcao + arrIcao', params: { limit: 10, depIcao: 'KJFK', arrIcao: 'KLAX' } },
      { name: 'regNum', params: { limit: 5, regNum: 'N12345' } },
      { name: 'hex', params: { limit: 5, hex: 'aabbcc' } },
      { name: 'filtro compuesto', params: { limit: 10, airlineIata: 'AA', depIata: 'JFK' } }
    ];

    cy.wrap(validCases).each((testCase) => {
      makeRequest(testCase.params).then((response) => {
        expect(response.status, `${testCase.name}: status`).to.eq(200);
        expect(response.body, `${testCase.name}: body`).to.be.an('object');
        expect(response.body).to.have.property('success');
        expect(response.body.success, `${testCase.name}: success`).to.be.a('boolean');
        expect(response.body).to.have.property('data');
        expect(response.body.data, `${testCase.name}: data`).to.be.an('array');

        if (response.body.data.length > 0) {
          const flight = response.body.data[0];
          expect(flight, `${testCase.name}: item[0]`).to.be.an('object');
          expect(flight).to.have.property('status');
          expect(flight).to.have.property('updated');
        }
      });
    });
  });

  it('detecta flujos invalidos que deberian devolver error explicito', () => {
    const invalidCases = [
      { name: 'limit texto', params: { limit: 'abc' } },
      { name: 'limit negativo', params: { limit: -5 } },
      { name: 'limit cero', params: { limit: 0 } },
      { name: 'limit muy alto', params: { limit: 10001 } },
      { name: 'airlineIata demasiado largo', params: { airlineIata: 'AAAAD' } },
      { name: 'airlineIata numerico', params: { airlineIata: '12' } },
      { name: 'airlineIcao corto', params: { airlineIcao: 'AA' } },
      { name: 'flightIata formato invalido', params: { flightIata: '123' } },
      { name: 'flightIcao formato invalido', params: { flightIcao: 'A1' } },
      { name: 'depIata invalido', params: { depIata: 'ZZZZ' } },
      { name: 'arrIata invalido', params: { arrIata: '123' } },
      { name: 'depIcao invalido', params: { depIcao: 'ABCD1' } },
      { name: 'arrIcao invalido', params: { arrIcao: 'X' } },
      { name: 'hex invalido', params: { hex: 'ZZZZZZ' } },
      { name: 'regNum vacio', params: { regNum: '' } },
      { name: 'parametro no soportado', params: { notAParam: 'x1' } }
    ];

    const findings = [];

    cy.wrap(invalidCases).each((testCase) => {
      makeRequest(testCase.params).then((response) => {
        const body = response.body || {};
        const hasBodyError =
          typeof body.error === 'string' ||
          (body.error && typeof body.error === 'object') ||
          (typeof body.message === 'string' && body.message.trim() !== '');

        const hasMeaningfulError = response.status >= 400 || body.success === false || hasBodyError;
        const silentSuccessWithEmptyData =
          response.status === 200 &&
          body.success === true &&
          Array.isArray(body.data) &&
          body.data.length === 0;

        if (!hasMeaningfulError || silentSuccessWithEmptyData) {
          findings.push({
            case: testCase.name,
            status: response.status,
            body
          });
        }
      });
    }).then(() => {
      if (findings.length > 0) {
        cy.log('Casos con mensaje de error mejorable detectados:');
        findings.forEach((f) => {
          cy.log(`- ${f.case} | status=${f.status} | body=${JSON.stringify(f.body)}`);
        });
      }

      expect(
        findings,
        `Se detectaron ${findings.length} combinaciones invalidas sin error explicito.`
      ).to.have.length(0);
    });
  });
});
