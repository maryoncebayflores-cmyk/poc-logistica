import { useEffect, useMemo, useRef, useState } from 'react'
import { DeckGL, ScatterplotLayer, PathLayer, TextLayer, FlyToInterpolator } from 'deck.gl'
import MapGL from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { supabase } from './supabase'
import { recibo, Firma, Foto, svgUrl } from './comprobantes.jsx'

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
const VIEW = { longitude: -58.43, latitude: -34.605, zoom: 11.3, pitch: 0 }
const V = 8, RADIO = 150
const DEPOT_NOMBRE = 'Centro de Distribución Parque Patricios'
const PALETA = ['#22d3ee', '#a78bfa', '#f472b6', '#fb923c', '#34d399', '#60a5fa', '#facc15', '#f87171', '#2dd4bf', '#c084fc']
const ESTADO = { Entregado: [52, 211, 153], 'En camino': [251, 191, 36], Pendiente: [148, 163, 184] }
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const css = (c) => `rgb(${c.join(',')})`
const hav = (a, b) => {
  const r = Math.PI / 180, dLa = (b[1] - a[1]) * r, dLo = (b[0] - a[0]) * r
  const x = Math.sin(dLa / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLo / 2) ** 2
  return 12742000 * Math.asin(Math.sqrt(x))
}
// distancia de un punto a un SEGMENTO (no solo a los vértices): detecta accidentes en tramos rectos largos
function distSeg(p, a, b) {
  const k = Math.cos((p[1] * Math.PI) / 180) * 111320, h = 111320
  const ax = (a[0] - p[0]) * k, ay = (a[1] - p[1]) * h, bx = (b[0] - p[0]) * k, by = (b[1] - p[1]) * h
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy
  const t = L ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0
  return Math.hypot(ax + t * dx, ay + t * dy)
}
const minDist = (p, path) => { let m = Infinity; for (let i = 1; i < path.length; i++) m = Math.min(m, distSeg(p, path[i - 1], path[i])); return m }
const hora = (s) => { const m = 480 + Math.floor(s / 60); return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` }

async function loadData() {
  if (supabase) {
    const [c, p] = await Promise.all([supabase.from('camiones').select('*').order('id'), supabase.from('pedidos').select('*').order('camion_id').order('orden')])
    if (c.error || p.error) throw new Error((c.error || p.error).message)
    console.log('Supabase camiones:', c.data, 'pedidos:', p.data)
    return { camiones: c.data, pedidos: p.data, origen: 'Supabase' }
  }
  return { ...(await (await fetch('/datos_demo.json')).json()), origen: 'archivo local de demo' }
}
async function osrm(coords) {
  try {
    const q = coords.map((c) => c.join(',')).join(';')
    const j = await (await fetch(`https://router.project-osrm.org/route/v1/driving/${q}?overview=full&geometries=geojson`)).json()
    if (j.code === 'Ok') return { path: j.routes[0].geometry.coordinates, legs: j.routes[0].legs.map((l) => l.distance), real: true }
  } catch (e) { console.warn('OSRM no disponible', e) }
  return null
}
const getRoute = async (coords) => (await osrm(coords)) || { path: coords, legs: null, real: false }

// desvío: pasa por un punto a 700 m / 1200 m del accidente y valida que NO cruce ningún accidente activo
async function desviar(inicio, paradas, nuevo, activos) {
  const dLat = (m) => m / 111320, dLon = (m) => m / (111320 * Math.cos((nuevo[1] * Math.PI) / 180))
  const evitar = [...activos, nuevo].filter((a) => hav(a, inicio) >= RADIO)
  for (const m of [700, 1200]) {
    const cands = [[m, 0], [-m, 0], [0, m], [0, -m]].map(([x, y]) => [nuevo[0] + dLon(x), nuevo[1] + dLat(y)])
    const rs = await Promise.all(cands.map(async (wp) => {
      const r = await osrm([inicio, wp, ...paradas])
      if (!r || evitar.some((a) => minDist(a, r.path) < RADIO)) return null
      return { ...r, legs: [r.legs[0] + r.legs[1], ...r.legs.slice(2)] }
    }))
    const ok = rs.filter(Boolean).sort((a, b) => a.legs.reduce((x, y) => x + y, 0) - b.legs.reduce((x, y) => x + y, 0))
    if (ok.length) return ok[0]
  }
  return null
}

