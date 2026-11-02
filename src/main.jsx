import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import Chofer from './Chofer.jsx'
import './styles.css'

function Root() {
  const [h, setH] = useState(window.location.hash)
  useEffect(() => { const f = () => setH(window.location.hash); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f) }, [])
  const chofer = h === '#chofer'
  return (<><div style={{ display: chofer ? 'none' : 'block' }}><App /></div>{chofer && <Chofer />}</>)
}
createRoot(document.getElementById('root')).render(<Root />)
