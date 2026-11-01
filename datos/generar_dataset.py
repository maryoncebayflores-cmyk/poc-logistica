import random, json, math, csv
random.seed(11)
depot=(-34.6370,-58.4040)
zonas=[("Palermo",-34.5890,-58.4300),("Belgrano",-34.5600,-58.4560),("Recoleta",-34.5950,-58.3930),
("San Telmo",-34.6150,-58.3720),("Caballito",-34.6180,-58.4430),("Flores",-34.6290,-58.4640),
("Almagro",-34.6100,-58.4150),("Boedo",-34.6330,-58.4200),("Villa Urquiza",-34.5730,-58.4890),("Barracas",-34.6400,-58.3700)]
colores=["#e6194b","#3cb44b","#4363d8","#f58231","#911eb4","#0aa6b8","#d2a000","#8a5a2b","#e056a0","#5c6b73"]
tipos={"Insumos de laboratorio":(["Laboratorio","Clínica","Instituto","Hospital"],(5,40)),
"Paquetería":(["Librería","Ferretería","Estudio","Taller","Showroom"],(2,25)),
"Alimentos":(["Rotisería","Almacén","Panadería","Dietética","Restaurante"],(10,120))}
suf=["Del Plata","Central","San Martín","Norte","Sur","Rivadavia","Belgrano","Austral","Federal","Mitre","Libertad","Sarmiento"]
def d(a,b): return math.hypot(a[0]-b[0],(a[1]-b[1])*0.83)
camiones=[];pedidos=[];pid=1
for i,(z,la,lo) in enumerate(zonas,1):
    camiones.append(dict(id=i,nombre=f"Camión {i:02d}",patente=f"AA{100+i*7}{chr(65+i)}{chr(70+i)}",zona=z,latitud=depot[0],longitud=depot[1],color=colores[i-1]))
    pts=[]
    for _ in range(6):
        t=random.choice(list(tipos)); pre,(a,b)=tipos[t]
        pts.append(dict(cat=t,cli=f"{random.choice(pre)} {random.choice(suf)}",
          lat=round(la+random.uniform(-.011,.011),5),lon=round(lo+random.uniform(-.011,.011),5),val=random.randint(a,b)))
    cur=depot;orden=[]
    while pts:
        n=min(pts,key=lambda p:d(cur,(p['lat'],p['lon'])));pts.remove(n);orden.append(n);cur=(n['lat'],n['lon'])
    for k,p in enumerate(orden,1):
        pedidos.append(dict(id=pid,nombre=f"Pedido {pid:03d} - {p['cli']}",categoria=p['cat'],latitud=p['lat'],longitud=p['lon'],
          valor=p['val'],fecha="2026-11-02",descripcion=f"Entrega en {z}",estado="Pendiente",camion_id=i,orden=k));pid+=1
json.dump(dict(camiones=camiones,pedidos=pedidos),open("public/datos_demo.json","w"),ensure_ascii=False)
w=csv.DictWriter(open("datos/pedidos.csv","w",newline="",encoding="utf-8"),fieldnames=pedidos[0].keys());w.writeheader();w.writerows(pedidos)
q=lambda s:str(s).replace("'","''")
sql="""-- Tablas para la PoC de logística
create table if not exists camiones (
  id int primary key, nombre text, patente text, zona text,
  latitud double precision, longitud double precision, color text);
create table if not exists pedidos (
  id int primary key, nombre text, categoria text,
  latitud double precision, longitud double precision,
  valor numeric, fecha date, descripcion text, estado text default 'Pendiente',
  camion_id int references camiones(id), orden int);
-- Lectura pública (clave anon)
alter table camiones enable row level security;
alter table pedidos enable row level security;
create policy "lectura camiones" on camiones for select using (true);
create policy "lectura pedidos" on pedidos for select using (true);
"""
for c in camiones: sql+=f"insert into camiones values ({c['id']},'{q(c['nombre'])}','{c['patente']}','{q(c['zona'])}',{c['latitud']},{c['longitud']},'{c['color']}');\n"
for p in pedidos: sql+=f"insert into pedidos values ({p['id']},'{q(p['nombre'])}','{q(p['categoria'])}',{p['latitud']},{p['longitud']},{p['valor']},'{p['fecha']}','{q(p['descripcion'])}','Pendiente',{p['camion_id']},{p['orden']});\n"
open("supabase/schema.sql","w",encoding="utf-8").write(sql)
print(len(camiones),len(pedidos))
