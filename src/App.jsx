import { useEffect, useMemo, useRef, useState } from 'react'
import { DeckGL, ScatterplotLayer, PathLayer, TextLayer, FlyToInterpolator } from 'deck.gl'
import MapGL from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { supabase } from './supabase'

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
const VIEW = { longitude: -58.43, latitude: -34.605, zoom: 11.3, pitch: 0 }
const V = 8 // m/s (~29 km/h)
const RADIO = 150 // m de afectación del accidente
const PALETA = ['#22d3ee', '#a78bfa', '#f472b6', '#fb923c', '#34d399', '#60a5fa', '#facc15', '#f87171', '#2dd4bf', '#c084fc']
const ESTADO = { Entregado: [52, 211, 153], 'En camino': [251, 191, 36], Pendiente: [148, 163, 184] }
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const css = (c) => `rgb(${c.join(',')})`
const hav = (a, b) => {
  const r = Math.PI / 180, dLa = (b[1] - a[1]) * r, dLo = (b[0] - a[0]) * r
  const x = Math.sin(dLa / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLo / 2) ** 2
  return 12742000 * Math.asin(Math.sqrt(x))
}
const minDist = (p, path) => path.reduce((m, q) => Math.min(m, hav(p, q)), Infinity)
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

// Ruta alternativa que esquiva el accidente: pasa por un punto de desvío a 700 m / 1200 m
async function desviar(inicio, paradas, acc) {
  const dLat = (m) => m / 111320, dLon = (m) => m / (111320 * Math.cos((acc[1] * Math.PI) / 180))
  for (const m of [700, 1200]) {
    const cands = [[m, 0], [-m, 0], [0, m], [0, -m]].map(([x, y]) => [acc[0] + dLon(x), acc[1] + dLat(y)])
    const rs = await Promise.all(cands.map(async (wp) => {
      const r = await osrm([inicio, wp, ...paradas])
      if (!r || minDist(acc, r.path) < RADIO) return null
      return { ...r, legs: [r.legs[0] + r.legs[1], ...r.legs.slice(2)] }
    }))
    const ok = rs.filter(Boolean).sort((a, b) => a.legs.reduce((x, y) => x + y, 0) - b.legs.reduce((x, y) => x + y, 0))
    if (ok.length) return ok[0]
  }
  return null
}

