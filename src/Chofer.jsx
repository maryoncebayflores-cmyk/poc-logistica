import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { demoComprobante } from './comprobantes.jsx'

const hh = (iso) => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
const comprimir = (file) => new Promise((res) => {
  const img = new Image(), u = URL.createObjectURL(file)
  img.onload = () => {
    const k = Math.min(1, 720 / Math.max(img.width, img.height)), c = document.createElement('canvas')
    c.width = img.width * k; c.height = img.height * k
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u)
    res(c.toDataURL('image/jpeg', 0.6))
  }
  img.src = u
})

function Firmar({ onFirma, limpiar }) {
  const ref = useRef(null), dib = useRef(false)
  const pos = (e) => { const r = ref.current.getBoundingClientRect(); return [(e.clientX - r.left) * (ref.current.width / r.width), (e.clientY - r.top) * (ref.current.height / r.height)] }
  const ctx = () => { const c = ref.current.getContext('2d'); c.lineWidth = 3; c.lineCap = 'round'; c.strokeStyle = '#1e3a8a'; return c }
  useEffect(() => { const c = ref.current.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, 600, 220); onFirma(null) }, [limpiar])
  const down = (e) => { dib.current = true; const [x, y] = pos(e), c = ctx(); c.beginPath(); c.moveTo(x, y); ref.current.setPointerCapture(e.pointerId) }
  const move = (e) => { if (!dib.current) return; const [x, y] = pos(e), c = ctx(); c.lineTo(x, y); c.stroke() }
  const up = () => { if (dib.current) { dib.current = false; onFirma(ref.current.toDataURL('image/png')) } }
  return <canvas ref={ref} width={600} height={220} className="firma" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} />
}

