const getFlightlabsApiKey = () => {
  const key = Cypress.env('FLIGHTLABS_API_KEY');

  if (!key) {
    throw new Error(
      'FLIGHTLABS_API_KEY no está definida. ' +
        'Crea un archivo .env en la raíz del proyecto o configura la variable de entorno FLIGHTLABS_API_KEY.'
    );
  }

  return key;
};

module.exports = { getFlightlabsApiKey };
