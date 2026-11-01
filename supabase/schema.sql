-- Tablas para la PoC de logística
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
insert into camiones values (1,'Camión 01','AA107BG','Palermo',-34.637,-58.404,'#e6194b');
insert into camiones values (2,'Camión 02','AA114CH','Belgrano',-34.637,-58.404,'#3cb44b');
insert into camiones values (3,'Camión 03','AA121DI','Recoleta',-34.637,-58.404,'#4363d8');
insert into camiones values (4,'Camión 04','AA128EJ','San Telmo',-34.637,-58.404,'#f58231');
insert into camiones values (5,'Camión 05','AA135FK','Caballito',-34.637,-58.404,'#911eb4');
insert into camiones values (6,'Camión 06','AA142GL','Flores',-34.637,-58.404,'#0aa6b8');
insert into camiones values (7,'Camión 07','AA149HM','Almagro',-34.637,-58.404,'#d2a000');
insert into camiones values (8,'Camión 08','AA156IN','Boedo',-34.637,-58.404,'#8a5a2b');
insert into camiones values (9,'Camión 09','AA163JO','Villa Urquiza',-34.637,-58.404,'#e056a0');
insert into camiones values (10,'Camión 10','AA170KP','Barracas',-34.637,-58.404,'#5c6b73');
insert into pedidos values (1,'Pedido 001 - Rotisería Austral','Alimentos',-34.59282,-58.428,35,'2026-11-02','Entrega en Palermo','Pendiente',1,1);
insert into pedidos values (2,'Pedido 002 - Showroom Austral','Paquetería',-34.59006,-58.42219,8,'2026-11-02','Entrega en Palermo','Pendiente',1,2);
insert into pedidos values (3,'Pedido 003 - Ferretería Central','Paquetería',-34.58815,-58.42141,22,'2026-11-02','Entrega en Palermo','Pendiente',1,3);
insert into pedidos values (4,'Pedido 004 - Hospital Austral','Insumos de laboratorio',-34.58561,-58.42746,15,'2026-11-02','Entrega en Palermo','Pendiente',1,4);
insert into pedidos values (5,'Pedido 005 - Hospital Libertad','Insumos de laboratorio',-34.58649,-58.4369,33,'2026-11-02','Entrega en Palermo','Pendiente',1,5);
insert into pedidos values (6,'Pedido 006 - Rotisería Federal','Alimentos',-34.59861,-58.44022,40,'2026-11-02','Entrega en Palermo','Pendiente',1,6);
insert into pedidos values (7,'Pedido 007 - Taller Belgrano','Paquetería',-34.56939,-58.45315,23,'2026-11-02','Entrega en Belgrano','Pendiente',2,1);
insert into pedidos values (8,'Pedido 008 - Laboratorio Norte','Insumos de laboratorio',-34.56639,-58.44697,35,'2026-11-02','Entrega en Belgrano','Pendiente',2,2);
insert into pedidos values (9,'Pedido 009 - Laboratorio Belgrano','Insumos de laboratorio',-34.56863,-58.4606,9,'2026-11-02','Entrega en Belgrano','Pendiente',2,3);
insert into pedidos values (10,'Pedido 010 - Almacén Libertad','Alimentos',-34.56453,-58.4669,20,'2026-11-02','Entrega en Belgrano','Pendiente',2,4);
insert into pedidos values (11,'Pedido 011 - Panadería Rivadavia','Alimentos',-34.55432,-58.45572,13,'2026-11-02','Entrega en Belgrano','Pendiente',2,5);
insert into pedidos values (12,'Pedido 012 - Estudio Belgrano','Paquetería',-34.54905,-58.44509,4,'2026-11-02','Entrega en Belgrano','Pendiente',2,6);
insert into pedidos values (13,'Pedido 013 - Estudio Central','Paquetería',-34.59915,-58.40367,15,'2026-11-02','Entrega en Recoleta','Pendiente',3,1);
insert into pedidos values (14,'Pedido 014 - Almacén Belgrano','Alimentos',-34.59184,-58.40144,63,'2026-11-02','Entrega en Recoleta','Pendiente',3,2);
insert into pedidos values (15,'Pedido 015 - Clínica Norte','Insumos de laboratorio',-34.59045,-58.40376,34,'2026-11-02','Entrega en Recoleta','Pendiente',3,3);
insert into pedidos values (16,'Pedido 016 - Ferretería Libertad','Paquetería',-34.5937,-58.39416,8,'2026-11-02','Entrega en Recoleta','Pendiente',3,4);
insert into pedidos values (17,'Pedido 017 - Clínica San Martín','Insumos de laboratorio',-34.59733,-58.3852,11,'2026-11-02','Entrega en Recoleta','Pendiente',3,5);
insert into pedidos values (18,'Pedido 018 - Laboratorio Sur','Insumos de laboratorio',-34.58698,-58.38255,24,'2026-11-02','Entrega en Recoleta','Pendiente',3,6);
insert into pedidos values (19,'Pedido 019 - Taller Central','Paquetería',-34.62437,-58.37841,22,'2026-11-02','Entrega en San Telmo','Pendiente',4,1);
insert into pedidos values (20,'Pedido 020 - Dietética Mitre','Alimentos',-34.62301,-58.37451,90,'2026-11-02','Entrega en San Telmo','Pendiente',4,2);
insert into pedidos values (21,'Pedido 021 - Laboratorio Mitre','Insumos de laboratorio',-34.61789,-58.36931,13,'2026-11-02','Entrega en San Telmo','Pendiente',4,3);
insert into pedidos values (22,'Pedido 022 - Clínica Norte','Insumos de laboratorio',-34.61629,-58.38279,26,'2026-11-02','Entrega en San Telmo','Pendiente',4,4);
insert into pedidos values (23,'Pedido 023 - Instituto Norte','Insumos de laboratorio',-34.60801,-58.37751,17,'2026-11-02','Entrega en San Telmo','Pendiente',4,5);
insert into pedidos values (24,'Pedido 024 - Clínica Libertad','Insumos de laboratorio',-34.6051,-58.36359,10,'2026-11-02','Entrega en San Telmo','Pendiente',4,6);
insert into pedidos values (25,'Pedido 025 - Hospital Sur','Insumos de laboratorio',-34.61974,-58.43409,36,'2026-11-02','Entrega en Caballito','Pendiente',5,1);
insert into pedidos values (26,'Pedido 026 - Hospital Federal','Insumos de laboratorio',-34.61462,-58.44045,9,'2026-11-02','Entrega en Caballito','Pendiente',5,2);
insert into pedidos values (27,'Pedido 027 - Showroom San Martín','Paquetería',-34.60856,-58.4325,6,'2026-11-02','Entrega en Caballito','Pendiente',5,3);
insert into pedidos values (28,'Pedido 028 - Ferretería Norte','Paquetería',-34.61252,-58.45248,15,'2026-11-02','Entrega en Caballito','Pendiente',5,4);
insert into pedidos values (29,'Pedido 029 - Ferretería Del Plata','Paquetería',-34.62797,-58.4478,18,'2026-11-02','Entrega en Caballito','Pendiente',5,5);
insert into pedidos values (30,'Pedido 030 - Librería Central','Paquetería',-34.6266,-58.44273,10,'2026-11-02','Entrega en Caballito','Pendiente',5,6);
insert into pedidos values (31,'Pedido 031 - Almacén Central','Alimentos',-34.63203,-58.4554,52,'2026-11-02','Entrega en Flores','Pendiente',6,1);
insert into pedidos values (32,'Pedido 032 - Laboratorio Austral','Insumos de laboratorio',-34.62799,-58.45879,13,'2026-11-02','Entrega en Flores','Pendiente',6,2);
insert into pedidos values (33,'Pedido 033 - Estudio Central','Paquetería',-34.62493,-58.45518,15,'2026-11-02','Entrega en Flores','Pendiente',6,3);
insert into pedidos values (34,'Pedido 034 - Restaurante Mitre','Alimentos',-34.61917,-58.46202,12,'2026-11-02','Entrega en Flores','Pendiente',6,4);
insert into pedidos values (35,'Pedido 035 - Estudio Sarmiento','Paquetería',-34.63314,-58.47426,21,'2026-11-02','Entrega en Flores','Pendiente',6,5);
insert into pedidos values (36,'Pedido 036 - Rotisería Austral','Alimentos',-34.63852,-58.46816,27,'2026-11-02','Entrega en Flores','Pendiente',6,6);
insert into pedidos values (37,'Pedido 037 - Hospital Mitre','Insumos de laboratorio',-34.62068,-58.41143,29,'2026-11-02','Entrega en Almagro','Pendiente',7,1);
insert into pedidos values (38,'Pedido 038 - Taller Sarmiento','Paquetería',-34.61374,-58.40545,24,'2026-11-02','Entrega en Almagro','Pendiente',7,2);
insert into pedidos values (39,'Pedido 039 - Dietética Austral','Alimentos',-34.61082,-58.41409,76,'2026-11-02','Entrega en Almagro','Pendiente',7,3);
insert into pedidos values (40,'Pedido 040 - Rotisería Sur','Alimentos',-34.60777,-58.41542,39,'2026-11-02','Entrega en Almagro','Pendiente',7,4);
insert into pedidos values (41,'Pedido 041 - Rotisería Austral','Alimentos',-34.60384,-58.41148,72,'2026-11-02','Entrega en Almagro','Pendiente',7,5);
insert into pedidos values (42,'Pedido 042 - Rotisería Mitre','Alimentos',-34.61941,-58.42401,24,'2026-11-02','Entrega en Almagro','Pendiente',7,6);
insert into pedidos values (43,'Pedido 043 - Librería Rivadavia','Paquetería',-34.63738,-58.41608,8,'2026-11-02','Entrega en Boedo','Pendiente',8,1);
insert into pedidos values (44,'Pedido 044 - Taller Libertad','Paquetería',-34.63849,-58.41705,8,'2026-11-02','Entrega en Boedo','Pendiente',8,2);
insert into pedidos values (45,'Pedido 045 - Ferretería Central','Paquetería',-34.63409,-58.42495,8,'2026-11-02','Entrega en Boedo','Pendiente',8,3);
insert into pedidos values (46,'Pedido 046 - Hospital Norte','Insumos de laboratorio',-34.63117,-58.42404,13,'2026-11-02','Entrega en Boedo','Pendiente',8,4);
insert into pedidos values (47,'Pedido 047 - Almacén Rivadavia','Alimentos',-34.62948,-58.42128,40,'2026-11-02','Entrega en Boedo','Pendiente',8,5);
insert into pedidos values (48,'Pedido 048 - Hospital Rivadavia','Insumos de laboratorio',-34.62558,-58.41233,9,'2026-11-02','Entrega en Boedo','Pendiente',8,6);
insert into pedidos values (49,'Pedido 049 - Instituto Mitre','Insumos de laboratorio',-34.57621,-58.48572,6,'2026-11-02','Entrega en Villa Urquiza','Pendiente',9,1);
insert into pedidos values (50,'Pedido 050 - Taller Libertad','Paquetería',-34.57256,-58.48521,24,'2026-11-02','Entrega en Villa Urquiza','Pendiente',9,2);
insert into pedidos values (51,'Pedido 051 - Librería Libertad','Paquetería',-34.57222,-58.48592,13,'2026-11-02','Entrega en Villa Urquiza','Pendiente',9,3);
insert into pedidos values (52,'Pedido 052 - Ferretería San Martín','Paquetería',-34.56647,-58.47835,5,'2026-11-02','Entrega en Villa Urquiza','Pendiente',9,4);
insert into pedidos values (53,'Pedido 053 - Almacén Belgrano','Alimentos',-34.57399,-58.49946,116,'2026-11-02','Entrega en Villa Urquiza','Pendiente',9,5);
insert into pedidos values (54,'Pedido 054 - Dietética Rivadavia','Alimentos',-34.58236,-58.49931,87,'2026-11-02','Entrega en Villa Urquiza','Pendiente',9,6);
insert into pedidos values (55,'Pedido 055 - Clínica Norte','Insumos de laboratorio',-34.63288,-58.37537,5,'2026-11-02','Entrega en Barracas','Pendiente',10,1);
insert into pedidos values (56,'Pedido 056 - Showroom Mitre','Paquetería',-34.63664,-58.36994,12,'2026-11-02','Entrega en Barracas','Pendiente',10,2);
insert into pedidos values (57,'Pedido 057 - Restaurante Federal','Alimentos',-34.63748,-58.36436,60,'2026-11-02','Entrega en Barracas','Pendiente',10,3);
insert into pedidos values (58,'Pedido 058 - Almacén Central','Alimentos',-34.64197,-58.36136,59,'2026-11-02','Entrega en Barracas','Pendiente',10,4);
insert into pedidos values (59,'Pedido 059 - Hospital Austral','Insumos de laboratorio',-34.64667,-58.36148,5,'2026-11-02','Entrega en Barracas','Pendiente',10,5);
insert into pedidos values (60,'Pedido 060 - Showroom Sarmiento','Paquetería',-34.6502,-58.37602,13,'2026-11-02','Entrega en Barracas','Pendiente',10,6);
