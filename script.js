'use strict';

document.addEventListener('DOMContentLoaded', () => {

  const CFG = window.APP_CONFIG || {};
  const SC = window.ESCENARIO;
  const OSRM = (CFG.OSRM_URL || 'https://router.project-osrm.org').replace(/\/$/, '');
  const BLOCK_R = CFG.BLOCK_RADIUS_M || 35;
  const TIME_FACTOR = CFG.TIME_FACTOR || 1;
  const ASSUMED_PEOPLE = 3;

  /* =======================================================================
     1. CATALOGOS
     g = gravedad base · tStep = minutos por punto de urgencia · tMax = tope
     units = tipos de unidad en orden de preferencia
     ======================================================================= */
  const TYPES = {
    atrapados:     { label: 'Personas atrapadas', g: 40, tStep: 10, tMax: 18, units: ['rescate', 'bomberos'],
                     why: 'Hay que localizar y sacar a personas bajo escombros: se necesita un equipo de búsqueda y rescate con herramientas para remover y apuntalar.',
                     alt: 'Si no hay equipo de rescate libre, bomberos cuenta con equipo de corte y extracción para iniciar el rescate.' },
    deslizamiento: { label: 'Deslizamiento sobre viviendas', g: 35, tStep: 12, tMax: 15, units: ['rescate', 'bomberos'],
                     why: 'Puede haber personas bajo tierra y lodo: se necesita un equipo de rescate que busque y estabilice la zona.',
                     alt: 'Bomberos puede apoyar con búsqueda y extracción si no hay equipo de rescate libre.' },
    herido:        { label: 'Heridos graves', g: 35, tStep: 6, tMax: 15, units: ['ambulancia', 'rescate'],
                     why: 'La persona necesita atención médica y traslado a un hospital: se necesita una ambulancia.',
                     alt: 'Si no hay ambulancia libre, un equipo de rescate da primeros auxilios y estabiliza hasta el traslado.' },
    incendio:      { label: 'Incendio o fuga de gas', g: 32, tStep: 5, tMax: 15, units: ['bomberos'],
                     why: 'Se necesita una autobomba con personal entrenado para controlar el fuego o cerrar la fuga de gas.',
                     alt: '' },
    inundacion:    { label: 'Familias aisladas por agua', g: 30, tStep: 15, tMax: 15, units: ['acuatico', 'rescate'],
                     why: 'Las personas están rodeadas por agua: se necesita una lancha para evacuarlas con seguridad.',
                     alt: 'Si no hay lancha libre, un equipo de rescate puede evacuar a pie si el nivel del agua lo permite.' },
    albergue:      { label: 'Albergue sin agua o insumos', g: 6, tStep: 30, tMax: 10, units: ['insumos'],
                     why: 'Se necesita un camión con agua, víveres, colchonetas o insumos médicos para el albergue.',
                     alt: '' }
  };

  const UNIT_DESC = {
    rescate: 'Equipo de búsqueda y rescate: herramientas para remover escombros, cuerdas y primeros auxilios.',
    ambulancia: 'Atención prehospitalaria y traslado de heridos a un hospital.',
    bomberos: 'Control de incendios y fugas, corte y extracción de personas atrapadas.',
    acuatico: 'Lancha o bote para evacuar personas en zonas inundadas.',
    maquinaria: 'Equipo pesado para despejar vías bloqueadas por escombros o deslaves.',
    insumos: 'Transporte de agua, víveres, colchonetas e insumos médicos.'
  };

  const UNIT_TYPES = {
    rescate: 'Rescate', ambulancia: 'Ambulancia', bomberos: 'Bomberos',
    acuatico: 'Rescate acuático', maquinaria: 'Maquinaria', insumos: 'Insumos'
  };

  // Siniestro por defecto según el tipo de caso (editable en el formulario)
  const DEFAULT_EVENT = { atrapados: 'sismo', deslizamiento: 'deslizamiento', herido: 'sismo', incendio: 'incendio', inundacion: 'inundacion', albergue: 'sismo' };
  const EVENTS = Object.fromEntries((SC.EVENTOS || []).map(e => [e.id, e.label]));
  const SEVERE = new Set(['atrapados', 'deslizamiento', 'herido', 'incendio']);
  const NEW_DELAY = (CFG.NEW_REPORT_DELAY_S || 6) * 1000;
  const NEW_TAG_MS = 3 * 60000;

  const LEVEL = {
    crit: { label: 'Crítica', color: '#b43d35' },
    high: { label: 'Alta', color: '#c9661a' },
    mod: { label: 'Moderada', color: '#2468a8' }
  };

  /* =======================================================================
     2. UTILIDADES
     ======================================================================= */
  const $ = s => document.querySelector(s);
  const now = () => Date.now();
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const fmtMin = m => `${Math.max(1, Math.round(m))} min`;
  const fmtKm = m => `${(m / 1000).toFixed(1)} km`;
  const hhmm = t => new Date(t).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;

  function fmtAgo(mins) {
    mins = Math.max(0, Math.round(mins));
    if (mins < 1) return 'justo ahora';
    if (mins < 60) return `hace ${mins} min`;
    const h = Math.floor(mins / 60), m = mins % 60;
    return m ? `hace ${h} h ${m} min` : `hace ${h} h`;
  }

  // Distancia en metros entre dos puntos
  function meters(a, b) {
    const R = 6371000, toRad = x => x * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  // Distancia en metros de un punto p a un segmento a-b (proyección local)
  function distToSegment(p, a, b) {
    const kx = 111320 * Math.cos(p.lat * Math.PI / 180), ky = 110540;
    const ax = (a.lng - p.lng) * kx, ay = (a.lat - p.lat) * ky;
    const bx = (b.lng - p.lng) * kx, by = (b.lat - p.lat) * ky;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    return Math.hypot(ax + t * dx, ay + t * dy);
  }

  function pathHits(path, block) {
    for (let i = 0; i < path.length - 1; i++) if (distToSegment(block, path[i], path[i + 1]) <= BLOCK_R) return true;
    return path.length === 1 && meters(path[0], block) <= BLOCK_R;
  }

  const blocksOn = (path, excludeId) => state.blocks.filter(b => b.id !== excludeId && pathHits(path, b));

  // Punto sobre la ruta a cierta distancia antes del destino
  function pointBefore(path, dist) {
    let acc = 0;
    for (let i = path.length - 1; i > 0; i--) {
      const seg = meters(path[i], path[i - 1]);
      if (seg > 0 && acc + seg >= dist) {
        const t = (dist - acc) / seg;
        return { lat: path[i].lat + (path[i - 1].lat - path[i].lat) * t, lng: path[i].lng + (path[i - 1].lng - path[i].lng) * t };
      }
      acc += seg;
    }
    return { lat: path[0].lat, lng: path[0].lng };
  }

  function zoneOf(pos) {
    let best = SC.ZONES[0], bd = Infinity;
    SC.ZONES.forEach(z => { const d = meters(pos, z); if (d < bd) { bd = d; best = z; } });
    return best.name;
  }

  /* =======================================================================
     3. ESTADO
     ======================================================================= */
  const START = now();
  const facById = Object.fromEntries(SC.FACILITIES.map(f => [f.id, f]));

  const state = {
    cases: SC.CASES.map(c => ({
      id: c.id, type: c.type, evento: c.evento || DEFAULT_EVENT[c.type], pos: { lat: c.lat, lng: c.lng }, zone: zoneOf(c),
      people: c.people ?? null, vuln: c.vuln || 0, reports: c.reports || 1, source: c.source,
      verified: !!c.verified, adj: 0, status: 'pendiente', unitId: null,
      reportedAt: START - (c.minAgo || 0) * 60000,
      notes: [{ t: START - (c.minAgo || 0) * 60000, source: c.source, text: c.note }]
    })),
    units: SC.UNITS.map(u => {
      const f = facById[u.at];
      return { ...u, pos: { lat: f.lat, lng: f.lng }, home: f.name, status: 'disponible', caseId: null, blockId: null, route: null };
    }),
    blocks: [],
    log: [],
    plan: [],
    planning: true,
    planNote: '',
    nextId: Math.max(...SC.CASES.map(c => c.id)) + 1,
    nextBlock: 1,
    selected: null,
    panel: 'case',            // 'case' | 'form'
    blockMode: false,
    showHeat: false,
    form: { type: 'atrapados', pos: null },
    batch: 0,
    totalReports: 0,
    merged: 0,
    flashId: null,
    operator: null,           // operador con sesión iniciada
    filterEvent: 'todos',     // filtro de siniestro
    filterStatus: 'todos',    // 'todos' | 'sin' | 'con'
    inbox: [],                // reportes recibidos que aún no se integran a la lista
    inboxDeadline: 0,
    sound: true,
    manual: {},               // unidad elegida a mano por caso: { unitId, status, route }
    pickOpen: {},             // selector "Elegir otra unidad" abierto por caso
    planEta: new Map(),       // tiempos de la matriz del último plan (unidad|caso → min)
    planReserved: new Map()   // unidad → caso al que el plan la reservó
  };
  state.totalReports = state.cases.reduce((s, c) => s + c.reports, 0);

  const caseById = id => state.cases.find(c => c.id === id);
  const unitById = id => state.units.find(u => u.id === id);
  const blockById = id => state.blocks.find(b => b.id === id);

  // who: 'sys' (sistema) | 'op' (operador) | 'field' (equipos en campo)
  function addLog(who, text, t = now(), actor) {
    if (!actor) actor = who === 'op' ? (state.operator ? state.operator.nombre : 'Operador') : who === 'field' ? 'Equipo en campo' : 'Sistema';
    state.log.push({ t, who, actor, text });
    state.log.sort((a, b) => b.t - a.t);
  }

  const opName = () => (state.operator ? state.operator.nombre : 'Operador');

  /* =======================================================================
     4. PRIORIDAD
     (Gravedad + Personas + Vulnerables + Tiempo) × Confianza ± Ajuste
     ======================================================================= */
  function scoreCase(c) {
    const t = TYPES[c.type];
    const known = c.people != null;
    const n = known ? c.people : ASSUMED_PEOPLE;
    const mins = (now() - c.reportedAt) / 60000;
    const G = t.g;
    const P = Math.min(20, Math.round(5 * Math.log2(1 + n)));
    const V = Math.min(12, (c.vuln || 0) * 4);
    const T = Math.min(t.tMax, Math.round(mins / t.tStep));
    const base = G + P + V + T;
    let conf, confWhy;
    if (c.verified) { conf = 1; confWhy = 'verificado en campo'; }
    else if (c.reports >= 3) { conf = 1; confWhy = `${c.reports} reportes coinciden`; }
    else if (c.reports === 2) { conf = 0.95; confWhy = '2 reportes coinciden'; }
    else { conf = 0.85; confWhy = 'un solo reporte, sin verificar'; }
    const total = Math.max(0, Math.min(100, Math.round(base * conf) + (c.adj || 0)));
    const level = total >= 65 ? 'crit' : total >= 45 ? 'high' : 'mod';
    return { G, P, V, T, n, known, mins, base, conf, confWhy, total, level };
  }

  /* =======================================================================
     5. RUTAS REALES CON OSRM
     - /table: tiempos de todas las unidades libres a todos los casos (1 llamada)
     - /route: geometría y rutas alternativas para la unidad elegida
     Si OSRM no responde, se estima por distancia y la operación continúa.
     ======================================================================= */
  const routing = { status: 'pending', offUntil: 0, cache: new Map(), tableCache: new Map(), chain: Promise.resolve(), lastAt: 0 };

  function setRouting(ok) {
    if (ok) routing.status = 'ok';
    else { routing.status = 'off'; routing.offUntil = now() + 60000; }
    const el = $('#conn');
    el.classList.toggle('ok', routing.status === 'ok');
    el.classList.toggle('off', routing.status === 'off');
    $('#conn-text').textContent = routing.status === 'ok'
      ? 'Rutas reales por carretera (OSRM)'
      : 'Servicio de rutas no disponible: tiempos estimados';
  }

  const routingAvailable = () => routing.status !== 'off' || now() > routing.offUntil;

  // Cola de peticiones: una a la vez y con una pausa corta, para respetar el servidor público
  function osrmFetch(url) {
    const run = routing.chain.then(async () => {
      const wait = Math.max(0, routing.lastAt + 220 - now());
      if (wait) await sleep(wait);
      routing.lastAt = now();
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 9000);
      try {
        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return await res.json();
      } finally { clearTimeout(timer); }
    });
    routing.chain = run.catch(() => {});
    return run;
  }

  function estimate(o, d, via) {
    const m = (via ? meters(o, via) + meters(via, d) : meters(o, d)) * 1.35;
    return { min: m / (25000 / 60), meters: m, path: via ? [o, via, d] : [o, d], estimated: true };
  }

  const ll = p => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`;

  // via (opcional): punto intermedio para forzar un desvío
  async function getRoutes(o, d, via) {
    const key = via ? `${ll(o)};${ll(via)};${ll(d)}` : `${ll(o)};${ll(d)}`;
    if (routing.cache.has(key)) return routing.cache.get(key);
    if (routingAvailable()) {
      try {
        const data = await osrmFetch(`${OSRM}/route/v1/driving/${key}?overview=full&geometries=geojson&alternatives=${via ? 'false' : 'true'}`);
        if (data.code === 'Ok' && data.routes && data.routes.length) {
          setRouting(true);
          const alts = data.routes.map(r => ({
            min: r.duration / 60 * TIME_FACTOR,
            meters: r.distance,
            path: r.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }))
          }));
          routing.cache.set(key, alts);
          return alts;
        }
        if (data.code === 'NoRoute') { routing.cache.set(key, []); return []; }
      } catch (err) {
        console.warn('OSRM /route no respondió:', err.message);
        setRouting(false);
      }
    }
    return [estimate(o, d, via)]; // no se guarda: se reintenta cuando vuelva el servicio
  }

  // Desplaza un punto «dist» metros en la dirección (dx, dy) expresada en metros
  function offsetPoint(p, dx, dy) {
    return { lat: p.lat + dy / 110540, lng: p.lng + dx / (111320 * Math.cos(p.lat * Math.PI / 180)) };
  }

  /* Si todas las rutas de OSRM cruzan un bloqueo, se busca un desvío real:
     se pide a OSRM una ruta que pase por un punto alrededor del bloqueo
     (a 300, 600 y 1000 m) y se toma la más rápida que no lo cruce. */
  async function detour(o, d, fastest, excludeId) {
    const hits = blocksOn(fastest.path, excludeId);
    if (!hits.length) return null;
    // Si el bloqueo está pegado al origen o al destino, no hay desvío posible
    if (hits.some(b => meters(b, d) <= BLOCK_R * 2 || meters(b, o) <= BLOCK_R * 2)) return null;
    const b = hits[0];
    let bi = 0, bd = Infinity;
    for (let i = 0; i < fastest.path.length - 1; i++) {
      const dd = distToSegment(b, fastest.path[i], fastest.path[i + 1]);
      if (dd < bd) { bd = dd; bi = i; }
    }
    const a = fastest.path[bi], c = fastest.path[bi + 1] || fastest.path[bi];
    const kx = 111320 * Math.cos(b.lat * Math.PI / 180), ky = 110540;
    let vx = (c.lng - a.lng) * kx, vy = (c.lat - a.lat) * ky;
    const len = Math.hypot(vx, vy) || 1;
    vx /= len; vy /= len;
    // Candidatos: a los lados del bloqueo (300, 600, 1000 m) y en diagonal, antes y después
    const rings = [
      [[0, 300], [0, -300]],
      [[0, 600], [0, -600], [-400, 500], [-400, -500], [400, 500], [400, -500]],
      [[0, 1000], [0, -1000]]
    ];
    for (const ring of rings) {
      const found = [];
      for (const [along, side] of ring) {
        const via = offsetPoint(b, vx * along - vy * side, vy * along + vx * side);
        const alts = await getRoutes(o, d, via);
        const ok = alts.find(r => !blocksOn(r.path, excludeId).length);
        if (ok) found.push({ ...ok, detour: true });
      }
      if (found.length) return found.sort((x, y) => x.min - y.min)[0];
    }
    return null;
  }

  // Mejor ruta que no cruce bloqueos: alternativas de OSRM y, si hace falta, desvío
  async function bestRoute(o, d, excludeId, allowDetour = true) {
    const alts = await getRoutes(o, d);
    if (!alts.length) return { status: 'noroute' };
    const fastest = alts[0];
    const ok = alts.find(a => !blocksOn(a.path, excludeId).length);
    if (ok) return { status: 'ok', route: ok, fastest };
    if (!allowDetour) return { status: 'blocked', fastest };
    const det = await detour(o, d, fastest, excludeId);
    if (det) return { status: 'ok', route: det, fastest };
    return { status: 'blocked', fastest };
  }

  async function etaMatrix(units, cases) {
    const out = new Map();
    if (!units.length || !cases.length) return out;
    const coords = [...units.map(u => u.pos), ...cases.map(c => c.pos)].map(ll).join(';');
    const src = units.map((_, i) => i).join(';');
    const dst = cases.map((_, j) => units.length + j).join(';');
    const url = `${OSRM}/table/v1/driving/${coords}?sources=${src}&destinations=${dst}&annotations=duration`;
    let data = routing.tableCache.get(url) || null;
    if (!data && routingAvailable()) {
      try {
        data = await osrmFetch(url);
        if (data.code === 'Ok') { routing.tableCache.set(url, data); setRouting(true); } else data = null;
      } catch (err) {
        console.warn('OSRM /table no respondió:', err.message);
        setRouting(false);
        data = null;
      }
    }
    units.forEach((u, i) => cases.forEach((c, j) => {
      const s = data ? data.durations[i][j] : null;
      out.set(u.id + '|' + c.id, data ? (s == null ? Infinity : s / 60 * TIME_FACTOR) : estimate(u.pos, c.pos).min);
    }));
    return out;
  }

  /* =======================================================================
     6. PLAN DE ASIGNACIÓN
     Recorre los casos pendientes de mayor a menor prioridad. Para cada uno,
     prueba las unidades adecuadas más rápidas y elige la primera ruta que no
     pase por un bloqueo. Si todas están cortadas, propone despejar con maquinaria.
     ======================================================================= */
  async function computePlan(pending) {
    const pool = state.units.filter(u => u.status === 'disponible');
    const eta = await etaMatrix(pool, pending);
    const targeted = new Map();
    const reserved = new Map();
    const rows = [];

    for (const c of pending) {
      const t = TYPES[c.type];
      let best = null, ref = null;
      const evaluated = {};   // unidades a las que se les pidió ruta y su resultado

      for (let tier = 0; tier < t.units.length && !best; tier++) {
        const cands = pool.filter(u => u.type === t.units[tier])
          .map(u => ({ u, e: eta.get(u.id + '|' + c.id) }))
          .filter(x => x.e !== Infinity)
          .sort((a, b) => a.e - b.e)
          .slice(0, 2);
        // Primero sin desvíos (pocas consultas); el desvío se intenta después solo si hace falta
        for (const { u } of cands) {
          const res = await bestRoute(u.pos, c.pos, undefined, false);
          evaluated[u.id] = { status: res.status, min: res.route ? res.route.min : (res.fastest ? res.fastest.min : null) };
          if (res.status === 'noroute') continue;
          if (!ref) ref = { u, alt: res.fastest, tier };
          if (res.status === 'ok' && (!best || res.route.min < best.r.min)) best = { u, r: res.route, fastest: res.fastest, alt: tier > 0 };
        }
      }

      // Todas las rutas cruzan un bloqueo: buscar un desvío para la unidad más rápida
      if (!best && ref) {
        const det = await detour(ref.u.pos, c.pos, ref.alt);
        if (det) best = { u: ref.u, r: det, fastest: ref.alt, alt: ref.tier > 0 };
      }

      if (best) {
        pool.splice(pool.indexOf(best.u), 1);
        reserved.set(best.u.id, c.id);
        evaluated[best.u.id] = { status: 'ok', min: best.r.min };
        const avoided = best.r === best.fastest ? [] : blocksOn(best.fastest.path);
        rows.push({ kind: 'assign', caseId: c.id, unitId: best.u.id, route: best.r, alt: best.alt, avoided, delay: best.r.min - best.fastest.min, evaluated });
        continue;
      }
      if (!ref) {
        const anyType = pool.some(u => t.units.includes(u.type));
        rows.push({ kind: anyType ? 'noroute' : 'none', caseId: c.id, evaluated });
        continue;
      }

      const hit = blocksOn(ref.alt.path)[0];
      if (!hit) { rows.push({ kind: 'noroute', caseId: c.id, evaluated }); continue; }
      if (hit.clearing) { rows.push({ kind: 'waiting', caseId: c.id, blockId: hit.id, unitId: hit.clearing, evaluated }); continue; }
      if (targeted.has(hit.id)) { rows.push({ kind: 'waiting', caseId: c.id, blockId: hit.id, sameAs: targeted.get(hit.id), evaluated }); continue; }

      let machine = null;
      const machines = pool.filter(u => u.type === 'maquinaria').sort((a, b) => meters(a.pos, hit) - meters(b.pos, hit)).slice(0, 2);
      for (const u of machines) {
        const res = await bestRoute(u.pos, { lat: hit.lat, lng: hit.lng }, hit.id);
        if (res.status === 'ok' && (!machine || res.route.min < machine.r.min)) machine = { u, r: res.route };
      }
      if (machine) {
        pool.splice(pool.indexOf(machine.u), 1);
        reserved.set(machine.u.id, c.id);
        targeted.set(hit.id, c.id);
        rows.push({ kind: 'clear', caseId: c.id, unitId: machine.u.id, blockId: hit.id, route: machine.r, evaluated });
      } else {
        rows.push({ kind: 'blocked', caseId: c.id, blockId: hit.id, evaluated });
      }
    }
    state.planEta = eta;
    state.planReserved = reserved;
    return rows;
  }

  let planGen = 0, planTimer = null;
  function replan(note) {
    if (note) state.planNote = note;
    clearTimeout(planTimer);
    state.planning = true;
    renderQueue();
    planTimer = setTimeout(async () => {
      const gen = ++planGen;
      try {
        const plan = await computePlan(sortedPending());
        if (gen !== planGen) return;
        state.plan = plan;
      } catch (err) {
        console.error(err);
      }
      if (gen !== planGen) return;
      state.planning = false;
      renderAll();
    }, 250);
  }

  const rowFor = id => state.plan.find(r => r.caseId === id);

  /* =======================================================================
     7. ACCIONES
     ======================================================================= */
  function approve(caseId, silent = false) {
    const c = caseById(caseId);
    const planned = rowFor(caseId);
    const man = state.manual[caseId];
    // Si el operador eligió otra unidad, se aprueba esa
    const row = man && man.status === 'ok'
      ? { kind: 'assign', caseId, unitId: man.unitId, route: man.route, manual: true, recommended: planned && planned.kind === 'assign' ? planned.unitId : null }
      : planned;
    if (!row || !c || c.status !== 'pendiente') return false;
    const u = unitById(row.unitId);
    if (!u || u.status !== 'disponible') return false;

    if (row.kind === 'assign') {
      c.status = 'asignado'; c.unitId = u.id;
      c.assignedBy = opName(); c.assignedAt = now();
      Object.assign(u, { status: 'en_ruta', caseId: c.id, route: row.route, from: { ...u.pos } });
      c.manualUnit = !!row.manual;
      addLog('op', row.manual
        ? `Eligió y envió ${u.id} (${u.name}, ${UNIT_TYPES[u.type].toLowerCase()}) al caso #${c.id} en ${c.zone}${row.recommended && row.recommended !== u.id ? `, en lugar de ${row.recommended} que recomendaba el sistema` : ''}. Llegada estimada: ${fmtMin(row.route.min)}.`
        : `Envió ${u.id} (${u.name}) al caso #${c.id}, ${TYPES[c.type].label.toLowerCase()} en ${c.zone}. Llegada estimada: ${fmtMin(row.route.min)}.`);
    } else if (row.kind === 'clear') {
      const b = blockById(row.blockId);
      if (!b) return false;
      Object.assign(u, { status: 'despejando', blockId: b.id, route: row.route, from: { ...u.pos } });
      b.clearing = u.id;
      b.clearingBy = opName();
      addLog('op', `Envió ${u.id} (${u.name}) a despejar "${b.name}" para abrir acceso al caso #${c.id}.`);
    } else return false;

    state.plan = state.plan.filter(r => r.caseId !== caseId);
    delete state.manual[caseId];
    delete state.pickOpen[caseId];
    if (!silent) replan(`${opName()} aprobó la asignación del caso #${c.id}. Recalculando el resto.`);
    return true;
  }

  // Aprueba las recomendaciones de los casos visibles con el filtro de siniestro
  function approveAll() {
    const rows = state.plan.filter(r => (r.kind === 'assign' || r.kind === 'clear') && matchesEvent(caseById(r.caseId)));
    let n = 0;
    rows.forEach(r => { if (approve(r.caseId, true)) n++; });
    if (n) replan(`${opName()} aprobó ${plural(n, 'asignación', 'asignaciones')}.`);
    renderAll();
  }

  function finishTask(unitId) {
    const u = unitById(unitId);
    if (!u) return;
    if (u.status === 'en_ruta') {
      const c = caseById(u.caseId);
      if (c) {
        c.status = 'atendido';
        u.pos = { ...c.pos };
        addLog('op', `Registró el cierre del caso #${c.id}: ${u.id} informa que fue atendido y queda disponible en ${c.zone}.`);
        if (state.selected === c.id) state.selected = null;
      }
      replan(`${u.id} quedó libre en ${c ? c.zone : 'su ubicación'}.`);
    } else if (u.status === 'despejando') {
      const b = blockById(u.blockId);
      if (b) {
        state.blocks = state.blocks.filter(x => x !== b);
        u.pos = { lat: b.lat, lng: b.lng };
        addLog('op', `Registró que ${u.id} despejó "${b.name}". La vía queda habilitada.`);
      }
      replan('Se habilitó una vía. Recalculando rutas.');
    }
    Object.assign(u, { status: 'disponible', caseId: null, blockId: null, route: null });
    renderAll();
  }

  function addBlock(pos, name, cause, silent = false) {
    const b = { id: 'b' + state.nextBlock++, lat: pos.lat, lng: pos.lng, name: name || `Bloqueo en ${zoneOf(pos)}`, cause: cause || `Marcado por ${opName()}`, clearing: null };
    state.blocks.push(b);
    if (!silent) {
      addLog('op', `Marcó una vía bloqueada: ${b.name}.`);
      rerouteActiveUnits(b);
      replan(`Nuevo bloqueo en ${zoneOf(pos)}. Recalculando rutas.`);
    }
    return b;
  }

  function removeBlock(b) {
    if (b.clearing) {
      const m = unitById(b.clearing);
      if (m) Object.assign(m, { status: 'disponible', blockId: null, route: null });
    }
    state.blocks = state.blocks.filter(x => x !== b);
    addLog('op', `Retiró el bloqueo: ${b.name}.`);
    replan('Se retiró un bloqueo. Recalculando rutas.');
    renderAll();
  }

  // Si una unidad en camino usaba la vía que se bloqueó, se busca otra ruta
  async function rerouteActiveUnits(b) {
    const affected = state.units.filter(u => u.status === 'en_ruta' && u.route && !u.rerouting && pathHits(u.route.path, b));
    affected.forEach(u => { u.rerouting = true; });
    if (affected.length) renderAll();
    for (const u of affected) {
      const c = caseById(u.caseId);
      const res = await bestRoute(u.from || u.pos, c.pos);
      u.rerouting = false;
      if (u.status !== 'en_ruta' || u.caseId !== c.id) continue;
      const ok = res.status === 'ok' ? res.route : null;
      if (ok) {
        const diff = Math.round(ok.min - u.route.min);
        u.route = ok;
        c.rerouted = true;
        addLog('sys', `Ruta de ${u.id} hacia el caso #${c.id} recalculada por "${b.name}": se usa una ruta alterna (${diff >= 0 ? '+' : ''}${diff} min).`);
      } else {
        Object.assign(u, { status: 'disponible', caseId: null, route: null });
        c.status = 'pendiente'; c.unitId = null;
        addLog('sys', `${u.id} ya no puede llegar al caso #${c.id} por "${b.name}". El caso vuelve a la lista.`);
      }
    }
    if (affected.length) { replan(); renderAll(); }
  }

  // Al seleccionar un caso con unidad en camino, se verifica que su ruta siga libre
  async function ensureRouteClear(c) {
    if (!c || c.status !== 'asignado') return;
    const u = unitById(c.unitId);
    if (!u || !u.route || u.rerouting) return;
    const hit = blocksOn(u.route.path)[0];
    if (hit) await rerouteActiveUnits(hit);
  }

  function adjust(caseId, delta) {
    const c = caseById(caseId);
    c.adj = (c.adj || 0) + delta;
    addLog('op', `${delta > 0 ? 'Subió' : 'Bajó'} la prioridad del caso #${c.id} (${delta > 0 ? '+' : ''}${delta}).`);
    replan(`Ajuste manual en el caso #${c.id}.`);
    renderAll();
  }

  function verify(caseId) {
    const c = caseById(caseId);
    c.verified = true;
    addLog('op', `Marcó el caso #${c.id} como verificado.`);
    replan(`Caso #${c.id} verificado.`);
    renderAll();
  }

  const findDuplicate = rep => state.cases.find(c => c.status !== 'atendido' && c.type === rep.type && meters(c.pos, { lat: rep.lat, lng: rep.lng }) <= 150);

  // Registra un reporte; si coincide con un caso abierto del mismo tipo a menos de 150 m, se agrupa.
  // byOperator: lo registró el operador desde el formulario (si no, llegó por un canal externo)
  function ingest(rep, byOperator = false) {
    const pos = { lat: rep.lat, lng: rep.lng };
    const dup = findDuplicate(rep);
    state.totalReports++;
    const note = { t: now(), source: rep.source, text: rep.note || 'Sin descripción.' };
    if (dup) {
      dup.reports++;
      if (rep.people != null) dup.people = dup.people == null ? rep.people : Math.max(dup.people, rep.people);
      dup.vuln = Math.max(dup.vuln || 0, rep.vuln || 0);
      if (rep.verified) dup.verified = true;
      dup.notes.push(note);
      state.merged++;
      if (!byOperator) { dup.newTag = 'Actualizado'; dup.newAt = now(); }
      if (byOperator) addLog('op', `Registró un reporte (${rep.source}) que se agrupó con el caso #${dup.id} (${dup.reports} reportes).`);
      else addLog('sys', `Reporte recibido por ${rep.source} y agrupado con el caso #${dup.id} (${dup.reports} reportes).`);
      return { merged: true, c: dup };
    }
    const c = {
      id: state.nextId++, type: rep.type, evento: rep.evento || DEFAULT_EVENT[rep.type], pos, zone: zoneOf(pos),
      people: rep.people ?? null, vuln: rep.vuln || 0, reports: 1, source: rep.source,
      verified: !!rep.verified, adj: 0, status: 'pendiente', unitId: null,
      reportedAt: now(), notes: [note],
      newTag: byOperator ? null : 'Nuevo', newAt: now()
    };
    state.cases.push(c);
    if (byOperator) addLog('op', `Registró el caso #${c.id} (${rep.source}): ${TYPES[c.type].label.toLowerCase()} en ${c.zone}.`);
    else addLog('sys', `Nuevo caso #${c.id} recibido por ${rep.source}: ${TYPES[c.type].label.toLowerCase()} en ${c.zone}.`);
    return { merged: false, c };
  }

  /* =======================================================================
     8. MAPA (Leaflet + OpenStreetMap)
     ======================================================================= */
  let map = null;
  const layers = {};

  /* Mapas base. OpenStreetMap exige el encabezado «Referer», que no se envía
     cuando la página se abre con doble clic (file://): en ese caso se usa Esri.
     Si OSM rechaza las teselas, se cambia a Esri automáticamente. */
  const BASEMAPS = {
    osm: {
      name: 'Calles (OpenStreetMap)',
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      options: { maxZoom: 19, attribution: '&copy; OpenStreetMap' }
    },
    esri: {
      name: 'Calles (Esri)',
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
      options: { maxZoom: 19, attribution: 'Mapa &copy; Esri' }
    },
    satelite: {
      name: 'Satélite (Esri)',
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      options: { maxZoom: 19, attribution: 'Imágenes &copy; Esri' }
    }
  };

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src; el.onload = resolve; el.onerror = reject;
      document.head.appendChild(el);
    });
  }

  function loadCss(href) {
    const el = document.createElement('link');
    el.rel = 'stylesheet'; el.href = href;
    document.head.appendChild(el);
  }

  // Si unpkg está bloqueado en la red, se intenta Leaflet desde otros CDN
  async function ensureLeaflet() {
    if (window.L) return true;
    const mirrors = [
      'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/',
      'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/'
    ];
    for (const base of mirrors) {
      try {
        loadCss(base + 'leaflet.css');
        await loadScript(base + 'leaflet.js');
        if (window.L) return true;
      } catch (err) {
        console.warn('No se pudo cargar Leaflet desde', base);
      }
    }
    return false;
  }

  function initMap() {
    if (!window.L) {
      $('#map').innerHTML = '<div class="map-fallback"><div><b>No se pudo cargar la librería del mapa (Leaflet).</b><br>Revisa la conexión a internet o si la red bloquea unpkg.com, cdnjs.cloudflare.com y cdn.jsdelivr.net.<br>La priorización y las recomendaciones siguen funcionando con tiempos estimados.</div></div>';
      return;
    }
    map = L.map('map', { zoomControl: true }).setView([CFG.CENTER.lat, CFG.CENTER.lng], CFG.ZOOM || 13);
    // Sin el prefijo «Leaflet» ni la bandera; solo queda el crédito de los datos del mapa,
    // que exigen las licencias de OpenStreetMap y Esri.
    map.attributionControl.setPrefix(false);

    const tiles = {};
    Object.entries(BASEMAPS).forEach(([k, b]) => { tiles[k] = L.tileLayer(b.url, b.options); });

    const isFile = location.protocol === 'file:';
    let preferred = CFG.BASEMAP || 'auto';
    if (preferred === 'auto') preferred = isFile ? 'esri' : 'osm';
    if (!tiles[preferred]) preferred = 'esri';
    tiles[preferred].addTo(map);

    /* OpenStreetMap rechaza las teselas (error 403) cuando la página se abre con
       doble clic. Cada vez que se elige esa capa se vigila: si las primeras
       teselas fallan, se vuelve a Esri y se explica cómo habilitarla. */
    let osmOk = 0, osmBad = 0, osmWarned = false;
    tiles.osm.on('add', () => { osmOk = 0; osmBad = 0; osmWarned = false; });
    tiles.osm.on('tileload', () => { osmOk++; });
    tiles.osm.on('tileerror', () => {
      osmBad++;
      if (!osmWarned && osmBad >= 3 && osmOk === 0) {
        osmWarned = true;
        setTimeout(() => {
          map.removeLayer(tiles.osm);
          tiles.esri.addTo(map);
        }, 0);
        toast({
          kind: 'merged', title: 'Mapa de OpenStreetMap no disponible',
          body: isFile
            ? 'OpenStreetMap no entrega el mapa cuando la página se abre con doble clic. Se cambió a Esri. Para usar OpenStreetMap, abre la maqueta con «iniciar-demo.bat».'
            : 'OpenStreetMap no respondió. Se cambió al mapa de Esri.',
          ms: 9000
        });
      }
    });

    const osmLabel = isFile ? 'Calles (OpenStreetMap · requiere iniciar-demo.bat)' : BASEMAPS.osm.name;
    L.control.layers({
      [osmLabel]: tiles.osm,
      [BASEMAPS.esri.name]: tiles.esri,
      [BASEMAPS.satelite.name]: tiles.satelite
    }, null, { position: 'topright' }).addTo(map);

    ['heat', 'route', 'facilities', 'units', 'blocks', 'cases', 'pin'].forEach(k => { layers[k] = L.layerGroup().addTo(map); });
    map.on('click', onMapClick);

    const pts = [...state.cases.map(c => [c.pos.lat, c.pos.lng]), ...SC.FACILITIES.map(f => [f.lat, f.lng])];
    if (pts.length) map.fitBounds(pts, { padding: [30, 30] });
  }

  const icon = (html, size, anchor) => L.divIcon({ className: 'mk', html, iconSize: size, iconAnchor: anchor });

  function selectedRoute() {
    const c = caseById(state.selected);
    if (!c) return null;
    if (c.status === 'asignado') {
      const u = unitById(c.unitId);
      return u && u.route ? { route: u.route, unit: u, color: '#27744f', cls: 'go' } : null;
    }
    const man = state.manual[c.id];
    if (man) return man.status === 'ok' ? { route: man.route, unit: unitById(man.unitId), color: '#6b4fc4', cls: 'manual' } : null;
    const row = rowFor(c.id);
    if (row && (row.kind === 'assign' || row.kind === 'clear')) {
      return { route: row.route, unit: unitById(row.unitId), color: row.kind === 'clear' ? '#c9661a' : '#1d5fd1', cls: row.kind === 'clear' ? 'clear' : 'go' };
    }
    return null;
  }

  function renderMap(ranking = visibleRanking(), evRank = eventRanking()) {
    if (!map) return;
    const ranks = rankMap(evRank);
    Object.values(layers).forEach(l => l.clearLayers());
    const mapEl = $('#map');
    mapEl.classList.toggle('blocking', state.blockMode);
    mapEl.classList.toggle('locating', state.panel === 'form' && !state.blockMode);

    // Zonas con más demanda (opcional)
    if (state.showHeat) {
      const byZone = {};
      ranking.forEach(c => { (byZone[c.zone] = byZone[c.zone] || []).push(c); });
      Object.values(byZone).forEach(list => {
        const sum = list.reduce((s, c) => s + scoreCase(c).total, 0);
        const lat = list.reduce((s, c) => s + c.pos.lat, 0) / list.length;
        const lng = list.reduce((s, c) => s + c.pos.lng, 0) / list.length;
        L.circle([lat, lng], { radius: 250 + Math.sqrt(sum) * 45, stroke: false, fillColor: '#b43d35', fillOpacity: Math.min(0.28, 0.08 + sum / 1500), interactive: false }).addTo(layers.heat);
      });
    }

    // Ruta del caso seleccionado
    const sel = selectedRoute();
    if (sel) {
      const latlngs = sel.route.path.map(p => [p.lat, p.lng]);
      L.polyline(latlngs, { color: '#ffffff', weight: 10, opacity: 0.9, interactive: false }).addTo(layers.route);
      L.polyline(latlngs, { color: sel.color, weight: 6, opacity: 0.9, dashArray: sel.route.estimated ? '8 8' : null, interactive: false }).addTo(layers.route);
      const s = sel.route.path[0];
      L.marker([s.lat, s.lng], { icon: icon(`<span class="mk-unit ${sel.cls}">${sel.unit.id}</span>`, [0, 0], [0, 0]), interactive: false, zIndexOffset: 500 }).addTo(layers.route);
    }

    // Instalaciones (con número de unidades libres en el tooltip)
    const freeAt = new Map();
    state.units.filter(u => u.status === 'disponible').forEach(u => {
      const k = ll(u.pos);
      freeAt.set(k, (freeAt.get(k) || []).concat(u));
    });
    const facKeys = new Set();
    SC.FACILITIES.forEach(f => {
      const k = ll(f);
      facKeys.add(k);
      const free = (freeAt.get(k) || []).length;
      L.marker([f.lat, f.lng], { icon: icon(`<span class="mk-fac" style="--c:${f.color}">${f.short}</span>`, [0, 0], [0, 0]) })
        .bindTooltip(`${esc(f.name)}<br>${free ? plural(free, 'unidad disponible', 'unidades disponibles') : 'Sin unidades disponibles'}`, { direction: 'top', offset: [0, -10] })
        .addTo(layers.facilities);
    });
    freeAt.forEach((list, k) => {
      if (facKeys.has(k)) return;
      const p = list[0].pos;
      L.marker([p.lat, p.lng], { icon: icon(`<span class="mk-unit">${list.map(u => u.id).join(' ')}</span>`, [0, 0], [0, 0]) })
        .bindTooltip('Unidades disponibles en este punto', { direction: 'top' })
        .addTo(layers.units);
    });

    // Bloqueos
    state.blocks.forEach(b => {
      L.marker([b.lat, b.lng], { icon: icon(`<div class="mk-block ${b.clearing ? 'clearing' : ''}"></div>`, [22, 22], [11, 11]), zIndexOffset: 100 })
        .bindTooltip(`<b>${esc(b.name)}</b><br>${b.clearing ? 'Despejando: ' + b.clearing : esc(b.cause)}${state.blockMode ? '<br>Toca para retirar el bloqueo' : ''}`, { direction: 'top', offset: [0, -10] })
        .on('click', () => { if (state.blockMode) removeBlock(b); })
        .addTo(layers.blocks);
    });

    // Casos
    ranking.forEach(c => {
      const s = scoreCase(c);
      const assigned = c.status === 'asignado';
      const isSel = c.id === state.selected;
      const cls = assigned ? 'done' : s.level;
      L.marker([c.pos.lat, c.pos.lng], {
        icon: icon(`<div class="mk-case ${cls} ${isSel ? 'sel' : ''} ${c.newTag ? 'new' : ''}">${assigned ? '&#10003;' : ranks.get(c.id)}</div>`, [30, 30], [15, 15]),
        zIndexOffset: isSel ? 1000 : (assigned ? 0 : 200),
        title: `Caso #${c.id}: ${TYPES[c.type].label}`
      }).on('click', () => selectCase(c.id, false)).addTo(layers.cases);
    });

    // Ubicación del reporte en curso
    if (state.panel === 'form' && state.form.pos) {
      L.marker([state.form.pos.lat, state.form.pos.lng], { icon: icon('<div class="mk-pin"></div>', [18, 18], [9, 9]), interactive: false, zIndexOffset: 1200 }).addTo(layers.pin);
    }
  }

  function onMapClick(e) {
    const pos = { lat: e.latlng.lat, lng: e.latlng.lng };
    if (state.blockMode) {
      const near = state.blocks.find(b => meters(b, pos) <= 80);
      if (near) removeBlock(near);
      else { addBlock(pos); renderAll(); }
      return;
    }
    if (state.panel === 'form') {
      state.form.pos = pos;
      const sel = $('#f-zone');
      if (sel) sel.value = '';
      updateFormLocation();
      renderMap();
    }
  }

  function fitToSelection() {
    if (!map) return;
    const c = caseById(state.selected);
    if (!c) return;
    const sel = selectedRoute();
    if (sel) map.fitBounds(sel.route.path.map(p => [p.lat, p.lng]), { padding: [40, 40], maxZoom: 16 });
    else map.panTo([c.pos.lat, c.pos.lng]);
  }

  /* =======================================================================
     9. RENDER
     ======================================================================= */
  function sortedPending() {
    return state.cases.filter(c => c.status === 'pendiente').sort((a, b) => scoreCase(b).total - scoreCase(a).total);
  }

  function currentRanking() {
    const assigned = state.cases.filter(c => c.status === 'asignado').sort((a, b) => scoreCase(b).total - scoreCase(a).total);
    return [...sortedPending(), ...assigned];
  }

  /* ---------- Filtros ---------- */
  const matchesEvent = c => !!c && (state.filterEvent === 'todos' || c.evento === state.filterEvent);
  const matchesStatus = c => state.filterStatus === 'todos' || (state.filterStatus === 'sin' ? c.status === 'pendiente' : c.status === 'asignado');
  const eventRanking = () => currentRanking().filter(matchesEvent);
  const visibleRanking = () => eventRanking().filter(matchesStatus);

  // Número de orden: posición entre los casos sin unidad del siniestro filtrado
  function rankMap(evRank) {
    const m = new Map();
    evRank.filter(c => c.status === 'pendiente').forEach((c, i) => m.set(c.id, i + 1));
    return m;
  }

  function expireNewTags() {
    state.cases.forEach(c => { if (c.newTag && now() - c.newAt > NEW_TAG_MS) c.newTag = null; });
  }

  function updateTitle() {
    const unseen = state.cases.filter(c => c.newTag && c.status !== 'atendido').length + state.inbox.length;
    document.title = (unseen ? `(${unseen}) ` : '') + BASE_TITLE;
  }

  function renderFilters(evRank) {
    const sel = $('#event-filter');
    const active = state.cases.filter(c => c.status !== 'atendido');
    const count = id => active.filter(c => id === 'todos' || c.evento === id).length;
    sel.innerHTML = [`<option value="todos">Todos los siniestros (${count('todos')})</option>`]
      .concat((SC.EVENTOS || []).map(e => `<option value="${e.id}">${esc(e.label)} (${count(e.id)})</option>`)).join('');
    sel.value = state.filterEvent;
    const sin = evRank.filter(c => c.status === 'pendiente').length;
    const con = evRank.length - sin;
    const labels = { todos: `Todos <small>${evRank.length}</small>`, sin: `Sin unidad <small>${sin}</small>`, con: `Unidad enviada <small>${con}</small>` };
    document.querySelectorAll('.seg-btn').forEach(b => {
      b.innerHTML = labels[b.dataset.status];
      b.classList.toggle('active', b.dataset.status === state.filterStatus);
    });
  }

  function renderLegend() {
    $('#legend-fac').innerHTML = (SC.FACILITY_TYPES || []).map(f =>
      `<span><i class="fac-code" style="--c:${f.color}">${esc(f.short)}</i>${esc(f.label)}</span>`).join('') +
      '<span><i class="unit-code">R-1</i>Unidad libre fuera de base (R rescate, A ambulancia, B bomberos, L lancha, M maquinaria, S suministros)</span>';
  }

  function renderAll() {
    expireNewTags();
    const evRank = eventRanking();
    const visible = evRank.filter(matchesStatus);
    const sel = caseById(state.selected);
    if (!sel || sel.status === 'atendido' || !visible.includes(sel)) {
      state.selected = visible.length ? visible[0].id : null;
    }
    renderFilters(evRank);
    renderStats(evRank);
    renderQueue(visible, evRank);
    if (state.panel === 'case') renderCasePanel();
    renderMap(visible, evRank);
    renderUnits();
    renderZones(evRank);
    renderLog();
    renderIncoming();
    updateTitle();
  }

  function topZone(ranking) {
    const z = {};
    ranking.forEach(c => { z[c.zone] = (z[c.zone] || 0) + scoreCase(c).total; });
    return Object.entries(z).sort((a, b) => b[1] - a[1])[0];
  }

  function renderStats(ranking) {
    const pending = ranking.filter(c => c.status === 'pendiente');
    const crit = pending.filter(c => scoreCase(c).level === 'crit').length;
    const free = state.units.filter(u => u.status === 'disponible').length;
    const tz = topZone(ranking);
    const evName = state.filterEvent === 'todos' ? '' : ` · ${esc(EVENTS[state.filterEvent])}`;
    $('#stats').innerHTML = `
      <div class="stat ${pending.length ? 'orange' : 'green'}"><b>${pending.length}</b><span>Casos sin unidad</span></div>
      <div class="stat ${crit ? 'red' : ''}"><b>${crit}</b><span>Críticos sin unidad</span></div>
      <div class="stat green"><b>${free} de ${state.units.length}</b><span>Unidades libres</span></div>
      <div class="stat ${state.blocks.length ? 'red' : ''}"><b>${state.blocks.length}</b><span>Vías bloqueadas</span></div>
      <div class="stat wide"><b>${tz ? esc(tz[0]) : 'Sin casos'}</b><span>Zona más afectada${evName}</span></div>`;
  }

  function nextStepText(c) {
    if (c.status === 'asignado') {
      const u = unitById(c.unitId);
      if (u.rerouting) return { cls: 'warn', text: `${u.id}: vía bloqueada, buscando ruta alterna…` };
      return { cls: 'ok', text: `${u.id} en camino · llega en ${fmtMin(u.route.min)}${c.rerouted ? ' · ruta alterna' : ''}` };
    }
    const man = state.manual[c.id];
    if (man) {
      const mu = unitById(man.unitId);
      if (man.status === 'ok') return { cls: '', text: `Elegida por el operador: ${mu.id} ${mu.name} · ${fmtMin(man.route.min)}` };
      if (man.status === 'calculating') return { cls: '', text: `Calculando ruta de ${mu.id}…` };
      return { cls: 'bad', text: `${mu.id} no tiene ruta libre` };
    }
    const r = rowFor(c.id);
    if (!r) return { cls: '', text: state.planning ? 'Calculando ruta…' : 'Sin recomendación todavía' };
    const u = r.unitId ? unitById(r.unitId) : null;
    switch (r.kind) {
      case 'assign': return { cls: '', text: `Recomendado: ${u.id} ${u.name} · ${fmtMin(r.route.min)}` };
      case 'clear': return { cls: 'warn', text: `Sin acceso por tierra · despejar con ${u.id}` };
      case 'waiting': return { cls: 'warn', text: 'Sin acceso · esperando que se despeje la vía' };
      case 'blocked': return { cls: 'bad', text: 'Sin acceso y sin maquinaria libre' };
      case 'noroute': return { cls: 'bad', text: 'No se encontró ruta por carretera' };
      default: return { cls: 'bad', text: 'Sin unidad disponible · pedir apoyo' };
    }
  }

  function renderQueue(ranking = visibleRanking(), evRank = eventRanking()) {
    const ranks = rankMap(evRank);
    const pendingAll = evRank.filter(c => c.status === 'pendiente').length;
    $('#queue-sub').textContent = `${pendingAll} sin unidad · ${evRank.length - pendingAll} con unidad enviada` +
      (state.filterEvent === 'todos' ? '' : ` · ${EVENTS[state.filterEvent]}`);
    const actionable = state.plan.filter(r => (r.kind === 'assign' || r.kind === 'clear') && caseById(r.caseId).status === 'pendiente' && matchesEvent(caseById(r.caseId))).length;
    const btn = $('#approve-all');
    btn.disabled = state.planning || !actionable;
    btn.textContent = actionable ? `Aprobar todo (${actionable})` : 'Aprobar todo';
    $('#plan-status').textContent = state.planning ? 'Calculando rutas y recomendaciones…' : state.planNote;

    if (!ranking.length) {
      const msg = state.filterStatus === 'con' ? 'Ningún caso tiene unidad enviada todavía.' : state.filterStatus === 'sin' ? 'Todos los casos tienen unidad asignada.' : 'No hay casos activos.';
      $('#queue').innerHTML = `<li class="empty">${msg}</li>`;
      return;
    }
    $('#queue').innerHTML = ranking.map(c => {
      const s = scoreCase(c);
      const assigned = c.status === 'asignado';
      const next = nextStepText(c);
      const ev = state.filterEvent === 'todos' ? ` · ${esc(EVENTS[c.evento] || '')}` : '';
      return `<li class="q-item ${c.id === state.selected ? 'selected' : ''} ${assigned ? 'assigned' : ''} ${c.newTag ? 'is-new' : ''} ${state.flashId === c.id ? 'flash' : ''}" data-case="${c.id}" tabindex="0">
        <span class="rank ${assigned ? 'done' : s.level}">${assigned ? '&#10003;' : ranks.get(c.id)}</span>
        <div>
          <div class="q-title">${TYPES[c.type].label}${c.newTag ? `<span class="tag-new">${c.newTag.toUpperCase()}</span>` : ''}</div>
          <div class="q-meta">#${c.id}${ev} · ${esc(c.zone)} · ${fmtAgo(s.mins)}</div>
          <div class="q-next ${next.cls}">${esc(next.text)}</div>
          ${assigned && c.assignedBy ? `<div class="q-by">Enviada por ${esc(c.assignedBy)} a las ${hhmm(c.assignedAt)}</div>` : ''}
        </div>
        <div class="q-score ${s.level}">${s.total}<small>${LEVEL[s.level].label}</small></div>
      </li>`;
    }).join('');
    state.flashId = null;
  }

  /* ---------- Enlaces de explicación y selector de unidad ---------- */
  // Enlace a la explicación de por qué se recomienda una unidad (o un tipo de unidad)
  const unitLink = (c, u) => `<a href="#" class="why-link" data-why="${c.id}" title="Ver por qué se recomienda">${u.id} · ${esc(u.name)}</a>`;
  const typeLink = (c, type) => `<a href="#" class="why-link" data-why="${c.id}" title="Ver por qué este tipo de unidad">${UNIT_TYPES[type]}</a>`;

  const etaFor = (u, c) => {
    const e = state.planEta.get(u.id + '|' + c.id);
    return e != null && e !== Infinity ? e : estimate(u.pos, c.pos).min;
  };

  // Selector «Elegir otra unidad»: unidades libres del tipo indicado, de la alternativa y de otros tipos
  function pickerHtml(c, recommendedId) {
    const t = TYPES[c.type];
    const man = state.manual[c.id];
    const chosen = man ? man.unitId : '';
    const open = state.pickOpen[c.id] || !!man;
    const opt = u => {
      const res = state.planReserved.get(u.id);
      const notes = [];
      if (u.id === recommendedId) notes.push('recomendada');
      else if (res && res !== c.id) notes.push(`reservada para #${res}`);
      return `<option value="${u.id}" ${u.id === chosen ? 'selected' : ''}>${u.id} · ${esc(u.name)} · ~${fmtMin(etaFor(u, c))}${notes.length ? ' · ' + notes.join(', ') : ''}</option>`;
    };
    const busyOpt = u => `<option disabled>${u.id} · ${esc(u.name)} · ${u.status === 'en_ruta' ? `ocupada en caso #${u.caseId}` : 'despejando una vía'}</option>`;
    const groups = t.units.map((type, i) => {
      const of = state.units.filter(u => u.type === type);
      const free = of.filter(u => u.status === 'disponible').sort((a, b) => etaFor(a, c) - etaFor(b, c));
      const busy = of.filter(u => u.status !== 'disponible');
      return `<optgroup label="${i === 0 ? 'Tipo indicado' : 'Alternativa'}: ${UNIT_TYPES[type]}">${free.map(opt).join('')}${busy.map(busyOpt).join('')}</optgroup>`;
    });
    const others = state.units.filter(u => !t.units.includes(u.type) && u.status === 'disponible').sort((a, b) => etaFor(a, c) - etaFor(b, c));
    if (others.length) groups.push(`<optgroup label="Otros tipos (a criterio del operador)">${others.map(opt).join('')}</optgroup>`);
    return `<details class="pick" data-pick="${c.id}" ${open ? 'open' : ''}>
      <summary>Elegir otra unidad</summary>
      <select class="pick-select" data-pick-case="${c.id}" aria-label="Elegir otra unidad para el caso #${c.id}">
        <option value="">Selecciona una unidad…</option>${groups.join('')}
      </select>
      <p class="pick-note">Tiempos aproximados. Si eliges una unidad reservada para otro caso, el plan se recalcula para ese caso.</p>
    </details>`;
  }

  // Recomendación cuando el operador eligió una unidad distinta
  function manualHtml(c) {
    const man = state.manual[c.id];
    const u = unitById(man.unitId);
    const t = TYPES[c.type];
    const r = rowFor(c.id);
    const rec = r && r.kind === 'assign' ? unitById(r.unitId) : null;
    const wrongType = !t.units.includes(u.type);
    let body;
    if (man.status === 'calculating') body = `<p>Calculando la ruta de <b>${u.id} · ${esc(u.name)}</b>…</p>`;
    else if (man.status === 'ok') {
      body = `<p>Enviar ${unitLink(c, u)} (${UNIT_TYPES[u.type].toLowerCase()}) desde ${esc(zoneOf(u.pos))}. Llega en <b>${fmtMin(man.route.min)}</b> (${fmtKm(man.route.meters)}).</p>
        ${rec && rec.id !== u.id ? `<p class="extra">El sistema recomendaba ${rec.id} (${fmtMin(r.route.min)}).</p>` : ''}
        ${wrongType ? `<p class="warn-line">Este tipo de unidad no es el indicado para ${t.label.toLowerCase()}. Confirma que puede atender el caso.</p>` : ''}
        <div class="row-btns"><button class="btn btn-primary" data-approve="${c.id}">Aprobar envío de ${u.id}</button><a href="#" class="why-link" data-manual-cancel="${c.id}">Volver a la recomendación</a></div>`;
    } else {
      body = `<p><b>${u.id}</b> no tiene una ruta libre hasta este caso${man.status === 'blocked' ? ': todas sus rutas cruzan un bloqueo' : ''}. Elige otra unidad.</p>
        <div class="row-btns"><a href="#" class="why-link" data-manual-cancel="${c.id}">Volver a la recomendación</a></div>`;
    }
    return `<div class="reco manual"><h4>Unidad elegida por el operador</h4>${body}${pickerHtml(c, rec ? rec.id : null)}</div>`;
  }

  async function pickUnit(caseId, unitId) {
    if (!unitId) { delete state.manual[caseId]; renderAll(); return; }
    const c = caseById(caseId), u = unitById(unitId);
    if (!c || !u) return;
    state.manual[caseId] = { unitId, status: 'calculating' };
    state.pickOpen[caseId] = true;
    renderAll();
    const res = await bestRoute(u.pos, c.pos);
    const cur = state.manual[caseId];
    if (!cur || cur.unitId !== unitId) return;
    state.manual[caseId] = { unitId, status: res.status, route: res.route || null };
    renderAll();
    if (res.status === 'ok') fitToSelection();
  }

  function recommendationHtml(c) {
    if (c.status === 'asignado') {
      const u = unitById(c.unitId);
      if (u.rerouting) return `<div class="reco warn"><h4>Buscando ruta alterna</h4><p>La ruta de <b>${u.id}</b> quedó bloqueada. Calculando un desvío…</p></div>`;
      return `<div class="reco ok"><h4>En atención</h4>
        <p>${unitLink(c, u)} va en camino. Llegada estimada: ${fmtMin(u.route.min)} (${fmtKm(u.route.meters)}).</p>
        ${c.rerouted ? '<p class="extra">La ruta original quedó bloqueada; la unidad sigue una ruta alterna.</p>' : ''}
        ${c.assignedBy ? `<p class="by">${c.manualUnit ? 'Elegida y enviada' : 'Enviada'} por ${esc(c.assignedBy)} a las ${hhmm(c.assignedAt)}.</p>` : ''}
        <div class="row-btns"><button class="btn btn-small btn-green" data-finish="${u.id}">Registrar tarea terminada</button></div></div>`;
    }
    if (state.manual[c.id]) return manualHtml(c);
    const r = rowFor(c.id);
    if (!r) return state.planning ? '<div class="reco"><h4>Recomendación</h4><p>Calculando la mejor unidad y ruta…</p></div>' : '';
    const t = TYPES[c.type];
    const u = r.unitId ? unitById(r.unitId) : null;
    const b = r.blockId ? blockById(r.blockId) : null;
    const est = r.route && r.route.estimated ? ' (estimado: el servicio de rutas no respondió)' : '';
    const whyBtn = `<a href="#" class="why-link" data-why="${c.id}">Por qué esta recomendación</a>`;
    switch (r.kind) {
      case 'assign': {
        const extra = [];
        if (r.alt) extra.push(`No hay unidades de ${UNIT_TYPES[t.units[0]].toLowerCase()} libres; se recomienda ${UNIT_TYPES[u.type].toLowerCase()} como alternativa.`);
        if (r.avoided.length) extra.push(`La ruta más corta está bloqueada; esta ruta alterna la evita (+${Math.max(1, Math.round(r.delay))} min).`);
        return `<div class="reco"><h4>Recomendación</h4>
          <p>Enviar ${unitLink(c, u)} (${typeLink(c, u.type)}) desde ${esc(zoneOf(u.pos))}. Llega en <b>${fmtMin(r.route.min)}</b> (${fmtKm(r.route.meters)})${est}.</p>
          ${extra.length ? `<p class="extra">${extra.join(' ')}</p>` : ''}
          <div class="row-btns"><button class="btn btn-primary" data-approve="${c.id}">Aprobar envío</button>${whyBtn}</div>
          ${pickerHtml(c, u.id)}</div>`;
      }
      case 'clear':
        return `<div class="reco warn"><h4>Sin acceso por tierra</h4>
          <p>Todas las rutas pasan por "${esc(b.name)}". Se recomienda enviar ${unitLink(c, u)} (${typeLink(c, u.type)}) a despejar la vía (llega en ${fmtMin(r.route.min)}). Mientras tanto, un equipo puede avanzar a pie desde el punto accesible más cercano.</p>
          <div class="row-btns"><button class="btn btn-primary" data-approve="${c.id}">Aprobar despeje</button>${whyBtn}</div></div>`;
      case 'waiting':
        return `<div class="reco warn"><h4>Sin acceso por tierra</h4><p>${r.unitId ? `${r.unitId} ya está despejando "${esc(b.name)}".` : `El despeje de "${esc(b.name)}" ya está recomendado para el caso #${r.sameAs}.`} Cuando se habilite la vía, el sistema recomendará una unidad.</p><div class="row-btns">${whyBtn}</div></div>`;
      case 'blocked':
        return `<div class="reco bad"><h4>Sin acceso y sin maquinaria</h4><p>"${esc(b.name)}" corta el acceso y no hay maquinaria libre. Opciones: acceso a pie, apoyo aéreo o pedir maquinaria a otro municipio.</p><div class="row-btns">${whyBtn}</div></div>`;
      case 'noroute':
        return `<div class="reco bad"><h4>Sin ruta</h4><p>El servicio de rutas no encontró un camino por carretera hasta este punto. Verifica la ubicación del reporte o elige otra unidad.</p>${pickerHtml(c, null)}</div>`;
      default:
        return `<div class="reco bad"><h4>Sin unidad del tipo indicado</h4><p>No hay unidades libres de ${t.units.map(x => typeLink(c, x).toLowerCase()).join(' ni de ')}. Puedes elegir otra unidad disponible, esperar a que una termine o pedir apoyo externo.</p>
          <div class="row-btns">${whyBtn}</div>${pickerHtml(c, null)}</div>`;
    }
  }

  /* ---------- Ventana «Por qué esta recomendación» ---------- */
  function whyHtml(c) {
    const t = TYPES[c.type];
    const r = rowFor(c.id);
    const man = state.manual[c.id];
    const chosenId = c.status === 'asignado' ? c.unitId : (r && r.unitId) || null;
    const chosen = chosenId ? unitById(chosenId) : null;
    const s = scoreCase(c);
    const tierOf = type => t.units.indexOf(type);
    const chosenTier = chosen && r && r.kind === 'assign' ? tierOf(chosen.type) : 0;

    const needs = t.units.map((type, i) => `<li><b>${UNIT_TYPES[type]}</b> ${i === 0 ? '(tipo indicado)' : '(alternativa)'}: ${esc(UNIT_DESC[type])}${i === 0 ? '' : ` ${esc(t.alt)}`}</li>`).join('');

    // Todas las unidades de los tipos que sirven para este caso, con su estado
    const rows = state.units.filter(u => t.units.includes(u.type)).map(u => {
      const ev = r && r.evaluated ? r.evaluated[u.id] : null;
      const res = state.planReserved.get(u.id);
      let estado, orden = 3, eta = u.status === 'disponible' ? etaFor(u, c) : null;
      if (c.status === 'asignado' && u.id === c.unitId) { estado = 'Enviada a este caso'; orden = 0; eta = u.route ? u.route.min : eta; }
      else if (u.status === 'en_ruta') { estado = `Ocupada en el caso #${u.caseId}`; orden = 5; }
      else if (u.status === 'despejando') { estado = 'Despejando una vía'; orden = 5; }
      else if (r && r.kind === 'assign' && u.id === r.unitId) { estado = 'Recomendada: la más rápida con ruta libre'; orden = 0; eta = r.route.min; }
      else if (res && res !== c.id) {
        const earlier = state.plan.findIndex(x => x.caseId === res) < state.plan.findIndex(x => x.caseId === c.id);
        estado = `Reservada para el caso #${res}${earlier ? ', más urgente' : ''}`; orden = 4;
      }
      else if (ev && ev.status === 'blocked') { estado = 'Su ruta cruza un bloqueo'; orden = 2; }
      else if (ev && ev.status === 'noroute') { estado = 'Sin ruta por carretera'; orden = 2; }
      else if (chosen && r && r.kind === 'assign' && tierOf(u.type) > chosenTier) { estado = 'Alternativa: no hizo falta'; orden = 3; }
      else { estado = 'Disponible, llega más tarde'; orden = 1; }
      return { u, estado, orden, eta };
    }).sort((a, b) => a.orden - b.orden || (a.eta ?? 1e9) - (b.eta ?? 1e9));

    const table = `<table class="table"><tr><th>Unidad</th><th>Tipo</th><th class="n">Llega en</th><th>Estado</th></tr>${rows.map(x =>
      `<tr class="${x.orden === 0 ? 'hl' : ''}"><td>${x.u.id} · ${esc(x.u.name)}</td><td>${UNIT_TYPES[x.u.type]}</td><td class="n">${x.eta != null ? fmtMin(x.eta) : '–'}</td><td>${x.estado}</td></tr>`).join('')}</table>`;

    let conclusion = '';
    if (c.status === 'asignado') conclusion = `${chosen.id} ya va en camino${c.manualUnit ? ', elegida por el operador' : ''}.`;
    else if (man && man.status === 'ok') conclusion = `El operador eligió ${man.unitId}. Al aprobarlo, queda registrado en la bitácora.`;
    else if (r && r.kind === 'assign') conclusion = `Se recomienda ${chosen.id} porque es del ${r.alt ? 'tipo alternativo (no hay del indicado libre)' : 'tipo indicado'} y es la que llega antes por una ruta libre de bloqueos.`;
    else if (r && r.kind === 'clear') conclusion = `Ninguna unidad adecuada llega por tierra: todas las rutas cruzan un bloqueo. Por eso se recomienda ${chosen.id} (${UNIT_TYPES[chosen.type].toLowerCase()}) para despejar la vía primero.`;
    else if (r && (r.kind === 'waiting' || r.kind === 'blocked')) conclusion = 'Ninguna unidad adecuada llega por tierra mientras la vía siga bloqueada.';
    else conclusion = 'No hay unidades libres de los tipos que sirven para este caso. Puedes elegir otra unidad con «Elegir otra unidad».';

    return `<h3 id="modal-title">Por qué esta recomendación · caso #${c.id}</h3>
      <p class="modal-sub">${t.label} en ${esc(c.zone)} · prioridad ${LEVEL[s.level].label.toLowerCase()} (${s.total})</p>
      <h4>Qué necesita este caso</h4>
      <p>${esc(t.why)}</p>
      <ul>${needs}</ul>
      <h4>Unidades evaluadas</h4>
      ${table}
      <p class="modal-conclusion">${conclusion}</p>
      <h4>Regla de elección</h4>
      <p>Los casos se atienden de mayor a menor prioridad. Para cada uno se prefiere el tipo indicado; si no hay libre, la alternativa. Entre unidades del mismo tipo se elige la que llega antes por una ruta que no cruza bloqueos. Las unidades ya reservadas para casos más urgentes no se ofrecen, salvo que el operador las elija.</p>
      <div class="row-btns"><button class="btn btn-small btn-ghost" data-show-score="${c.id}">Ver cómo se calculó la prioridad</button><button class="btn btn-small btn-ghost" data-goto-como>Ver la fórmula completa</button></div>`;
  }

  function openModal(html) {
    $('#modal-body').innerHTML = html;
    $('#modal').hidden = false;
    $('#modal-close').focus();
  }
  function closeModal() { $('#modal').hidden = true; }

  function renderCasePanel() {
    const panel = $('#side-panel');
    const c = caseById(state.selected);
    if (!c) { panel.innerHTML = '<div class="empty">Selecciona un caso de la lista o del mapa.</div>'; return; }
    const s = scoreCase(c);
    const t = TYPES[c.type];
    const last = c.notes[c.notes.length - 1];
    const whyOpen = panel.querySelector('details.why')?.open && panel.dataset.case === String(c.id);
    const warns = [];
    if (!s.known) warns.push(`No se sabe cuántas personas hay. Se asumen ${ASSUMED_PEOPLE} para no subestimar el caso.`);
    if (!c.verified && c.reports === 1) warns.push('Un solo reporte, sin verificar. Su prioridad baja un poco hasta que otro reporte o un brigadista lo confirme.');

    panel.dataset.case = c.id;
    panel.innerHTML = `
      <div class="panel-head">
        <div>
          <h2>${t.label} · caso #${c.id}</h2>
          <div class="case-meta">${esc(EVENTS[c.evento] || '')} · ${esc(c.zone)} · reportado ${fmtAgo(s.mins)} · ${esc(c.source)}</div>
        </div>
        <span class="level ${s.level}">${LEVEL[s.level].label} · ${s.total}</span>
      </div>
      <div class="case-body">
        <p class="needs">Necesita: ${t.units.map((type, i) => `${typeLink(c, type)} <span>${i === 0 ? '(indicado)' : '(alternativa)'}</span>`).join(' · ')}</p>
        ${recommendationHtml(c)}
        <div class="facts">
          <div class="fact"><span>Personas</span><b>${s.known ? c.people : 'Sin dato'}</b></div>
          <div class="fact"><span>Vulnerables</span><b>${c.vuln || 0}</b></div>
          <div class="fact"><span>Reportes</span><b>${c.reports}</b></div>
          <div class="fact"><span>Verificado</span><b>${c.verified ? 'Sí' : 'No'}</b></div>
        </div>
        <p class="case-note">${esc(last.text)} <small>(${esc(last.source)}, ${hhmm(last.t)})</small></p>
        ${warns.map(w => `<div class="warn-line">${w}</div>`).join('')}
        <details class="why" ${whyOpen ? 'open' : ''}>
          <summary>Por qué tiene esta prioridad</summary>
          <table class="breakdown">
            <tr><td>Gravedad del tipo de caso<small>${t.label}</small></td><td>+${s.G}</td></tr>
            <tr><td>Personas afectadas<small>${s.known ? s.n : 'sin dato, se asumen ' + s.n} · máximo 20</small></td><td>+${s.P}</td></tr>
            <tr><td>Personas vulnerables<small>${c.vuln || 0} reportadas · 4 puntos cada una · máximo 12</small></td><td>+${s.V}</td></tr>
            <tr><td>Tiempo sin atención<small>1 punto cada ${t.tStep} min · máximo ${t.tMax}</small></td><td>+${s.T}</td></tr>
            <tr class="muted"><td>Subtotal</td><td>${s.base}</td></tr>
            <tr class="muted"><td>Confianza del dato<small>${s.confWhy}</small></td><td>×${s.conf.toFixed(2)}</td></tr>
            ${c.adj ? `<tr class="muted"><td>Ajuste manual</td><td>${c.adj > 0 ? '+' : ''}${c.adj}</td></tr>` : ''}
            <tr class="total"><td>Prioridad</td><td style="color:${LEVEL[s.level].color}">${s.total}</td></tr>
          </table>
          <div class="row-btns">
            <button class="btn btn-small btn-ghost" data-adj="10">Subir prioridad</button>
            <button class="btn btn-small btn-ghost" data-adj="-10">Bajar prioridad</button>
            ${c.verified ? '' : '<button class="btn btn-small btn-ghost" data-verify>Marcar como verificado</button>'}
          </div>
        </details>
      </div>`;
  }

  /* ---------- Formulario de reporte ---------- */
  function openForm() {
    state.panel = 'form';
    state.blockMode = false;
    syncBlockButton();
    const panel = $('#side-panel');
    panel.dataset.case = '';
    panel.innerHTML = `
      <div class="panel-head">
        <div><h2>Registrar reporte</h2><div class="case-meta">Los datos que no se conozcan pueden quedar vacíos.</div></div>
        <button class="btn btn-small btn-ghost" id="form-cancel" type="button">Cancelar</button>
      </div>
      <form class="form" id="report-form" autocomplete="off">
        <div class="field">
          <span class="field-label">1. Tipo de situación</span>
          <div class="type-grid">${Object.entries(TYPES).map(([k, t]) =>
            `<button type="button" class="type-btn ${k === state.form.type ? 'active' : ''}" data-type="${k}">${t.label}</button>`).join('')}</div>
        </div>
        <div class="field">
          <label for="f-event">Siniestro</label>
          <select id="f-event">${(SC.EVENTOS || []).map(e => `<option value="${e.id}" ${e.id === (state.filterEvent !== 'todos' ? state.filterEvent : DEFAULT_EVENT[state.form.type]) ? 'selected' : ''}>${esc(e.label)}</option>`).join('')}</select>
        </div>
        <div class="field">
          <span class="field-label">2. Ubicación</span>
          <div class="loc-box">
            <select id="f-zone"><option value="">Toca el mapa o elige una zona</option>${SC.ZONES.map((z, i) => `<option value="${i}">${esc(z.name)}</option>`).join('')}</select>
            <span id="f-loc">Sin ubicación.</span>
          </div>
        </div>
        <div class="field">
          <span class="field-label">3. Detalles</span>
          <div class="field-row">
            <div class="field"><label for="f-people">Personas</label><input type="number" min="1" id="f-people" placeholder="No se sabe"></div>
            <div class="field"><label for="f-vuln">Vulnerables</label><input type="number" min="0" id="f-vuln" placeholder="0"></div>
            <div class="field"><label for="f-source">Fuente</label>
              <select id="f-source"><option>Llamada 911</option><option>SMS</option><option>WhatsApp</option><option>Radio</option><option>Brigadista en campo</option></select>
            </div>
          </div>
          <label for="f-note">Descripción breve</label>
          <input type="text" id="f-note" placeholder="Ejemplo: vivienda colapsada, se escuchan voces">
        </div>
        <button type="submit" class="btn btn-primary" id="f-submit" disabled>Registrar reporte</button>
      </form>`;
    updateFormLocation();
    renderMap();
  }

  function closeForm() {
    state.panel = 'case';
    state.form.pos = null;
    syncBlockButton();
    renderAll();
  }

  function updateFormLocation() {
    const el = $('#f-loc');
    if (!el) return;
    if (state.form.pos) {
      el.innerHTML = `<span class="chosen">Ubicado en ${esc(zoneOf(state.form.pos))}</span>`;
      $('#f-submit').disabled = false;
    } else {
      el.textContent = 'Sin ubicación.';
      $('#f-submit').disabled = true;
    }
  }

  function submitForm() {
    if (!state.form.pos) return;
    const pv = $('#f-people').value.trim();
    const source = $('#f-source').value;
    const res = ingest({
      type: state.form.type,
      evento: $('#f-event').value,
      lat: state.form.pos.lat, lng: state.form.pos.lng,
      people: pv === '' ? null : Math.max(1, parseInt(pv, 10)),
      vuln: Math.max(0, parseInt($('#f-vuln').value, 10) || 0),
      source, verified: source === 'Brigadista en campo',
      note: $('#f-note').value.trim()
    }, true);
    state.flashId = res.c.id;
    state.selected = res.c.id;
    const pos = currentRanking().findIndex(c => c.id === res.c.id) + 1;
    replan(res.merged
      ? `Reporte repetido: se agrupó con el caso #${res.c.id}, que ahora tiene ${res.c.reports} reportes.`
      : `Registrado como caso #${res.c.id}. Quedó en el puesto ${pos} de la lista.`);
    closeForm();
  }

  /* ---------- Recursos, zonas, bitácora ---------- */
  function renderUnits() {
    const free = state.units.filter(u => u.status === 'disponible');
    const busy = state.units.filter(u => u.status !== 'disponible');
    $('#units-sub').textContent = `${free.length} de ${state.units.length} disponibles`;
    const row = u => {
      let info = `${UNIT_TYPES[u.type]} · en ${esc(zoneOf(u.pos))}`;
      let st = '<span class="state free">Disponible</span>';
      let btn = '';
      if (u.status === 'en_ruta') {
        info = `${UNIT_TYPES[u.type]} · hacia el caso #${u.caseId} · ${fmtMin(u.route.min)}`;
        st = '<span class="state busy">En camino</span>';
        btn = `<button class="btn btn-small btn-ghost" data-finish="${u.id}">Tarea terminada</button>`;
      } else if (u.status === 'despejando') {
        const b = blockById(u.blockId);
        info = `${UNIT_TYPES[u.type]} · despejando ${b ? esc(b.name) : 'vía'}`;
        st = '<span class="state clear">Despejando vía</span>';
        btn = `<button class="btn btn-small btn-ghost" data-finish="${u.id}">Vía despejada</button>`;
      }
      return `<div class="unit"><div><div class="unit-name">${u.id} · ${esc(u.name)}</div><div class="unit-info">${info}</div></div><div class="unit-side">${st}${btn}</div></div>`;
    };
    $('#units').innerHTML =
      (busy.length ? `<div class="unit-group">En servicio</div>${busy.map(row).join('')}` : '') +
      `<div class="unit-group">Disponibles</div>${free.map(row).join('') || '<div class="empty">Ninguna</div>'}`;
  }

  function renderZones(ranking) {
    const z = {};
    ranking.forEach(c => {
      const s = scoreCase(c);
      z[c.zone] = z[c.zone] || { name: c.zone, n: 0, people: 0, sum: 0, crit: 0 };
      z[c.zone].n++; z[c.zone].people += s.n; z[c.zone].sum += s.total;
      if (c.status === 'pendiente' && s.level === 'crit') z[c.zone].crit++;
    });
    const list = Object.values(z).sort((a, b) => b.sum - a.sum);
    if (!list.length) { $('#zones').innerHTML = '<div class="empty">Sin casos activos.</div>'; return; }
    const max = list[0].sum, top = list[0];
    $('#zones').innerHTML = list.map(x => `
      <div class="zone">
        <div class="zone-top"><b>${esc(x.name)}</b><span>${plural(x.n, 'caso', 'casos')} · ${x.people} personas</span></div>
        <div class="zone-bar"><i style="width:${Math.round(100 * x.sum / max)}%"></i></div>
      </div>`).join('') +
      `<div class="zone-call">Concentrar esfuerzos en <b>${esc(top.name)}</b>: ${plural(top.n, 'caso activo', 'casos activos')} y unas ${top.people} personas${top.crit ? `, ${plural(top.crit, 'crítico', 'críticos')} sin unidad` : ''}. Conviene instalar ahí un puesto de mando avanzado.</div>`;
  }

  function renderLog() {
    $('#log').innerHTML = state.log.slice(0, 120).map(l =>
      `<li><time>${hhmm(l.t)}</time><span class="who ${l.who}">${esc(l.actor)}</span><span>${esc(l.text)}</span></li>`).join('');
  }

  function renderTypeTable() {
    $('#type-table').innerHTML = '<tr><th>Tipo de caso</th><th class="n">Gravedad</th><th>Unidad preferida</th><th class="n">Urgencia máx.</th></tr>' +
      Object.values(TYPES).map(t => `<tr><td>${t.label}</td><td class="n">${t.g}</td><td>${t.units.map(u => UNIT_TYPES[u]).join(', luego ')}</td><td class="n">+${t.tMax}</td></tr>`).join('');
  }

  /* =======================================================================
     10. EVENTOS
     ======================================================================= */
  function selectCase(id, fit = true) {
    if (state.panel === 'form') { state.panel = 'case'; state.form.pos = null; }
    state.selected = id;
    const c = caseById(id);
    if (c && c.newTag) c.newTag = null;   // visto por el operador
    syncBlockButton();
    renderAll();
    if (fit) fitToSelection();
    // Si la ruta de la unidad en camino quedó bloqueada, se busca una ruta alterna
    ensureRouteClear(c).then(() => { if (fit) fitToSelection(); });
  }

  function syncBlockButton() {
    const b = $('#block-mode');
    b.setAttribute('aria-pressed', String(state.blockMode));
    b.textContent = state.blockMode ? 'Terminar de marcar' : 'Marcar vía bloqueada';
    const hint = $('#map-hint');
    hint.classList.toggle('alert', state.blockMode);
    hint.textContent = state.blockMode
      ? 'Toca la calle bloqueada en el mapa. Para retirar un bloqueo, tócalo.'
      : state.panel === 'form' ? 'Toca el mapa para ubicar el reporte.' : 'Selecciona un caso para ver la ruta recomendada.';
  }

  document.body.addEventListener('click', evt => {
    // Enlaces de explicación, selector manual y ventana
    const w = evt.target.closest('[data-why],[data-manual-cancel],[data-show-score],[data-goto-como],#modal-close');
    if (w) {
      evt.preventDefault();
      if (w.dataset.why) { const c = caseById(Number(w.dataset.why)); if (c) openModal(whyHtml(c)); return; }
      if (w.dataset.manualCancel) { const id = Number(w.dataset.manualCancel); delete state.manual[id]; state.pickOpen[id] = false; renderAll(); fitToSelection(); return; }
      if (w.dataset.showScore) {
        closeModal();
        const d = $('#side-panel details.why');
        if (d) { d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
        return;
      }
      if (w.hasAttribute('data-goto-como')) { closeModal(); $('.nav-item[data-view="como"]').click(); return; }
      if (w.id === 'modal-close') { closeModal(); return; }
    }
    if (evt.target.id === 'modal') { closeModal(); return; }
    const el = evt.target.closest('[data-approve],[data-finish],[data-adj],[data-verify],[data-type],[data-status],[data-view],.q-item,#form-cancel');
    if (!el) return;
    if (el.dataset.approve) { approve(Number(el.dataset.approve)); renderAll(); return; }
    if (el.dataset.finish) { finishTask(el.dataset.finish); return; }
    if (el.dataset.adj) { adjust(state.selected, Number(el.dataset.adj)); return; }
    if (el.hasAttribute('data-verify')) { verify(state.selected); return; }
    if (el.id === 'form-cancel') { closeForm(); return; }
    if (el.dataset.type) {
      state.form.type = el.dataset.type;
      document.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('active', b === el));
      const ev = $('#f-event');
      if (ev && state.filterEvent === 'todos') ev.value = DEFAULT_EVENT[el.dataset.type];
      return;
    }
    if (el.dataset.status) {
      state.filterStatus = el.dataset.status;
      renderAll();
      return;
    }
    if (el.dataset.view) {
      document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b === el));
      document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + el.dataset.view));
      if (el.dataset.view === 'operacion' && map) setTimeout(() => map.invalidateSize(), 50);
      return;
    }
    if (el.classList.contains('q-item')) selectCase(Number(el.dataset.case));
  });

  document.body.addEventListener('keydown', evt => {
    if (evt.key === 'Enter' && evt.target.classList && evt.target.classList.contains('q-item')) selectCase(Number(evt.target.dataset.case));
  });

  document.addEventListener('keydown', evt => { if (evt.key === 'Escape' && !$('#modal').hidden) closeModal(); });

  // Recordar si el selector «Elegir otra unidad» está abierto (el evento toggle no burbujea)
  document.addEventListener('toggle', evt => {
    const d = evt.target;
    if (d.matches && d.matches('details.pick')) state.pickOpen[Number(d.dataset.pick)] = d.open;
  }, true);

  document.body.addEventListener('change', evt => {
    if (evt.target.classList.contains('pick-select')) { pickUnit(Number(evt.target.dataset.pickCase), evt.target.value); return; }
    if (evt.target.id === 'f-zone' && evt.target.value !== '') {
      const z = SC.ZONES[Number(evt.target.value)];
      state.form.pos = { lat: z.lat, lng: z.lng };
      updateFormLocation();
      renderMap();
      if (map) map.panTo([z.lat, z.lng]);
    }
  });

  document.body.addEventListener('submit', evt => {
    if (evt.target.id === 'report-form') { evt.preventDefault(); submitForm(); }
  });

  $('#new-report-btn').addEventListener('click', openForm);
  $('#approve-all').addEventListener('click', approveAll);
  $('#toggle-heat').addEventListener('change', e => { state.showHeat = e.target.checked; renderMap(); });
  $('#block-mode').addEventListener('click', () => {
    state.blockMode = !state.blockMode;
    syncBlockButton();
    renderMap();
  });
  $('#reset-btn').addEventListener('click', () => location.reload());

  /* ---------- Reportes entrantes: aviso inmediato, integración diferida ---------- */
  let audioCtx = null;
  function beep() {
    if (!state.sound) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.18].forEach((t0, i) => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.frequency.value = i ? 1046 : 784;
        g.gain.setValueAtTime(0.0001, audioCtx.currentTime + t0);
        g.gain.exponentialRampToValueAtTime(0.25, audioCtx.currentTime + t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + t0 + 0.16);
        o.connect(g).connect(audioCtx.destination);
        o.start(audioCtx.currentTime + t0);
        o.stop(audioCtx.currentTime + t0 + 0.18);
      });
    } catch (err) { /* sin audio disponible */ }
  }

  function toast({ kind = '', title, body, note, ms = 7000 }) {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.innerHTML = `<h4>${esc(title)}</h4><p>${esc(body)}</p>${note ? `<small>${esc(note)}</small>` : ''}`;
    $('#toasts').prepend(el);
    const all = $('#toasts').children;
    while (all.length > 4) all[all.length - 1].remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 350); }, ms);
  }

  let inboxTimer = null, inboxTick = null;

  // Llega un reporte por un canal externo (911, SMS, WhatsApp, radio, brigadistas)
  function receiveReport(rep) {
    state.inbox.push(rep);
    const dup = findDuplicate(rep);
    const zone = zoneOf({ lat: rep.lat, lng: rep.lng });
    toast({
      kind: dup ? 'merged' : (SEVERE.has(rep.type) ? 'severe' : ''),
      title: dup ? `Reporte repetido · caso #${dup.id}` : `Reporte nuevo · ${EVENTS[rep.evento || DEFAULT_EVENT[rep.type]] || ''}`,
      body: `${TYPES[rep.type].label} en ${zone} (${rep.source})`,
      note: rep.note
    });
    beep();
    if (!inboxTimer) {
      state.inboxDeadline = now() + NEW_DELAY;
      inboxTimer = setTimeout(flushInbox, NEW_DELAY);
      inboxTick = setInterval(renderIncoming, 500);
    }
    renderIncoming();
    updateTitle();
  }

  // Integra los reportes recibidos a la lista y recalcula el plan
  function flushInbox() {
    clearTimeout(inboxTimer); clearInterval(inboxTick);
    inboxTimer = null; inboxTick = null;
    const batch = state.inbox.splice(0);
    if (!batch.length) { renderIncoming(); return; }
    let nuevos = 0, agrupados = 0;
    batch.forEach(rep => { const r = ingest(rep); if (r.merged) agrupados++; else nuevos++; });
    const parts = [];
    if (nuevos) parts.push(plural(nuevos, 'caso nuevo', 'casos nuevos'));
    if (agrupados) parts.push(plural(agrupados, 'reporte agrupado', 'reportes agrupados'));
    replan(`Lista actualizada: ${parts.join(' y ')}. Los casos marcados como NUEVO aún no se han revisado.`);
    renderAll();
  }

  function renderIncoming() {
    const box = $('#incoming');
    const n = state.inbox.length;
    if (!n) { box.hidden = true; box.innerHTML = ''; return; }
    const secs = Math.max(0, Math.ceil((state.inboxDeadline - now()) / 1000));
    box.hidden = false;
    box.innerHTML = `<span><b>${plural(n, 'reporte nuevo', 'reportes nuevos')}</b> · la lista se actualiza en ${secs} s</span>
      <button class="btn btn-small btn-primary" id="flush-now" type="button">Actualizar ahora</button>`;
  }

  $('#incoming').addEventListener('click', e => { if (e.target.id === 'flush-now') flushInbox(); });

  $('#simulate-btn').addEventListener('click', () => {
    const batch = SC.BATCHES[state.batch];
    if (!batch) return;
    state.batch++;
    const btn = $('#simulate-btn');
    btn.disabled = true;
    let i = 0;
    const step = () => {
      receiveReport(batch[i++]);
      if (i < batch.length) setTimeout(step, 1200);
      else {
        const more = state.batch < SC.BATCHES.length;
        btn.disabled = !more;
        btn.textContent = more ? 'Simular otra oleada' : 'Sin más reportes de ejemplo';
      }
    };
    step();
  });

  /* ---------- Filtros, sonido ---------- */
  $('#event-filter').addEventListener('change', e => {
    state.filterEvent = e.target.value;
    renderAll();
  });

  $('#sound-btn').addEventListener('click', () => {
    state.sound = !state.sound;
    const b = $('#sound-btn');
    b.setAttribute('aria-pressed', String(state.sound));
    b.textContent = state.sound ? 'Sonido: activado' : 'Sonido: silenciado';
    if (state.sound) beep();
  });

  /* ---------- Acceso de operadores ---------- */
  const OPERADORES = CFG.OPERADORES || [];
  const norm = t => String(t || '').trim().toLowerCase();

  function startSession(op, restored) {
    state.operator = op;
    document.body.classList.remove('locked');
    $('#operator-name').textContent = `Operador: ${op.nombre}`;
    try { sessionStorage.setItem('operador', op.usuario); } catch (err) { /* sin almacenamiento */ }
    if (!restored) addLog('op', 'Inició sesión.');
    renderAll();
    if (map) setTimeout(() => map.invalidateSize(), 50);
  }

  $('#login-form').addEventListener('submit', e => {
    e.preventDefault();
    const u = norm($('#login-user').value), p = $('#login-pass').value;
    const op = OPERADORES.find(o => (norm(o.usuario) === u || norm(o.nombre) === u) && o.clave === p);
    if (!op) {
      $('#login-error').textContent = 'Usuario o contraseña incorrectos.';
      $('#login-pass').value = '';
      $('#login-pass').focus();
      return;
    }
    $('#login-error').textContent = '';
    $('#login-pass').value = '';
    startSession(op, false);
  });

  $('#logout-btn').addEventListener('click', () => {
    addLog('op', 'Cerró sesión.');
    state.operator = null;
    try { sessionStorage.removeItem('operador'); } catch (err) { /* sin almacenamiento */ }
    $('#operator-name').textContent = 'Sin sesión';
    document.body.classList.add('locked');
    renderLog();
    $('#login-user').focus();
  });

  /* =======================================================================
     11. ARRANQUE
     ======================================================================= */
  const BASE_TITLE = document.title;
  $('#area-name').textContent = SC.area || '';
  addLog('sys', 'Sismo registrado y lluvias intensas en el área metropolitana. Se activa el COE.', START - 150 * 60000);
  addLog('sys', `Consola iniciada con ${plural(state.cases.length, 'caso', 'casos')} y ${plural(state.units.length, 'unidad', 'unidades')}.`);

  renderTypeTable();
  renderLegend();
  renderAll();

  // Sesión guardada en esta pestaña (por ejemplo, tras «Reiniciar demostración»)
  try {
    const saved = sessionStorage.getItem('operador');
    const op = saved && OPERADORES.find(o => o.usuario === saved);
    if (op) startSession(op, true);
  } catch (err) { /* sin almacenamiento */ }
  if (!state.operator) setTimeout(() => $('#login-user').focus(), 50);

  (async () => {
    await ensureLeaflet();
    initMap();
    renderAll();

    // Casos que ya tenían unidad asignada antes de abrir la consola
    for (const sc of SC.CASES.filter(x => x.assignedTo)) {
      const c = caseById(sc.id), u = unitById(sc.assignedTo);
      if (!c || !u) continue;
      const alts = await getRoutes(u.pos, c.pos);
      const r = alts[0] || estimate(u.pos, c.pos);
      c.status = 'asignado'; c.unitId = u.id;
      Object.assign(u, { status: 'en_ruta', caseId: c.id, route: r, from: { ...u.pos } });
      c.assignedBy = 'Turno anterior'; c.assignedAt = START - ((sc.minAgo || 2) - 2) * 60000;
      addLog('op', `Envió ${u.id} (${u.name}) al caso #${c.id} en ${c.zone}.`, c.assignedAt, 'Turno anterior');
    }
    // Bloqueos iniciales, ubicados sobre la vía de acceso real del caso
    for (const p of SC.PRESET_BLOCKS || []) {
      const c = caseById(p.nearCase);
      if (!c) continue;
      const near = state.units.filter(u => TYPES[c.type].units.includes(u.type)).sort((a, b) => meters(a.pos, c.pos) - meters(b.pos, c.pos))[0];
      const alts = near ? await getRoutes(near.pos, c.pos) : [];
      const path = alts.length ? alts[0].path : [near ? near.pos : c.pos, c.pos];
      const b = addBlock(pointBefore(path, p.metersBefore || 140), p.name, p.cause, true);
      addLog('field', `Brigadista reporta: ${b.name} (${c.zone}).`, START - 58 * 60000);
    }
    replan('Plan inicial calculado con los reportes recibidos.');
  })();

  const tick = () => { $('#clock').textContent = hhmm(now()); };
  tick();
  setInterval(tick, 10000);
  setInterval(() => { if (state.panel === 'case') renderAll(); else renderQueue(); }, 30000);
});
