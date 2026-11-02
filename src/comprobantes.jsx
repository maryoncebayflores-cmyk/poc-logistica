import { renderToStaticMarkup } from 'react-dom/server'

// ---- comprobantes ficticios (firma, foto, observaciones), determinísticos por pedido ----
export const rnd = (s) => { const x = Math.sin(s * 9301 + 49297) * 233280; return x - Math.floor(x) }
const NOMBRES = ['Lucía Fernández', 'Martín Gómez', 'Sofía Rodríguez', 'Julián Pérez', 'Camila Sosa', 'Diego Álvarez', 'Valentina Romero', 'Nicolás Díaz', 'Carolina Torres', 'Federico Ruiz', 'Agustina Molina', 'Pablo Herrera']
const OBS = ['caja con un golpe leve en una esquina', 'embalaje con una marca de humedad', 'cinta de seguridad despegada en un borde', 'etiqueta rayada, sin daños visibles en el contenido', 'bolsa exterior con un pequeño rasguño']
export const recibo = (p) => { const r = (k) => rnd(p.id * 7 + k); return { receptor: NOMBRES[Math.floor(r(3) * NOMBRES.length)], obs: r(1) < 0.2 ? OBS[Math.floor(r(2) * OBS.length)] : null, bultos: 1 + Math.floor(r(4) * 3) } }

export function Firma({ seed }) {
  const r = (k) => rnd(seed * 13 + k)
  let d = `M ${12 + r(0) * 10} ${45 + r(1) * 15}`
  for (let i = 0; i < 5; i++) { const x = 30 + i * 28 + r(i + 2) * 10; d += ` C ${x - 14} ${10 + r(i + 9) * 60}, ${x - 4} ${15 + r(i + 20) * 55}, ${x} ${30 + r(i + 30) * 35}` }
  d += ` L ${150 + r(40) * 25} ${58 + r(41) * 10}`
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 190 80"><rect width="190" height="80" fill="#f8fafc" /><line x1="10" y1="68" x2="180" y2="68" stroke="#cbd5e1" /><path d={d} fill="none" stroke="#1e3a8a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
}
export function Foto({ seed, obs, hora: h }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 150">
      <defs><linearGradient id={'w' + seed} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d5dbe3" /><stop offset="1" stopColor="#aab3bf" /></linearGradient></defs>
      <rect width="240" height="150" fill={`url(#w${seed})`} /><rect y="112" width="240" height="38" fill="#7c8696" />
      <rect x="150" y="14" width="70" height="98" fill="#8a6a4b" /><rect x="156" y="20" width="58" height="86" fill="#a07f5c" />
      <polygon points="62,58 108,44 176,58 130,74" fill="#dcb07a" /><rect x="62" y="58" width="68" height="56" fill="#c8975a" /><polygon points="130,74 176,58 176,98 130,114" fill="#a97c46" />
      <rect x="90" y="58" width="12" height="56" fill="#ead9b3" opacity=".85" /><rect x="70" y="84" width="34" height="22" fill="#fff" /><line x1="74" y1="91" x2="98" y2="91" stroke="#475569" /><line x1="74" y1="97" x2="92" y2="97" stroke="#475569" />
      {obs && <><polygon points="62,58 80,58 62,74" fill="#6b3f14" /><path d="M62 74 L72 66 L80 58" stroke="#3b2208" strokeWidth="1.5" fill="none" /><ellipse cx="112" cy="104" rx="14" ry="6" fill="#5b3a17" opacity=".45" /></>}
      <rect x="0" y="132" width="240" height="18" fill="#0f172a" opacity=".75" /><text x="6" y="144" fontSize="9" fill="#fff">{`02/11/2026 ${h || ''} · entrega en puerta`}</text>
    </svg>
  )
}


export const svgUrl = (el) => 'data:image/svg+xml;utf8,' + encodeURIComponent(renderToStaticMarkup(el))
// comprobante ficticio completo (para la demostración automática)
export const demoComprobante = (p, h) => {
  const r = recibo(p)
  return { receptor: r.receptor, bultos: r.bultos, obs: r.obs, firma: svgUrl(<Firma seed={p.id} />), foto: svgUrl(<Foto seed={p.id} obs={r.obs} hora={h} />) }
}