export default function Chofer() {
  const [camiones, setCamiones] = useState([]), [pedidos, setPedidos] = useState([]), [hechas, setHechas] = useState({})
  const [camion, setCamion] = useState(null), [sel, setSel] = useState(null)
  const [receptor, setReceptor] = useState(''), [firma, setFirma] = useState(null), [foto, setFoto] = useState(null)
  const [estado, setEstado] = useState('Conforme'), [obs, setObs] = useState(''), [lk, setLk] = useState(0)
  const [msg, setMsg] = useState(''), [busy, setBusy] = useState(false)

  const cargar = async () => {
    if (!supabase) return
    const [c, p, e] = await Promise.all([
      supabase.from('camiones').select('id,nombre,zona').order('id'),
      supabase.from('pedidos').select('id,nombre,categoria,valor,camion_id,orden').order('camion_id').order('orden'),
      supabase.from('entregas').select('pedido_id,entregado_en'),
    ])
    if (c.error || p.error) return setMsg('Error: ' + (c.error || p.error).message)
    if (e.error) setMsg('Falta crear la tabla "entregas": ejecutá supabase/entregas.sql en Supabase.')
    setCamiones(c.data); setPedidos(p.data)
    setHechas(Object.fromEntries((e.data || []).map((r) => [r.pedido_id, r])))
  }
  useEffect(() => { cargar() }, [])

  const lista = pedidos.filter((p) => p.camion_id === camion)
  const abrir = (p) => { setSel(p); setReceptor(''); setFoto(null); setEstado('Conforme'); setObs(''); setLk((x) => x + 1); setMsg('') }
  async function enviar() {
    setBusy(true)
    const { error } = await supabase.from('entregas').insert({ pedido_id: sel.id, camion_id: sel.camion_id, receptor, firma, foto, estado_paquete: estado, observaciones: obs || 'Sin observaciones. Paquete recibido en buen estado.' })
    setBusy(false)
    if (error) return setMsg('Error al enviar: ' + error.message)
    setSel(null); setMsg('Entrega confirmada y enviada al tablero.'); cargar()
  }
  async function demo(ps) {
    setBusy(true)
    const rows = ps.filter((p) => !hechas[p.id]).map((p) => {
      const d = demoComprobante(p, hh(new Date().toISOString()))
      return { pedido_id: p.id, camion_id: p.camion_id, receptor: d.receptor, firma: d.firma, foto: d.foto, estado_paquete: d.obs ? 'Con observación' : 'Conforme',
        observaciones: d.obs ? `El cliente notó a simple vista: ${d.obs}. Recibió igualmente y firmó.` : 'Sin observaciones. Paquete recibido en buen estado.' }
    })
    if (rows.length) {
      const { error } = await supabase.from('entregas').upsert(rows, { onConflict: 'pedido_id', ignoreDuplicates: true })
      setMsg(error ? 'Error: ' + error.message : `${rows.length} comprobantes de demostración enviados.`)
    }
    setBusy(false); cargar()
  }

  if (!supabase) return <div className="ch"><a className="lnk" href="#">← Volver al tablero</a><h2>Modo chofer</h2><div className="ev alerta">Falta configurar Supabase (variables VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY).</div></div>
  return (
    <div className="ch">
      <a className="lnk" href="#">← Volver al tablero</a>
      <h2>Modo chofer</h2><small>Confirmá cada entrega con firma, foto y observaciones del cliente.</small>
      {msg && <div className="ev desvio" style={{ marginTop: 10 }}>{msg}</div>}
      <label style={{ display: 'block', marginTop: 12 }}>Camión</label>
      <select value={camion || ''} onChange={(e) => { setCamion(Number(e.target.value) || null); setSel(null) }}>
        <option value="">Elegí tu camión…</option>{camiones.map((c) => <option key={c.id} value={c.id}>{c.nombre} · {c.zona}</option>)}
      </select>

      {camion && !sel && <>
        <div className="sec">MIS ENTREGAS ({lista.filter((p) => hechas[p.id]).length}/{lista.length})</div>
        {lista.map((p) => (
          <div className="card" key={p.id} onClick={() => !hechas[p.id] && abrir(p)}>
            <div className="row"><div className="g"><b style={{ fontSize: 13 }}>{p.nombre}</b><br /><small>{p.categoria} · {p.valor} kg</small></div>
              {hechas[p.id] ? <span className="badge ok">Entregado {hh(hechas[p.id].entregado_en)}</span> : <span className="badge">Pendiente</span>}</div>
          </div>))}
        <button className="btn sec2" disabled={busy} onClick={() => demo(lista)}>Autocompletar este camión (demo)</button>
      </>}

      {sel && <>
        <div className="sec">CONFIRMAR ENTREGA</div>
        <b>{sel.nombre}</b><br /><small>{sel.categoria} · {sel.valor} kg</small>
        <label style={{ display: 'block', marginTop: 10 }}>Nombre de quien recibe</label>
        <input type="text" value={receptor} onChange={(e) => setReceptor(e.target.value)} placeholder="Nombre y apellido" />
        <label>Firma del cliente (obligatoria)</label>
        <Firmar onFirma={setFirma} limpiar={lk} />
        <button className="btn sec2" style={{ margin: '8px 0 12px' }} onClick={() => setLk(lk + 1)}>Borrar firma</button>
        <label style={{ display: 'block' }}>Foto del pedido entregado (obligatoria)</label>
        <input type="file" accept="image/*" capture="environment" onChange={async (e) => { const f = e.target.files[0]; if (f) setFoto(await comprimir(f)) }} />
        {foto && <img className="prev" src={foto} alt="Foto de entrega" />}
        <label style={{ display: 'block', marginTop: 10 }}>Estado del paquete</label>
        <select value={estado} onChange={(e) => setEstado(e.target.value)}><option>Conforme</option><option>Con observación</option></select>
        <label>Observaciones del cliente {estado !== 'Conforme' ? '(obligatorio)' : ''}</label>
        <textarea rows={3} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ej.: la caja llegó con un golpe en una esquina" />
        <button className="btn" disabled={busy || !receptor || !firma || !foto || (estado !== 'Conforme' && !obs)} onClick={enviar}>{busy ? 'Enviando...' : 'Confirmar entrega'}</button>
        <button className="btn sec2" style={{ marginTop: 8 }} onClick={() => setSel(null)}>Cancelar</button>
      </>}

      <div className="sec">DEMOSTRACIÓN</div>
      <button className="btn sec2" disabled={busy} onClick={() => demo(pedidos)}>Cargar comprobantes de toda la flota (demo)</button>
      <small style={{ display: 'block', marginTop: 6 }}>Genera firma, foto y observaciones ficticias para todos los pedidos pendientes y los envía al tablero.</small>
    </div>
  )
}