// la ruta incluye el regreso al depósito (última pierna)
function build(base, stops, route, t0) {
  const { path } = route, cum = [0], n = stops.length
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + hav(path[i - 1], path[i]))
  const total = cum[cum.length - 1]
  let stopDist
  if (route.legs && route.legs.length === n + 1) {
    const s = route.legs.reduce((a, b) => a + b, 0); let a = 0
    stopDist = route.legs.slice(0, n).map((l) => ((a += l) / s) * total)
  } else stopDist = stops.map((st) => { let b = 0, bd = Infinity; path.forEach((p, i) => { const d = hav(p, [st.longitud, st.latitud]); if (d < bd) { bd = d; b = i } }); return cum[b] })
  return { ...base, stops, path, cum, total, stopDist, t0 }
}
const distOf = (m, t) => Math.min(Math.max(0, t - m.t0) * V, m.total)
function posAt(m, d) {
  const { cum, path } = m
  if (d <= 0) return path[0]
  if (d >= m.total) return path[path.length - 1]
  let lo = 0, hi = cum.length - 1
  while (hi - lo > 1) { const k = (lo + hi) >> 1; cum[k] <= d ? (lo = k) : (hi = k) }
  const f = (d - cum[lo]) / (cum[hi] - cum[lo] || 1)
  return [path[lo][0] + (path[hi][0] - path[lo][0]) * f, path[lo][1] + (path[hi][1] - path[lo][1]) * f]
}

