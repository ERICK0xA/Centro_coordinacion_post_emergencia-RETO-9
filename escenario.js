/* ==========================================================================
   ESCENARIO DE DEMOSTRACION · San Salvador (datos ficticios)
   Las coordenadas son aproximadas; el servicio de rutas ajusta cada punto a la
   calle más cercana. Para cambiar de ciudad solo editar solo este archivo
   ========================================================================== */
window.ESCENARIO = {
  area: 'Área metropolitana de San Salvador',

  // Siniestros activos (filtro de la barra superior)
  EVENTOS: [
    { id: 'sismo', label: 'Terremoto' },
    { id: 'inundacion', label: 'Inundación' },
    { id: 'deslizamiento', label: 'Deslizamiento / alud' },
    { id: 'incendio', label: 'Incendio' }
  ],

  // Significado de las siglas de las instalaciones (leyenda del mapa)
  FACILITY_TYPES: [
    { short: 'H', label: 'Hospital', color: '#2475b8' },
    { short: 'B', label: 'Estación de bomberos', color: '#b43d35' },
    { short: 'CR', label: 'Cruz Roja / Comandos de Salvamento', color: '#c0392b' },
    { short: 'COE', label: 'Centro de Operaciones de Emergencia y acopio', color: '#152a40' },
    { short: 'MOP', label: 'Obras Públicas: plantel de maquinaria', color: '#7a5a2b' },
    { short: 'AL', label: 'Albergue', color: '#27744f' }
  ],

  // Zonas: dan nombre a cada punto (se toma la mas cercana)
  ZONES: [
    { name: 'Centro Histórico', lat: 13.6985, lng: -89.1915 },
    { name: 'Colonia Escalón', lat: 13.7045, lng: -89.2390 },
    { name: 'San Benito', lat: 13.6930, lng: -89.2380 },
    { name: 'Mejicanos', lat: 13.7400, lng: -89.2130 },
    { name: 'Ayutuxtepeque', lat: 13.7450, lng: -89.2010 },
    { name: 'Ciudad Delgado', lat: 13.7240, lng: -89.1700 },
    { name: 'Soyapango', lat: 13.7105, lng: -89.1450 },
    { name: 'Ilopango', lat: 13.7020, lng: -89.1100 },
    { name: 'San Jacinto', lat: 13.6860, lng: -89.1880 },
    { name: 'San Marcos', lat: 13.6590, lng: -89.1830 },
    { name: 'Los Planes de Renderos', lat: 13.6470, lng: -89.1830 },
    { name: 'Antiguo Cuscatlán', lat: 13.6730, lng: -89.2440 },
    { name: 'Santa Tecla', lat: 13.6770, lng: -89.2790 }
  ],

  // Instalaciones (nombres genericos de ejemplo)
  FACILITIES: [
    { id: 'hosp', short: 'H', name: 'Hospital de referencia', color: '#2475b8', lat: 13.6978, lng: -89.2045 },
    { id: 'hosp2', short: 'H', name: 'Hospital regional (Mejicanos)', color: '#2475b8', lat: 13.7365, lng: -89.2085 },
    { id: 'bomb', short: 'B', name: 'Estación de bomberos central', color: '#b43d35', lat: 13.7005, lng: -89.1975 },
    { id: 'bomb2', short: 'B', name: 'Estación de bomberos (Soyapango)', color: '#b43d35', lat: 13.7060, lng: -89.1520 },
    { id: 'crz', short: 'CR', name: 'Base de Cruz Roja / Comandos', color: '#c0392b', lat: 13.7030, lng: -89.2105 },
    { id: 'crz2', short: 'CR', name: 'Base de Cruz Roja (Santa Tecla)', color: '#c0392b', lat: 13.6745, lng: -89.2770 },
    { id: 'coe', short: 'COE', name: 'COE y centro de acopio', color: '#152a40', lat: 13.6920, lng: -89.2170 },
    { id: 'mop', short: 'MOP', name: 'Plantel de maquinaria', color: '#7a5a2b', lat: 13.7190, lng: -89.1820 },
    { id: 'alb1', short: 'AL', name: 'Albergue escuela (Soyapango)', color: '#27744f', lat: 13.7090, lng: -89.1480 },
    { id: 'alb2', short: 'AL', name: 'Albergue polideportivo (Mejicanos)', color: '#27744f', lat: 13.7380, lng: -89.2100 }
  ],

  // Unidades: 4 de cada tipo, cada una sale de una instalacion
  UNITS: [
    { id: 'R-1', type: 'rescate', name: 'Equipo USAR de Bomberos', at: 'bomb' },
    { id: 'R-2', type: 'rescate', name: 'Comandos de Salvamento', at: 'crz' },
    { id: 'R-3', type: 'rescate', name: 'Rescate Cruz Roja Santa Tecla', at: 'crz2' },
    { id: 'R-4', type: 'rescate', name: 'Brigada de rescate Soyapango', at: 'bomb2' },
    { id: 'A-1', type: 'ambulancia', name: 'Ambulancia Hospital 1', at: 'hosp' },
    { id: 'A-2', type: 'ambulancia', name: 'Ambulancia Hospital 2', at: 'hosp' },
    { id: 'A-3', type: 'ambulancia', name: 'Ambulancia Cruz Roja', at: 'crz' },
    { id: 'A-4', type: 'ambulancia', name: 'Ambulancia Hospital regional', at: 'hosp2' },
    { id: 'B-1', type: 'bomberos', name: 'Autobomba central', at: 'bomb' },
    { id: 'B-2', type: 'bomberos', name: 'Cisterna de bomberos', at: 'bomb' },
    { id: 'B-3', type: 'bomberos', name: 'Autobomba Soyapango', at: 'bomb2' },
    { id: 'B-4', type: 'bomberos', name: 'Unidad de rescate vehicular', at: 'bomb2' },
    { id: 'L-1', type: 'acuatico', name: 'Lancha Cruz Roja', at: 'crz' },
    { id: 'L-2', type: 'acuatico', name: 'Lancha de Comandos', at: 'crz' },
    { id: 'L-3', type: 'acuatico', name: 'Lancha de bomberos', at: 'bomb2' },
    { id: 'L-4', type: 'acuatico', name: 'Bote inflable municipal', at: 'coe' },
    { id: 'M-1', type: 'maquinaria', name: 'Retroexcavadora', at: 'mop' },
    { id: 'M-2', type: 'maquinaria', name: 'Cargador municipal', at: 'coe' },
    { id: 'M-3', type: 'maquinaria', name: 'Excavadora', at: 'mop' },
    { id: 'M-4', type: 'maquinaria', name: 'Camión grúa', at: 'mop' },
    { id: 'S-1', type: 'insumos', name: 'Camión cisterna (agua)', at: 'coe' },
    { id: 'S-2', type: 'insumos', name: 'Camión de víveres', at: 'coe' },
    { id: 'S-3', type: 'insumos', name: 'Pick-up de insumos médicos', at: 'hosp' },
    { id: 'S-4', type: 'insumos', name: 'Camión de colchonetas y kits', at: 'coe' }
  ],

  // Casos iniciales
  CASES: [
    { id: 201, evento: 'sismo', type: 'atrapados', lat: 13.6995, lng: -89.1930, people: 6, vuln: 1, minAgo: 95, reports: 3, source: 'Llamada 911', note: 'Edificio de 3 niveles colapsado. Se escuchan voces bajo los escombros.' },
    { id: 202, evento: 'inundacion', type: 'inundacion', lat: 13.7195, lng: -89.1745, people: 14, vuln: 5, minAgo: 140, reports: 2, source: 'WhatsApp', note: 'Desborde del río: familias sobre los techos, el agua llega a 1.5 m.' },
    { id: 203, evento: 'deslizamiento', type: 'deslizamiento', lat: 13.6505, lng: -89.1850, people: null, vuln: 0, minAgo: 60, reports: 1, source: 'Brigadista en campo', verified: true, note: 'Deslave sepultó 2 viviendas. No se sabe cuántas personas había dentro.' },
    { id: 204, evento: 'sismo', type: 'herido', lat: 13.7420, lng: -89.2150, people: 1, vuln: 1, minAgo: 50, reports: 1, source: 'SMS', note: 'Adulto mayor con fractura expuesta.' },
    { id: 205, evento: 'incendio', type: 'incendio', lat: 13.7110, lng: -89.1430, people: 8, vuln: 0, minAgo: 20, reports: 2, source: 'Llamada 911', note: 'Fuga de gas y conato de incendio en el mercado.' },
    { id: 206, evento: 'sismo', type: 'albergue', lat: 13.7093, lng: -89.1484, people: 120, vuln: 30, minAgo: 300, reports: 1, source: 'Brigadista en campo', verified: true, note: 'Albergue en escuela sin agua potable.' },
    { id: 207, evento: 'sismo', type: 'herido', lat: 13.6870, lng: -89.1870, people: 2, vuln: 0, minAgo: 35, reports: 1, source: 'Llamada 911', note: 'Dos heridos por caída de techo.', assignedTo: 'A-3' },
    { id: 208, evento: 'inundacion', type: 'inundacion', lat: 13.6990, lng: -89.1080, people: 5, vuln: 2, minAgo: 80, reports: 1, source: 'SMS', note: 'Vivienda anegada, la familia se refugió en el segundo piso.' },
    { id: 209, evento: 'sismo', type: 'atrapados', lat: 13.7050, lng: -89.2400, people: 1, vuln: 0, minAgo: 25, reports: 1, source: 'WhatsApp', note: 'Persona atrapada en un vehículo bajo un poste caído.' },
    { id: 210, evento: 'sismo', type: 'herido', lat: 13.6760, lng: -89.2800, people: 1, vuln: 1, minAgo: 40, reports: 1, source: 'Llamada 911', note: 'Embarazada con contracciones; no puede salir porque la calle tiene escombros.' },
    { id: 211, evento: 'inundacion', type: 'albergue', lat: 13.7383, lng: -89.2104, people: 60, vuln: 15, minAgo: 200, reports: 1, source: 'Brigadista en campo', verified: true, note: 'Albergue polideportivo: faltan colchonetas y alimentos.' }
  ],

  // Bloqueos que existen al iniciar. «nearCase» lo coloca sobre la via de acceso real
  // de ese caso, «metersBefore» metros antes de llegar (segun la ruta de OSRM).
  // A menos de 35 m del destino el bloqueo corta todos los accesos por carretera
  PRESET_BLOCKS: [
    { nearCase: 203, metersBefore: 25, name: 'Deslave en la calle de acceso', cause: 'Reporte de brigadista' }
  ],

  // Reportes que llegan al pulsar «Simular llegada de reportes» (algunos son duplicados a proposito)
  BATCHES: [
    [
      { evento: 'sismo', type: 'atrapados', lat: 13.6993, lng: -89.1927, people: 8, vuln: 2, source: 'SMS', note: 'Vecinos confirman: al menos 8 personas dentro del edificio.' },
      { evento: 'sismo', type: 'atrapados', lat: 13.6600, lng: -89.1820, people: 2, vuln: 1, source: 'WhatsApp', note: 'Muro caído sobre una vivienda, un niño atrapado.' },
      { evento: 'inundacion', type: 'inundacion', lat: 13.7262, lng: -89.1690, people: 6, vuln: 4, source: 'Radio', verified: true, note: 'El agua sigue subiendo; adultos mayores no pueden salir.' },
      { evento: 'sismo', type: 'herido', lat: 13.7418, lng: -89.2147, people: 1, vuln: 1, source: 'Llamada 911', note: 'Un familiar insiste: el adulto mayor tiene sangrado abundante.' },
      { evento: 'sismo', type: 'herido', lat: 13.6745, lng: -89.2420, people: 1, vuln: 0, source: 'SMS', note: 'Motorista herido por un cable eléctrico caído.' }
    ],
    [
      { evento: 'incendio', type: 'incendio', lat: 13.7455, lng: -89.2005, people: null, vuln: 0, source: 'WhatsApp', note: 'Sale humo de una bodega; no se sabe si hay personas.' },
      { evento: 'inundacion', type: 'inundacion', lat: 13.7197, lng: -89.1746, people: 20, vuln: 6, source: 'Brigadista en campo', verified: true, note: 'Brigadista confirma: 20 personas sobre los techos.' },
      { evento: 'inundacion', type: 'albergue', lat: 13.7382, lng: -89.2102, people: 90, vuln: 20, source: 'Radio', note: 'Llegaron 30 personas más al polideportivo.' },
      { evento: 'sismo', type: 'atrapados', lat: 13.6935, lng: -89.2395, people: 3, vuln: 0, source: 'Llamada 911', note: 'Derrumbe parcial en un taller, 3 trabajadores atrapados.' }
    ]
  ]
};