function build(base, stops, route, t0) {
  const { path } = route, cum = [0]
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + hav(path[i - 1], path[i]))
  const total = cum[cum.length - 1]
  let stopDist
  if (route.legs && route.legs.length === stops.length) {
    const s = route.legs.reduce((a, b) => a + b, 0); let acc = 0
    stopDist = route.legs.map((l) => ((acc += l) / s) * total)
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
  const [log, setLog] = useState([])
  const [colocar, setColocar] = useState(false)
  const [calc, setCalc] = useState(false)
  const [view, setView] = useState(VIEW)
  const modelsRef = useRef([]), simRef = useRef(0)
  modelsRef.current = models; simRef.current = simT

  useEffect(() => {
    loadData().then(async (d) => {
      setData(d)
      setModels(await Promise.all(d.camiones.map(async (c) => {
        const stops = d.pedidos.filter((p) => p.camion_id === c.id).sort((a, b) => a.orden - b.orden)
        const route = await getRoute([[c.longitud, c.latitud], ...stops.map((s) => [s.longitud, s.latitud])])
        if (!route.real) setReal(false)
        return build({ camion: c, allStops: stops, doneBefore: 0, desviado: false, color: rgb(PALETA[(c.id - 1) % PALETA.length]) }, stops, route, 0)
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

  const addLog = (txt, tipo = 'info') => setLog((l) => [{ id: Math.random(), t: hora(simRef.current), txt, tipo }, ...l].slice(0, 40))
  const fly = (p, zoom = 14) => setView({ longitude: p[0], latitude: p[1], zoom, pitch: 0, transitionDuration: 900, transitionInterpolator: new FlyToInterpolator() })

  async function crearAccidente(pos) {
    const now = simRef.current
    setAcc((a) => [...a, { id: Date.now(), pos, hora: hora(now) }]); setTab('incidentes'); setOpen(true)
    addLog(`Accidente reportado (radio ${RADIO} m).`, 'alerta')
    const afectados = modelsRef.current.filter((m) => { const d = distOf(m, now); return d < m.total && m.path.some((p, i) => m.cum[i] >= d && hav(p, pos) < RADIO) })
    if (!afectados.length) return addLog('Ninguna ruta activa quedó afectada.')
    setCalc(true)
    try {
      for (const m of afectados) {
        const d = distOf(m, now), p0 = posAt(m, d)
        const hechos = m.stopDist.filter((s) => s <= d + 0.5).length
        const rem = m.stops.slice(hechos)
        if (!rem.length) continue
        const paradas = rem.map((s) => [s.longitud, s.latitud])
        let ruta = await desviar(p0, paradas, pos), espera = 0
        if (!ruta) { ruta = await getRoute([p0, ...paradas]); espera = 420 }
        const nm = build({ ...m, doneBefore: m.doneBefore + hechos, desviado: true }, rem, ruta, now + espera)
        const extra = Math.round((nm.total - (m.total - d)) / V / 60 + espera / 60)
        setModels((ms) => ms.map((x) => (x.camion.id === m.camion.id ? nm : x)))
        addLog(`${m.camion.nombre}: ${espera ? 'sin desvío posible, espera ~7 min' : 'nueva ruta calculada'} (${extra >= 0 ? '+' : ''}${extra} min).`, 'desvio')
      }
    } finally { setCalc(false) }
  }
  function accidenteAleatorio() {
    const act = modelsRef.current.filter((m) => distOf(m, simRef.current) < m.total * 0.6)
    if (!act.length) return addLog('No hay camiones con ruta suficiente por delante.')
    const m = act[Math.floor(Math.random() * act.length)], d = distOf(m, simRef.current)
    crearAccidente(posAt(m, d + (m.total - d) * 0.35))
  }

  const sim = useMemo(() => {
    const trucks = [], pedidos = []
    models.forEach((m) => {
      const dist = distOf(m, simT), esp = Math.max(0, m.t0 - simT) / 60, total = m.allStops.length
      const hechos = m.doneBefore + m.stopDist.filter((s) => s <= dist + 0.5).length
      trucks.push({ ...m.camion, color: m.color, position: posAt(m, dist), hechos, total, desviado: m.desviado, esperando: esp > 0,
        enRuta: hechos < total, eta: hechos < total ? Math.round((m.stopDist[hechos - m.doneBefore] - dist) / V / 60 + esp) : null })
      m.allStops.forEach((s, i) => {
        const estado = i < hechos ? 'Entregado' : i === hechos ? 'En camino' : 'Pendiente'
        pedidos.push({ ...s, estado, camionNombre: m.camion.nombre, eta: estado === 'Entregado' ? null : Math.round((m.stopDist[i - m.doneBefore] - dist) / V / 60 + esp) })
      })
    })
    return { trucks, pedidos }
  }, [models, simT])

  const entregados = sim.pedidos.filter((p) => p.estado === 'Entregado').length
  const total = data ? data.pedidos.length : 0
  const kpis = [
    ['', total, 'Pedidos registrados'], ['ok', `${entregados} (${total ? Math.round((entregados / total) * 100) : 0}%)`, 'Entregados'],
    ['acc', sim.trucks.filter((t) => t.enRuta).length, 'Camiones en ruta'],
    ['', (data ? data.pedidos : []).reduce((a, p) => a + Number(p.valor || 0), 0).toLocaleString('es-AR'), 'Carga total (kg)'],
    ['bad', acc.length, 'Incidentes activos'],
  ]
  const live = models.filter((m) => distOf(m, simT) < m.total)

  const layers = [
    new PathLayer({ id: 'rutas', data: live, getPath: (d) => d.path, getColor: (d) => [...d.color, d.desviado ? 230 : 140], getWidth: (d) => (d.desviado ? 5 : 3), widthUnits: 'pixels' }),
    new ScatterplotLayer({ id: 'zona', data: acc, getPosition: (d) => d.pos, getRadius: RADIO, radiusUnits: 'meters', getFillColor: [239, 68, 68, 70], stroked: true, getLineColor: [239, 68, 68, 230], lineWidthMinPixels: 2 }),
    new ScatterplotLayer({ id: 'pedidos', data: sim.pedidos, pickable: true, getPosition: (d) => [d.longitud, d.latitud], getFillColor: (d) => ESTADO[d.estado], getRadius: 6, radiusUnits: 'pixels', stroked: true, getLineColor: [15, 23, 42], lineWidthMinPixels: 1.5 }),
    new ScatterplotLayer({ id: 'camiones', data: sim.trucks, pickable: true, getPosition: (d) => d.position, getFillColor: (d) => d.color, getRadius: 11, radiusUnits: 'pixels', stroked: true, getLineColor: [255, 255, 255], lineWidthMinPixels: 2.5 }),
    new ScatterplotLayer({ id: 'acc', data: acc, pickable: true, getPosition: (d) => d.pos, getFillColor: [239, 68, 68], getRadius: 12, radiusUnits: 'pixels', stroked: true, getLineColor: [255, 255, 255], lineWidthMinPixels: 2 }),
    new TextLayer({ id: 'acc-t', data: acc, getPosition: (d) => d.pos, getText: () => '!', getSize: 16, getColor: [255, 255, 255], fontWeight: 800 }),
  ]
  const tooltip = ({ object, layer }) => {
    if (!object) return null
    const style = { backgroundColor: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '8px', padding: '8px 10px', fontSize: '12px', lineHeight: '1.5' }
    if (layer.id === 'camiones') return { style, html: `<b>${object.nombre}</b> · ${object.patente}<br/>Zona: ${object.zona}<br/>Entregas: ${object.hechos}/${object.total}` + (object.eta != null ? `<br/>Próxima entrega en ~${object.eta} min` : '<br/>Ruta completada') + (object.desviado ? '<br/>Ruta recalculada' : '') }
    if (layer.id === 'pedidos') return { style, html: `<b>Nombre:</b> ${object.nombre}<br/><b>Categoría:</b> ${object.categoria}<br/><b>Valor:</b> ${object.valor} kg<br/><b>Estado:</b> ${object.estado}<br/><b>Camión:</b> ${object.camionNombre}` + (object.eta != null ? `<br/><b>ETA:</b> ~${object.eta} min` : '') }
    if (layer.id === 'acc') return { style, html: `<b>Accidente</b><br/>Reportado ${object.hora}<br/>Radio ${RADIO} m` }
    return null
  }
  const pedLista = sim.pedidos.filter((p) => filtro === 'Todos' || p.estado === filtro)

  return (
    <div className="app">
      <header className="top">
        <div className="brand"><div className="logo">L</div><div><h1>Tablero de Entregas · Buenos Aires</h1><small>PoC logística · datos simulados</small></div></div>
        <div className="kpis">{kpis.map(([c, v, l]) => <div key={l} className={'kpi ' + c}><b>{v}</b><span>{l}</span></div>)}</div>
      </header>
      <div className="stage">
        <DeckGL initialViewState={view} controller layers={layers} getTooltip={tooltip} getCursor={({ isDragging }) => (colocar ? 'crosshair' : isDragging ? 'grabbing' : 'grab')}
          onClick={(info) => { if (colocar && info.coordinate) { setColocar(false); crearAccidente([info.coordinate[0], info.coordinate[1]]) } }}>
          <MapGL mapStyle={MAP_STYLE} />
        </DeckGL>

        <button className={'toggle ' + (open ? '' : 'closed')} onClick={() => setOpen(!open)} title="Mostrar u ocultar panel">{open ? '‹' : '›'}</button>
        <aside className={'side ' + (open ? '' : 'closed')}>
          <div className="tabs">
            {[['flota', 'Flota'], ['pedidos', 'Pedidos'], ['incidentes', `Incidentes${acc.length ? ' (' + acc.length + ')' : ''}`]].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
          </div>
          <div className="content">
            {tab === 'flota' && sim.trucks.map((t) => (
              <div className="card" key={t.id} onClick={() => fly(t.position)}>
                <div className="row"><span className="dot" style={{ background: css(t.color) }} />
                  <div className="g"><b>{t.nombre}</b> <small>{t.zona}</small></div>
                  {t.esperando ? <span className="badge r">Detenido</span> : t.desviado && t.enRuta ? <span className="badge">Desviado</span> : null}
                  <small>{t.eta != null ? `~${t.eta} min` : 'Completo'}</small></div>
                <div className="bar"><i style={{ width: (t.hechos / t.total) * 100 + '%', background: css(t.color) }} /></div>
                <small>{t.hechos}/{t.total} entregas · {t.patente}</small>
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
            {tab === 'incidentes' && <>
              {acc.length === 0 && <small>No hay accidentes activos. Usá los botones de abajo para simular uno.</small>}
              {acc.map((a) => (
                <div className="card" key={a.id} onClick={() => fly(a.pos, 15)}>
                  <div className="row"><span className="badge r">Accidente</span><div className="g"><small>Reportado {a.hora}</small></div>
                    <button className="badge" onClick={(e) => { e.stopPropagation(); setAcc((x) => x.filter((y) => y.id !== a.id)); addLog('Accidente resuelto.') }}>Resolver</button></div>
                </div>))}
              <div style={{ margin: '10px 0 6px' }}><small>REGISTRO DE EVENTOS</small></div>
              {log.map((l) => <div key={l.id} className={'log ' + l.tipo}><small>{l.t}</small> {l.txt}</div>)}
            </>}
          </div>
        </aside>

        <div className="status">{error ? `Error: ${error}` : !data ? 'Cargando datos...' : calc ? 'Recalculando rutas...' : `Datos: ${data.origen}` + (models.length === 0 ? ' · calculando rutas...' : real ? ' · calles reales (OSM)' : ' · rutas aproximadas')}</div>
        <div className="legend">
          {Object.entries(ESTADO).map(([k, c]) => <div key={k}><span className="dot" style={{ background: css(c) }} />Pedido {k.toLowerCase()}</div>)}
          <div><span className="dot" style={{ background: '#ef4444' }} />Accidente</div>
        </div>
        <div className="dock">
          <button onClick={() => setPlaying(!playing)}>{playing ? 'Pausar' : 'Reanudar'}</button>
          <button onClick={() => { setSimT(0); setAcc([]); setLog([]); setPlaying(true); window.location.reload() }}>Reiniciar</button>
          {[5, 20, 60, 120].map((v) => <button key={v} className={speed === v ? 'on' : ''} onClick={() => setSpeed(v)}>x{v}</button>)}
          <span className="clock">{hora(simT)}</span><span className="sep" />
          <button className="danger" disabled={calc} onClick={accidenteAleatorio}>Simular accidente</button>
          <button className={'danger ' + (colocar ? 'on' : '')} onClick={() => setColocar(!colocar)}>{colocar ? 'Hacé clic en el mapa...' : 'Marcar en el mapa'}</button>
          <button onClick={() => { setAcc([]); addLog('Accidentes despejados.') }}>Despejar</button>
        </div>
      </div>
    </div>
  )
}