export default function App() {
  const [data, setData] = useState(null)
  const [models, setModels] = useState([])
  const [error, setError] = useState('')
  const [simT, setSimT] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(20)
  const [real, setReal] = useState(true)
  const [open, setOpen] = useState(true)
  const [tab, setTab] = useState('flota')
  const [filtro, setFiltro] = useState('Todos')
  const [acc, setAcc] = useState([])
  const [eventos, setEventos] = useState([])
  const [colocar, setColocar] = useState(false)
  const [calc, setCalc] = useState(false)
  const [view, setView] = useState(VIEW)
  const [toast, setToast] = useState(null)
  const [sonido, setSonido] = useState(true)
  const [recibos, setRecibos] = useState({})
  const [sel, setSel] = useState(null)
  const [entDB, setEntDB] = useState([])
  const [imgs, setImgs] = useState({})
  const modelsRef = useRef([]), simRef = useRef(0), accRef = useRef([]), sonidoRef = useRef(true), audio = useRef(null), toastT = useRef(null), recRef = useRef({})
  modelsRef.current = models; simRef.current = simT; accRef.current = acc; sonidoRef.current = sonido

  useEffect(() => {
    loadData().then(async (d) => {
      setData(d)
      setModels(await Promise.all(d.camiones.map(async (c) => {
        const stops = d.pedidos.filter((p) => p.camion_id === c.id).sort((a, b) => a.orden - b.orden)
        const dep = [c.longitud, c.latitud]
        const route = await getRoute([dep, ...stops.map((s) => [s.longitud, s.latitud]), dep])
        if (!route.real) setReal(false)
        return build({ camion: c, allStops: stops, doneBefore: 0, desviado: false, depot: dep, color: rgb(PALETA[(c.id - 1) % PALETA.length]) }, stops, route, 0)
      })))
    }).catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    if (!playing || calc) return
    let last = performance.now(), raf
    const f = (now) => { setSimT((t) => t + ((now - last) / 1000) * speed); last = now; raf = requestAnimationFrame(f) }
    raf = requestAnimationFrame(f)
    return () => cancelAnimationFrame(raf)
  }, [playing, speed, calc])

  const cargarEnt = async () => {
    if (!supabase) return
    const { data: r, error: e } = await supabase.from('entregas').select('pedido_id,camion_id,receptor,estado_paquete,observaciones,entregado_en').order('entregado_en', { ascending: false })
    if (!e && r) setEntDB(r)
  }
  useEffect(() => { cargarEnt(); const i = setInterval(cargarEnt, 8000); return () => clearInterval(i) }, [])
  useEffect(() => {
    if (sel != null && supabase && entDB.some((e) => e.pedido_id === sel) && !imgs[sel])
      supabase.from('entregas').select('firma,foto').eq('pedido_id', sel).single().then(({ data: d }) => d && setImgs((x) => ({ ...x, [sel]: d })))
  }, [sel, entDB])

  const addEv = (tipo, titulo, detalle) => setEventos((l) => [{ id: Math.random(), t: hora(simRef.current), tipo, titulo, detalle }, ...l].slice(0, 60))
  const avisar = (txt, tipo) => { setToast({ txt, tipo }); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(null), 7000) }
  const zumbido = (tipo) => {
    if (!sonidoRef.current) return
    try {
      const C = window.AudioContext || window.webkitAudioContext
      const ctx = audio.current || (audio.current = new C())
      if (ctx.state === 'suspended') ctx.resume()
      const seq = tipo === 'alerta' ? [[220, 0], [220, 0.3], [220, 0.6]] : [[660, 0], [880, 0.2]]
      seq.forEach(([fr, t]) => {
        const o = ctx.createOscillator(), g = ctx.createGain(), t0 = ctx.currentTime + t
        o.type = tipo === 'alerta' ? 'sawtooth' : 'sine'; o.frequency.value = fr
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.24)
        o.connect(g); g.connect(ctx.destination); o.start(t0); o.stop(t0 + 0.26)
      })
    } catch (e) { /* sin audio */ }
  }
  const fly = (p, zoom = 14) => setView({ longitude: p[0], latitude: p[1], zoom, pitch: 0, transitionDuration: 900, transitionInterpolator: new FlyToInterpolator() })

  async function crearAccidente(pos) {
    const now = simRef.current
    const origen = Math.random() < 0.5 ? 'el chofer' : 'el GPS (alerta automática)'
    const previos = accRef.current.map((a) => a.pos)
    setAcc((a) => [...a, { id: Date.now(), pos, hora: hora(now), origen }]); setTab('alertas'); setOpen(true)
    addEv('alerta', 'Accidente reportado', `Informado por ${origen}. Zona de afectación: ${RADIO} m.`)
    avisar(`⚠ Accidente reportado por ${origen}`, 'alerta'); zumbido('alerta')
    const afectados = modelsRef.current.filter((m) => {
      const d = distOf(m, now); if (d >= m.total) return false
      const i0 = m.cum.findIndex((c) => c >= d)
      return minDist(pos, [posAt(m, d), ...m.path.slice(i0 < 0 ? m.path.length : i0)]) < RADIO
    })
    if (!afectados.length) return addEv('info', 'Sin rutas afectadas', 'Ningún camión activo pasa por la zona del accidente.')
    setCalc(true)
    try {
      for (const m of afectados) {
        const d = distOf(m, now), p0 = posAt(m, d)
        const hechos = m.stopDist.filter((s) => s <= d + 0.5).length
        const rem = m.stops.slice(hechos)
        const paradas = [...rem.map((s) => [s.longitud, s.latitud]), m.depot]
        let ruta = await desviar(p0, paradas, pos, previos), espera = 0
        if (!ruta) { ruta = await getRoute([p0, ...paradas]); espera = 420 }
        const nm = build({ ...m, doneBefore: m.doneBefore + hechos, desviado: true }, rem, ruta, now + espera)
        const antes = (m.total - d) / 1000, desp = nm.total / 1000
        const extra = Math.round((nm.total - (m.total - d)) / V / 60 + espera / 60)
        setModels((ms) => ms.map((x) => (x.camion.id === m.camion.id ? nm : x)))
        if (espera) {
          addEv('espera', `${m.camion.nombre} detenido`, `No existe ruta alternativa que evite la zona. Espera ~7 min a que se despeje (+${extra} min).`)
          avisar(`${m.camion.nombre}: sin desvío posible, espera ~7 min`, 'desvio')
        } else {
          addEv('desvio', `${m.camion.nombre} desviado por accidente`, `Motivo: accidente informado por ${origen}. Ruta anterior ${antes.toFixed(1)} km → nueva ruta ${desp.toFixed(1)} km (${extra >= 0 ? '+' : ''}${extra} min).`)
          avisar(`↪ ${m.camion.nombre} desviado por accidente (${extra >= 0 ? '+' : ''}${extra} min)`, 'desvio')
        }
        zumbido('aviso')
      }
    } finally { setCalc(false) }
  }
  function accidenteAleatorio() {
    const act = modelsRef.current.filter((m) => distOf(m, simRef.current) < m.total * 0.6)
    if (!act.length) return addEv('info', 'Sin camiones disponibles', 'No hay camiones con ruta suficiente por delante.')
    const m = act[Math.floor(Math.random() * act.length)], d = distOf(m, simRef.current)
    crearAccidente(posAt(m, d + (m.total - d) * 0.35))
  }

  const sim = useMemo(() => {
    const trucks = [], pedidos = []
    models.forEach((m) => {
      const dist = distOf(m, simT), esp = Math.max(0, m.t0 - simT) / 60, total = m.allStops.length
      const hechos = m.doneBefore + m.stopDist.filter((s) => s <= dist + 0.5).length
      const fase = dist >= m.total - 0.5 ? 'En depósito' : hechos >= total ? 'Regresando' : 'En ruta'
      const eta = fase === 'En ruta' ? Math.round((m.stopDist[hechos - m.doneBefore] - dist) / V / 60 + esp) : fase === 'Regresando' ? Math.round((m.total - dist) / V / 60 + esp) : null
      trucks.push({ ...m.camion, color: m.color, position: posAt(m, dist), hechos, total, desviado: m.desviado, esperando: esp > 0, fase, eta })
      m.allStops.forEach((s, i) => {
        const estado = i < hechos ? 'Entregado' : i === hechos ? 'En camino' : 'Pendiente'
        pedidos.push({ ...s, estado, camionNombre: m.camion.nombre, eta: estado === 'Entregado' ? null : Math.round((m.stopDist[i - m.doneBefore] - dist) / V / 60 + esp) })
      })
    })
    return { trucks, pedidos }
  }, [models, simT])

  useEffect(() => {
    const nuevos = sim.pedidos.filter((p) => p.estado === 'Entregado' && !(p.id in recRef.current))
    if (nuevos.length) { const u = { ...recRef.current }; nuevos.forEach((p) => { u[p.id] = hora(simRef.current) }); recRef.current = u; setRecibos(u) }
  }, [sim])

  const entregados = sim.pedidos.filter((p) => p.estado === 'Entregado').length
  const total = data ? data.pedidos.length : 0
  const enDep = sim.trucks.filter((t) => t.fase === 'En depósito').length
  const kpis = [
    ['', total, 'Pedidos registrados'], ['ok', `${entregados} (${total ? Math.round((entregados / total) * 100) : 0}%)`, 'Entregados'],
    ['acc', sim.trucks.length - enDep, 'Camiones en ruta'], ['', enDep, 'En depósito'],
    ['', (data ? data.pedidos : []).reduce((a, p) => a + Number(p.valor || 0), 0).toLocaleString('es-AR'), 'Carga total (kg)'], ['bad', acc.length, 'Incidentes activos'],
  ]
  const live = models.filter((m) => distOf(m, simT) < m.total)
  const depot = models[0] ? [{ pos: models[0].depot, nombre: DEPOT_NOMBRE }] : []

  const layers = [
    new PathLayer({ id: 'rutas', data: live, getPath: (d) => d.path, getColor: (d) => [...d.color, d.desviado ? 230 : 130], getWidth: (d) => (d.desviado ? 5 : 3), widthUnits: 'pixels' }),
    new ScatterplotLayer({ id: 'zona', data: acc, getPosition: (d) => d.pos, getRadius: RADIO, radiusUnits: 'meters', getFillColor: [239, 68, 68, 70], stroked: true, getLineColor: [239, 68, 68, 230], lineWidthMinPixels: 2 }),
    new ScatterplotLayer({ id: 'pedidos', data: sim.pedidos, pickable: true, getPosition: (d) => [d.longitud, d.latitud], getFillColor: (d) => ESTADO[d.estado], getRadius: 6, radiusUnits: 'pixels', stroked: true, getLineColor: [15, 23, 42], lineWidthMinPixels: 1.5 }),
    new ScatterplotLayer({ id: 'depot', data: depot, pickable: true, getPosition: (d) => d.pos, getFillColor: [34, 211, 238], getRadius: 15, radiusUnits: 'pixels', stroked: true, getLineColor: [255, 255, 255], lineWidthMinPixels: 2 }),
    new TextLayer({ id: 'depot-t', data: depot, getPosition: (d) => d.pos, getText: () => 'CD', getSize: 12, getColor: [6, 18, 31], fontWeight: 800 }),
    new ScatterplotLayer({ id: 'camiones', data: sim.trucks.filter((t) => t.fase !== 'En depósito'), pickable: true, getPosition: (d) => d.position, getFillColor: (d) => d.color, getRadius: 11, radiusUnits: 'pixels', stroked: true, getLineColor: [255, 255, 255], lineWidthMinPixels: 2.5 }),
    new ScatterplotLayer({ id: 'acc', data: acc, pickable: true, getPosition: (d) => d.pos, getFillColor: [239, 68, 68], getRadius: 12, radiusUnits: 'pixels', stroked: true, getLineColor: [255, 255, 255], lineWidthMinPixels: 2 }),
    new TextLayer({ id: 'acc-t', data: acc, getPosition: (d) => d.pos, getText: () => '!', getSize: 16, getColor: [255, 255, 255], fontWeight: 800 }),
  ]
  const tooltip = ({ object, layer }) => {
    if (!object) return null
    const style = { backgroundColor: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '8px', padding: '8px 10px', fontSize: '12px', lineHeight: '1.5' }
    if (layer.id === 'camiones') return { style, html: `<b>${object.nombre}</b> · ${object.patente}<br/>Zona: ${object.zona}<br/>Entregas: ${object.hechos}/${object.total}<br/>${object.fase}` + (object.eta != null ? ` · ~${object.eta} min` : '') + (object.desviado ? '<br/>Ruta recalculada' : '') }
    if (layer.id === 'pedidos') return { style, html: `<b>Nombre:</b> ${object.nombre}<br/><b>Categoría:</b> ${object.categoria}<br/><b>Valor:</b> ${object.valor} kg<br/><b>Estado:</b> ${object.estado}<br/><b>Camión:</b> ${object.camionNombre}` + (object.eta != null ? `<br/><b>ETA:</b> ~${object.eta} min` : '<br/><i>Clic para ver el comprobante</i>') }
    if (layer.id === 'acc') return { style, html: `<b>Accidente</b><br/>Reportado ${object.hora} por ${object.origen}<br/>Radio ${RADIO} m` }
    if (layer.id === 'depot') return { style, html: `<b>${object.nombre}</b><br/>Salida y regreso de la flota` }
    return null
  }
  const onClick = (info) => {
    if (colocar && info.coordinate) { setColocar(false); return crearAccidente([info.coordinate[0], info.coordinate[1]]) }
    if (info.layer && info.layer.id === 'pedidos' && info.object && info.object.estado === 'Entregado') { setTab('entregas'); setSel(info.object.id); setOpen(true) }
  }
  const pedLista = sim.pedidos.filter((p) => filtro === 'Todos' || p.estado === filtro)
  const porId = Object.fromEntries(sim.pedidos.map((p) => [p.id, p]))
  const hh = (iso) => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  const lista = entDB.length
    ? entDB.map((e) => { const p = porId[e.pedido_id] || {}; return { id: e.pedido_id, nombre: p.nombre || `Pedido ${e.pedido_id}`, camion: p.camionNombre || '', valor: p.valor, hora: hh(e.entregado_en), receptor: e.receptor, conObs: e.estado_paquete !== 'Conforme', texto: e.observaciones, fuente: 'chofer' } })
    : sim.pedidos.filter((p) => p.estado === 'Entregado').sort((a, b) => (recibos[b.id] || '').localeCompare(recibos[a.id] || '') || b.id - a.id)
      .map((p) => { const r = recibo(p); return { id: p.id, nombre: p.nombre, camion: p.camionNombre, valor: p.valor, hora: recibos[p.id] || '-', receptor: r.receptor, conObs: !!r.obs, bultos: r.bultos, obsRaw: r.obs, fuente: 'demo', texto: r.obs ? `El cliente notó a simple vista: ${r.obs}. Recibió igualmente y firmó.` : 'Sin observaciones. Paquete recibido en buen estado.' } })
  const conObs = lista.filter((x) => x.conObs).length
  const porCamion = sim.trucks.map((t) => ({ nombre: t.nombre, n: entDB.filter((e) => e.camion_id === t.id).length, total: t.total }))

  return (
    <div className="app">
      <header className="top">
        <div className="brand"><div className="logo">L</div><div><h1>Tablero de Entregas · Buenos Aires</h1><small>PoC logística · datos simulados · salida: {DEPOT_NOMBRE}</small></div><a className="lnk" href="#chofer">Modo chofer</a></div>
        <div className="kpis">{kpis.map(([c, v, l]) => <div key={l} className={'kpi ' + c}><b>{v}</b><span>{l}</span></div>)}</div>
      </header>
      <div className="stage">
        <DeckGL initialViewState={view} controller layers={layers} getTooltip={tooltip} onClick={onClick} getCursor={({ isDragging }) => (colocar ? 'crosshair' : isDragging ? 'grabbing' : 'grab')}>
          <MapGL mapStyle={MAP_STYLE} />
        </DeckGL>
        {toast && <div className={'toast ' + toast.tipo}>{toast.txt}</div>}

        <button className={'toggle ' + (open ? '' : 'closed')} onClick={() => setOpen(!open)} title="Mostrar u ocultar panel">{open ? '‹' : '›'}</button>
        <aside className={'side ' + (open ? '' : 'closed')}>
          <div className="tabs">
            {[['flota', 'Flota'], ['pedidos', 'Pedidos'], ['entregas', 'Entregas'], ['alertas', `Alertas${acc.length ? ' (' + acc.length + ')' : ''}`]].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
          </div>
          <div className="content">
            {tab === 'flota' && sim.trucks.map((t) => (
              <div className="card" key={t.id} onClick={() => t.fase !== 'En depósito' && fly(t.position)}>
                <div className="row"><span className="dot" style={{ background: css(t.color) }} />
                  <div className="g"><b>{t.nombre}</b> <small>{t.zona}</small></div>
                  {t.esperando ? <span className="badge r">Detenido</span> : t.desviado && t.fase !== 'En depósito' ? <span className="badge">Desviado</span> : null}
                  <small>{t.fase === 'En ruta' ? `~${t.eta} min` : t.fase === 'Regresando' ? `Regresa ~${t.eta} min` : 'En depósito'}</small></div>
                <div className="bar"><i style={{ width: (t.hechos / t.total) * 100 + '%', background: css(t.color) }} /></div>
                <small>{t.hechos}/{t.total} entregas · {t.patente} · {t.fase}</small>
              </div>))}
            {tab === 'pedidos' && <>
              <div className="chips">{['Todos', 'Pendiente', 'En camino', 'Entregado'].map((f) => <button key={f} className={filtro === f ? 'on' : ''} onClick={() => setFiltro(f)}>{f}</button>)}</div>
              {pedLista.map((p) => (
                <div className="card" key={p.id} onClick={() => fly([p.longitud, p.latitud], 15)}>
                  <div className="row"><span className="dot" style={{ background: css(ESTADO[p.estado]) }} />
                    <div className="g"><b style={{ fontSize: 13 }}>{p.nombre}</b><br /><small>{p.categoria} · {p.valor} kg · {p.camionNombre}</small></div>
                    <small>{p.eta != null ? `~${p.eta} min` : 'OK'}</small></div>
                </div>))}
            </>}
            {tab === 'entregas' && <>
              <small>{entDB.length ? `${lista.length} de ${total} pedidos con comprobante enviado por los choferes` : 'Todavía no hay comprobantes enviados por choferes: se muestran entregas de demostración automáticas.'} · {conObs} con observaciones</small>
              {entDB.length > 0 && <div className="chips" style={{ margin: '8px 0' }}>{porCamion.map((c) => <button key={c.nombre} className={c.n >= c.total ? 'on' : ''}>{c.nombre.replace('Camión ', 'C')} {c.n}/{c.total}</button>)}</div>}
              <div style={{ margin: '8px 0 10px' }}><a className="lnk" href="#chofer">Abrir modo chofer</a></div>
              {lista.length === 0 && <small>Todavía no hay entregas.</small>}
              {lista.map((it) => {
                const im = sel !== it.id ? null : it.fuente === 'chofer' ? imgs[it.id] || {} : { firma: svgUrl(<Firma seed={it.id} />), foto: svgUrl(<Foto seed={it.id} obs={it.obsRaw} hora={it.hora} />) }
                return (
                  <div className="card" key={it.id} onClick={() => setSel(sel === it.id ? null : it.id)}>
                    <div className="row"><span className="dot" style={{ background: css(ESTADO.Entregado) }} />
                      <div className="g"><b style={{ fontSize: 13 }}>{it.nombre}</b><br /><small>{it.camion} · {it.hora} · {it.receptor}</small></div>
                      <span className={'badge ' + (it.conObs ? '' : 'ok')}>{it.conObs ? 'Con observación' : 'Conforme'}</span></div>
                    {im && <div className="rec" onClick={(e) => e.stopPropagation()}>
                      <div className="cap">FIRMA DEL RECEPTOR</div>{im.firma ? <img alt="Firma" src={im.firma} /> : <small>Cargando...</small>}
                      <div className="cap">FOTO DEL PEDIDO ENTREGADO{it.fuente === 'demo' ? ' (ilustrativa, ficticia)' : ''}</div>{im.foto ? <img alt="Foto de entrega" src={im.foto} /> : <small>Cargando...</small>}
                      <div className="datos">
                        <div><span>Recibió:</span> {it.receptor}</div>
                        <div><span>Entregó:</span> {it.camion} · <span>Hora:</span> {it.hora}</div>
                        <div><span>Pedido:</span> {it.valor} kg{it.bultos ? ` · ${it.bultos} bultos` : ''}</div>
                        <div><span>Estado del paquete:</span> {it.conObs ? 'Con observación' : 'Conforme, sin daños'}</div>
                        <div><span>Observaciones:</span> {it.texto}</div>
                      </div>
                    </div>}
                  </div>)
              })}
            </>}
            {tab === 'alertas' && <>
              <div className="sec" style={{ marginTop: 0 }}>ACCIDENTES ACTIVOS</div>
              {acc.length === 0 && <small>No hay accidentes activos.</small>}
              {acc.map((a) => (
                <div className="card" key={a.id} onClick={() => fly(a.pos, 15)}>
                  <div className="row"><span className="badge r">Accidente</span><div className="g"><small>{a.hora} · informado por {a.origen}</small></div>
                    <button className="badge" onClick={(e) => { e.stopPropagation(); setAcc((x) => x.filter((y) => y.id !== a.id)); addEv('info', 'Accidente resuelto', `Zona despejada (reportado a las ${a.hora}).`) }}>Resolver</button></div>
                </div>))}
              <div className="sec">HISTORIAL DE DESVÍOS Y ALERTAS</div>
              {eventos.length === 0 && <small>Sin eventos todavía. Probá "Simular accidente".</small>}
              {eventos.map((e) => <div key={e.id} className={'ev ' + e.tipo}><small>{e.t}</small> <b>{e.titulo}</b><p>{e.detalle}</p></div>)}
            </>}
          </div>
        </aside>

        <div className="status">{error ? `Error: ${error}` : !data ? 'Cargando datos...' : calc ? 'Recalculando rutas...' : `Datos: ${data.origen}` + (models.length === 0 ? ' · calculando rutas...' : real ? ' · calles reales (OSM)' : ' · rutas aproximadas')}</div>
        <div className="legend">
          {Object.entries(ESTADO).map(([k, c]) => <div key={k}><span className="dot" style={{ background: css(c) }} />Pedido {k.toLowerCase()}</div>)}
          <div><span className="dot" style={{ background: '#ef4444' }} />Accidente</div>
          <div><span className="dot" style={{ background: '#22d3ee' }} />Depósito (CD)</div>
        </div>
        <div className="docks">
          <div className="dock"><h4>SIMULACIÓN</h4><div className="btns">
            <button onClick={() => setPlaying(!playing)}>{playing ? 'Pausar' : 'Reanudar'}</button>
            <button onClick={() => window.location.reload()}>Reiniciar</button>
            {[5, 20, 60, 120].map((v) => <button key={v} className={speed === v ? 'on' : ''} onClick={() => setSpeed(v)}>x{v}</button>)}
            <span className="clock">{hora(simT)}</span></div></div>
          <div className="dock"><h4>INCIDENTES</h4><div className="btns">
            <button className="danger" disabled={calc} onClick={accidenteAleatorio}>Simular accidente</button>
            <button className={'danger ' + (colocar ? 'on' : '')} onClick={() => setColocar(!colocar)}>{colocar ? 'Hacé clic en el mapa...' : 'Marcar en el mapa'}</button>
            <button onClick={() => { setAcc([]); addEv('info', 'Accidentes despejados', 'Se limpiaron todas las zonas de accidente.') }}>Despejar</button>
            <button onClick={() => setSonido(!sonido)}>Sonido: {sonido ? 'ON' : 'OFF'}</button></div></div>
        </div>
      </div>
    </div>
  )
}
