# PoC Logística: Tablero de entregas (Supabase + React/Vite + deck.gl + Vercel)

Camiones ficticios (10) con pedidos ficticios (60) en Buenos Aires, moviéndose sobre rutas reales por calles.

## 1. Supabase
1. Creá un proyecto en https://supabase.com
2. SQL Editor → pegá y ejecutá `supabase/schema.sql` (crea tablas `camiones` y `pedidos` y carga los datos).
3. Project Settings → API → copiá **Project URL** y la clave **anon public**.

## 2. Correr en tu PC
```bash
npm install
cp .env.example .env      # completá URL y clave anon
npm run dev
```
Abrí la URL que muestra la terminal. Sin `.env` la app usa `public/datos_demo.json` (mismos datos) para que puedas probarla igual. Con `.env`, abrí la consola del navegador (F12): vas a ver los datos que llegan de Supabase.

## 3. Publicar en Vercel
1. Subí esta carpeta a un repositorio de GitHub (el `.env` no se sube).
2. En https://vercel.com → Add New Project → importá el repo (Vite se detecta solo).
3. En Environment Variables cargá `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
4. Deploy → obtenés la URL pública. Probala desde el celular.

## 4. Entrega
URL de Vercel + captura del tablero + repo + `datos/pedidos.csv` + `DESCRIPCION.md`.

## Notas
- Rutas: servidor público OSRM sobre OpenStreetMap (gratis, sin tránsito en vivo). Si no responde, la app dibuja líneas rectas.
- Mapa base: CARTO (sin API key).
- Mejora futura: Google Routes API para ETA con tránsito real.
