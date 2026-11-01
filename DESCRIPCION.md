# Descripción del proyecto (5 líneas)

1. **Problema:** se analizó el seguimiento de la última milla: dónde están los camiones, qué pedidos ya se entregaron y cuánto falta para la próxima entrega en Buenos Aires.
2. **Datos:** dataset ficticio de 10 camiones y 60 pedidos con coordenadas de barrios de CABA, almacenado en Supabase; las rutas se calculan sobre calles reales de OpenStreetMap.
3. **Mapa:** representa cada pedido como un punto (gris pendiente, naranja en camino, verde entregado) y cada camión en movimiento sobre su ruta.
4. **Información:** permite ver el avance de la flota, el estado de cada pedido, el ETA a la próxima entrega y la carga total, con indicadores calculados desde los datos.
5. **Segunda versión:** incorporar tránsito en tiempo real (Google Routes API), optimización de rutas y un HeatmapLayer de zonas con mayores demoras.
