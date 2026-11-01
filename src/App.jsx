import { useEffect, useMemo, useState } from 'react'
import { DeckGL, ScatterplotLayer, PathLayer } from 'deck.gl'
import MapGL from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { supabase } from './supabase'

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
const VIEW = { longitude: -58.43, latitude: -34.605, zoom: 11.3, pitch: 0 }
const V = 8 // velocidad media del camión en m/s (~29 km/h)
const ESTADO_COLOR = { Entregado: [34, 160, 80], 'En camino': [245, 166, 35], Pendiente: [140, 150, 160] }

const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const hav = (a, b) => {
  const R = 6371000, r = Math.PI / 180
  const dLa = (b[1] - a[1]) * r, dLo = (b[0] - a[0]) * r
  const x = Math.sin(dLa / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLo / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}

async function loadData() {
  if (supabase) {
    const [c, p] = await Promise.all([
      supabase.from('camiones').select('*').order('id'),
      supabase.from('pedidos').select('*').order('camion_id').order('orden'),
    ])
    if (c.error || p.error) throw new Error((c.error || p.error).message)
    console.log('Supabase camiones:', c.data, 'pedidos:', p.data)
    return { camiones: c.data, pedidos: p.data, origen: 'Supabase' }
  }
  const j = await (await fetch('/datos_demo.json')).json()
  return { ...j, origen: 'archivo local de demo (configurá Supabase en .env)' }
}

// Ruta real por calles (OSRM público / OpenStreetMap). Si falla, usa líneas rectas.
async function getRoute(coords) {
  try {
    const q = coords.map((c) => c.join(',')).join(';')
    const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${q}?overview=full&geometries=geojson`)
    const j = await r.json()
    if (j.code === 'Ok') return { path: j.routes[0].geometry.coordinates, legs: j.routes[0].legs.map((l) => l.distance), real: true }
  } catch (e) { console.warn('OSRM no disponible', e) }
  return { path: coords, legs: null, real: false }
}

function prepare(camion, stops, route) {
  const { path } = route
  const cum = [0]
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + hav(path[i - 1], path[i]))
  const total = cum[cum.length - 1]
  let stopDist
  if (route.legs && route.legs.length === stops.length) {
    const s = route.legs.reduce((a, b) => a + b, 0); let acc = 0
    stopDist = route.legs.map((l) => (acc += l) / s * total)
  } else {
    stopDist = stops.map((st) => {
      let best = 0, bd = Infinity
      path.forEach((p, i) => { const d = hav(p, [st.longitud, st.latitud]); if (d < bd) { bd = d; best = i } })
      return cum[best]
    })
  }
  return { camion, stops, path, cum, total, stopDist, color: hexRgb(camion.color || '#4363d8') }
}

function posAt(t, d) {
  const { cum, path } = t
  if (d <= 0) return path[0]
  if (d >= t.total) return path[path.length - 1]
  let lo = 0, hi = cum.length - 1
  while (hi - lo > 1) { const m = (lo + hi) >> 1; cum[m] <= d ? (lo = m) : (hi = m) }
  const f = (d - cum[lo]) / ((cum[hi] - cum[lo]) || 1)
  return [path[lo][0] + (path[hi][0] - path[lo][0]) * f, path[lo][1] + (path[hi][1] - path[lo][1]) * f]
}

const hora = (s) => {
  const m = 8 * 60 + Math.floor(s / 60)
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export default function App() {
  const [data, setData] = useState(null)
  const [models, setModels] = useState([])
  const [error, setError] = useState('')
  const [simT, setSimT] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(20)
  const [rutasReales, setRutasReales] = useState(true)

  useEffect(() => {
    loadData().then(async (d) => {
      setData(d)
      const ms = await Promise.all(d.camiones.map(async (c) => {
        const stops = d.pedidos.filter((p) => p.camion_id === c.id).sort((a, b) => a.orden - b.orden)
        const route = await getRoute([[c.longitud, c.latitud], ...stops.map((s) => [s.longitud, s.latitud])])
        if (!route.real) setRutasReales(false)
        return prepare(c, stops, route)
      }))
      setModels(ms)
    }).catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    if (!playing) return
    let last = performance.now(), raf
    const f = (now) => { setSimT((t) => t + ((now - last) / 1000) * speed); last = now; raf = requestAnimationFrame(f) }
    raf = requestAnimationFrame(f)
    return () => cancelAnimationFrame(raf)
  }, [playing, speed])

  const sim = useMemo(() => {
    const trucks = [], pedidos = []
    models.forEach((m) => {
      const dist = Math.min(simT * V, m.total)
      const hechos = m.stopDist.filter((s) => s <= dist + 0.5).length
      trucks.push({ ...m.camion, position: posAt(m, dist), color: m.color, hechos, total: m.stops.length,
        eta: hechos < m.stops.length ? Math.round((m.stopDist[hechos] - dist) / V / 60) : null, enRuta: hechos < m.stops.length })
      m.stops.forEach((s, i) => {
        const estado = i < hechos ? 'Entregado' : i === hechos ? 'En camino' : 'Pendiente'
        pedidos.push({ ...s, estado, camionNombre: m.camion.nombre,
          eta: estado === 'Entregado' ? null : Math.round((m.stopDist[i] - dist) / V / 60) })
      })
    })
    return { trucks, pedidos }
  }, [models, simT])

  const entregados = sim.pedidos.filter((p) => p.estado === 'Entregado').length
  const enRuta = sim.trucks.filter((t) => t.enRuta).length
  const carga = (data ? data.pedidos : []).reduce((a, p) => a + Number(p.valor || 0), 0)

  const layers = [
    new PathLayer({ id: 'rutas', data: models, getPath: (d) => d.path, getColor: (d) => [...d.color, 150], getWidth: 4, widthUnits: 'pixels' }),
    new ScatterplotLayer({ id: 'pedidos', data: sim.pedidos, pickable: true, getPosition: (d) => [d.longitud, d.latitud],
      getFillColor: (d) => ESTADO_COLOR[d.estado], getRadius: 7, radiusUnits: 'pixels', stroked: true, getLineColor: [255, 255, 255], lineWidthMinPixels: 1.5 }),
    new ScatterplotLayer({ id: 'camiones', data: sim.trucks, pickable: true, getPosition: (d) => d.position,
      getFillColor: (d) => d.color, getRadius: 12, radiusUnits: 'pixels', stroked: true, getLineColor: [255, 255, 255], lineWidthMinPixels: 3 }),
  ]

  const tooltip = ({ object, layer }) => {
    if (!object) return null
    const style = { fontSize: '12px', lineHeight: '1.4' }
    if (layer.id === 'camiones')
      return { style, html: `<b>${object.nombre}</b><br/>Patente: ${object.patente}<br/>Zona: ${object.zona}<br/>Entregas: ${object.hechos}/${object.total}` + (object.eta != null ? `<br/>Próxima entrega en ~${object.eta} min` : '<br/>Ruta completada') }
    if (layer.id === 'pedidos')
      return { style, html: `<b>Nombre:</b> ${object.nombre}<br/><b>Categoría:</b> ${object.categoria}<br/><b>Valor:</b> ${object.valor} kg<br/><b>Estado:</b> ${object.estado}<br/><b>Camión:</b> ${object.camionNombre}` + (object.eta != null ? `<br/><b>ETA:</b> ~${object.eta} min` : '') }
    return null
  }

  return (
    <div className="app">
      <header>
        <h1>Tablero de Entregas - Buenos Aires<small>PoC de logística · datos ficticios</small></h1>
        <div className="kpis">
          <div className="kpi"><b>{data ? data.pedidos.length : '-'}</b><span>Pedidos registrados</span></div>
          <div className="kpi"><b>{entregados}</b><span>Entregados</span></div>
          <div className="kpi"><b>{enRuta}</b><span>Camiones en ruta</span></div>
          <div className="kpi"><b>{carga.toLocaleString('es-AR')}</b><span>Carga total (kg)</span></div>
        </div>
      </header>
      <div className="mapa">
        <DeckGL initialViewState={VIEW} controller layers={layers} getTooltip={tooltip}>
          <MapGL mapStyle={MAP_STYLE} />
        </DeckGL>
        <div className="panel">
          <h3>Flota ({sim.trucks.length} camiones)</h3>
          <div className="ctrl">
            <button onClick={() => setPlaying(!playing)}>{playing ? 'Pausar' : 'Reanudar'}</button>
            <button onClick={() => setSimT(0)}>Reiniciar</button>
            <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
              {[5, 20, 60, 120].map((v) => <option key={v} value={v}>x{v}</option>)}
            </select>
            <span className="reloj">{hora(simT)}</span>
          </div>
          {sim.trucks.map((t) => (
            <div className="cam" key={t.id}>
              <span className="dot" style={{ background: `rgb(${t.color})` }} />
              <span className="n">{t.nombre} <small>{t.zona}</small></span>
              <small>{t.hechos}/{t.total}{t.eta != null ? ` · ${t.eta}'` : ' ✓'}</small>
            </div>
          ))}
          <div className="leyenda">Pedidos: gris = pendiente · naranja = en camino · verde = entregado. Pasá el mouse por un punto o camión.</div>
        </div>
        <div className="msg">
          {error ? `Error: ${error}` : !data ? 'Cargando datos...' : `Datos: ${data.origen}` + (models.length === 0 ? ' · calculando rutas...' : rutasReales ? ' · rutas por calles reales (OSM)' : ' · rutas aproximadas')}
        </div>
      </div>
    </div>
  )
}
