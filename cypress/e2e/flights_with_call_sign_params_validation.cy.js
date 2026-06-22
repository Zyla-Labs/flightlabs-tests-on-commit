const { getFlightlabsApiKey } = require('../support/api');

describe('Flights with call sign endpoint - combinaciones de parametros', () => {
  const ENDPOINT = '/flights-with-call-sign';

  const buildQuery = (params) => {
    const query = new URLSearchParams({ access_key: getFlightlabsApiKey() });

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        query.set(key, String(value));
      }
    });

    return `${ENDPOINT}?${query.toString()}`;
  };

  const makeRequest = (params) =>
    cy.request({
      method: 'GET',
      url: buildQuery(params),
      failOnStatusCode: false,
      timeout: 30000
    });

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

  it('responde con estructura consistente para combinaciones validas', () => {
    const validCases = [
      { name: 'solo callsign', params: { callsign: 'AAL73' } },
      { name: 'solo airline_icao', params: { airline_icao: 'AAL' } },
      { name: 'callsign + airline_icao', params: { callsign: 'AAL73', airline_icao: 'AAL' } },
      { name: 'sin filtros', params: {} },
      { name: 'airline_icao DAL', params: { airline_icao: 'DAL' } }
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

          expectedFlightFields.forEach((field) => {
            expect(flight, `${testCase.name}: campo ${field}`).to.have.property(field);
          });
        }
      });
    });
  });

  it('callsign sin vuelo activo devuelve 404 con mensaje claro', () => {
    makeRequest({ callsign: 'UAL1234' }).then((response) => {
      expect(response.status).to.eq(404);
      expect(response.body.success).to.eq(false);
      expect(response.body.message).to.be.a('string').and.not.be.empty;
    });
  });

  it('detecta flujos invalidos que deberian devolver error explicito', () => {
    const genericNotFoundMessage =
      'No active flight found for the given filter. Try another callsign or airline_icao.';

    const invalidCases = [
      {
        name: 'callsign vacio',
        params: { callsign: '' },
        issue: 'ignora filtro y devuelve feed completo'
      },
      {
        name: 'callsign solo numeros',
        params: { callsign: '12345' },
        issue: 'formato invalido responde como not-found generico'
      },
      {
        name: 'callsign con espacios',
        params: { callsign: 'AA L73' },
        issue: 'formato invalido responde como not-found generico'
      },
      {
        name: 'callsign demasiado largo',
        params: { callsign: 'A'.repeat(50) },
        issue: 'formato invalido responde como not-found generico'
      },
      {
        name: 'airline_icao corto',
        params: { airline_icao: 'AA' },
        issue: 'formato invalido responde como not-found generico'
      },
      {
        name: 'airline_icao demasiado largo',
        params: { airline_icao: 'AAAA' },
        issue: 'formato invalido responde como not-found generico'
      },
      {
        name: 'airline_icao numerico',
        params: { airline_icao: '123' },
        issue: 'formato invalido responde como not-found generico'
      },
      {
        name: 'callsign invalido + airline_icao valido',
        params: { callsign: '!!!', airline_icao: 'AAL' },
        issue: 'formato invalido responde como not-found generico'
      },
      {
        name: 'parametro no soportado',
        params: { notAParam: 'x1' },
        issue: 'ignora parametro desconocido y devuelve feed completo'
      },
      {
        name: 'alias incorrecto airlineIcao',
        params: { airlineIcao: 'AAL' },
        issue: 'ignora alias incorrecto y devuelve feed completo'
      }
    ];

    const findings = [];

    cy.wrap(invalidCases)
      .each((testCase) => {
        makeRequest(testCase.params).then((response) => {
          const body = response.body || {};
          const dataLen = Array.isArray(body.data) ? body.data.length : 0;

          const ignoresFilter =
            response.status === 200 && body.success === true && dataLen > 100;

          const formatErrorAsNotFound =
            response.status === 404 &&
            body.success === false &&
            body.message === genericNotFoundMessage &&
            testCase.issue.includes('formato invalido');

          const shouldFail = ignoresFilter || formatErrorAsNotFound;

          if (shouldFail) {
            findings.push({
              case: testCase.name,
              params: testCase.params,
              issue: testCase.issue,
              status: response.status,
              message: body.message,
              dataLen
            });
          }
        });
      })
      .then(() => {
        if (findings.length > 0) {
          cy.log('Casos con mensaje de error mejorable detectados:');
          findings.forEach((f) => {
            cy.log(
              `- ${f.case} | params=${JSON.stringify(f.params)} | status=${f.status} | body=${JSON.stringify(f.body)}`
            );
          });
        }

        expect(
          findings,
          `Se detectaron ${findings.length} combinaciones invalidas sin error explicito.`
        ).to.have.length(0);
      });
  });
});
