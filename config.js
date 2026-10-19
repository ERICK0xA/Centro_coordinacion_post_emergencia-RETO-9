/* ==========================================================================
   CONFIGURACION
   ========================================================================== */
window.APP_CONFIG = {
  // Servicio de rutas OSRM. El servidor publico sirve para la demostracion;
  // en produccion se instala un OSRM propio en el COE con el mapa del pais
  OSRM_URL: 'https://router.project-osrm.org',

  // Mapa base: 'auto' usa OpenStreetMap si la pagina se abre desde un servidor
  // (http://localhost o un dominio) y Esri si se abre con doble clic (file://).
  // También puede fijarse en 'osm', 'esri' o 'satelite'
  BASEMAP: 'auto',

  CENTER: { lat: 13.6990, lng: -89.2000 },  // San Salvador
  ZOOM: 13,

  // Una ruta que pase a menos de esta distancia de un bloqueo se considera cortada
  BLOCK_RADIUS_M: 35,

  // Multiplicador opcional de los tiempos de OSRM (1 = condiciones normales de transito)
  TIME_FACTOR: 1,

  // Segundos de espera antes de integrar los reportes nuevos a la lista
  // Mientras tanto se muestra el aviso y una cuenta regresiva
  NEW_REPORT_DELAY_S: 6,

  // Operadores autorizados. SOLO PARA LA DEMOSTRACION: en un sistema real
  // las contraseñas nunca se guardan en el navegador; se validan en un servidor
  OPERADORES: [
    { usuario: 'kcarranza', nombre: 'Karla Carranza', clave: 'Rally2026!' }
  ]
};
