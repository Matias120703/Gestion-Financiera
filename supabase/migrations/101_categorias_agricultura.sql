-- ============================================================
-- 101 · EN QUÉ GASTA UN AGRICULTOR
-- ============================================================
--
-- La lista de agricultura de la 021 tenía nueve categorías y pistas de una
-- palabra. Con la 100 la campaña se paga con el papel de la cooperativa, y
-- ese papel descuenta cosas que no tenían dónde caer: el secado y la
-- comisión del acopio, la retención de IVA, los intereses del banco que
-- financió la semilla, el repuesto del tractor. Caían en «Otros», que es
-- donde se pierde la estructura de costos.
--
-- Se conservan los nueve nombres que ya existen (Semilla, Fertilizante,
-- Agroquímicos, Combustible, Cosecha, Fletes, Arrendamiento, Personal,
-- Otros) para no dejar huérfano ningún gasto ya cargado, se les suman
-- pistas, y se agregan cinco: Siembra y pulverización, Secado y acopio,
-- Maquinaria y repuestos, Intereses y bancos, Retención de IVA. Catorce en
-- este orden, que es el orden del calendario de la campaña: primero lo que
-- se pone, después lo que descuenta el silo, al final lo del banco.
--
-- Las pistas van en los dos idiomas en la misma lista («urea, cal, abono,
-- adubo, ureia, calcário»): van al prompt de la captura por voz, y el
-- sojero de Canindeyú dicta en portugués tan seguido como en español.
--
-- Copia EXACTA de la versión viva (097, verificada con `pg_get_functiondef`
-- el 23/09/2026) tocando SOLO la rama 'agricultura'. Va aparte de la 100
-- para poder aplicarla sola.

create or replace function public.categorias_de_rubro(
  p_rubro text,
  p_tipo_cuenta text default 'emprendedor'
)
returns jsonb language sql immutable set search_path = public as $fn$
  select case
    when coalesce(p_tipo_cuenta, 'emprendedor') = 'personal' then jsonb_build_array(
      jsonb_build_object('nombre','Comida','pistas','supermercado, almacén, verdulería, carnicería, despensa, panadería'),
      jsonb_build_object('nombre','Alquiler','pistas','alquiler, expensas, condominio'),
      jsonb_build_object('nombre','Servicios','pistas','luz, agua, internet, teléfono, cable, gas'),
      jsonb_build_object('nombre','Transporte','pistas','colectivo, nafta, combustible, pasaje, taxi, uber, peaje'),
      jsonb_build_object('nombre','Salud','pistas','farmacia, remedios, médico, dentista, seguro médico, análisis'),
      jsonb_build_object('nombre','Educación','pistas','colegio, cuota, universidad, útiles, curso, libros'),
      jsonb_build_object('nombre','Ropa','pistas','ropa, calzado, zapatillas, campera'),
      jsonb_build_object('nombre','Cuidado personal','pistas','peluquería, uñas, barbería, cosmética, gimnasio, perfume'),
      jsonb_build_object('nombre','Ocio','pistas','salida, restaurante, cine, streaming, viaje, cerveza, cumpleaños'),
      jsonb_build_object('nombre','Hogar','pistas','limpieza, muebles, arreglos, electrodomésticos, ferretería'),
      jsonb_build_object('nombre','Cuotas y deudas','pistas','tarjeta, préstamo, cuota, financiera'),
      jsonb_build_object('nombre','Otros','pistas',''))

    when coalesce(p_rubro, 'comercio') = 'ganaderia' then jsonb_build_array(
      jsonb_build_object('nombre','Alimentación','pistas','maíz, balanceado, ración, fardos, sal, pasto'),
      jsonb_build_object('nombre','Sanidad','pistas','vacunas, antiparasitarios, veterinario, remedios'),
      jsonb_build_object('nombre','Personal','pistas','peón, capataz, jornales, sueldos'),
      jsonb_build_object('nombre','Combustible','pistas','gasoil, nafta'),
      jsonb_build_object('nombre','Arrendamiento','pistas','alquiler de campo, pastaje'),
      jsonb_build_object('nombre','Fletes','pistas','transporte de hacienda, camión jaula'),
      jsonb_build_object('nombre','Mantenimiento','pistas','alambrado, aguadas, maquinaria, herramientas'),
      jsonb_build_object('nombre','Impuestos','pistas',''),
      jsonb_build_object('nombre','Otros','pistas',''))

    -- Lo que gasta una campaña agrícola (101), en el orden del calendario:
    -- lo que se pone, lo que descuenta el silo, lo del banco.
    when coalesce(p_rubro, 'comercio') = 'agricultura' then jsonb_build_array(
      jsonb_build_object('nombre','Semilla','pistas','semilla, plantines, bolsa, semente, mudas, saco'),
      jsonb_build_object('nombre','Fertilizante','pistas','urea, fosfato, cloruro, cal, abono, adubo, ureia, calcário'),
      jsonb_build_object('nombre','Agroquímicos','pistas','herbicida, fungicida, insecticida, glifosato, veneno, defensivo, inseticida'),
      jsonb_build_object('nombre','Combustible','pistas','gasoil, nafta, diésel, aceite, diesel, óleo'),
      jsonb_build_object('nombre','Siembra y pulverización','pistas','siembra, pulverizada, pasada, servicio, plantio, pulverização'),
      jsonb_build_object('nombre','Cosecha','pistas','cosechadora, trilla, colheitadeira'),
      jsonb_build_object('nombre','Fletes','pistas','flete, camión, transporte, frete, caminhão'),
      jsonb_build_object('nombre','Secado y acopio','pistas','secado, comisión, acopio, silo, secagem, armazenagem, armazém'),
      jsonb_build_object('nombre','Arrendamiento','pistas','alquiler de campo, alquiler en kilos, arrendamento, aluguel de terra'),
      jsonb_build_object('nombre','Personal','pistas','jornal, peón, tractorista, sueldo, diária, peão, tratorista, salário'),
      jsonb_build_object('nombre','Maquinaria y repuestos','pistas','repuesto, taller, tractor, cubierta, peça, oficina, pneu'),
      jsonb_build_object('nombre','Intereses y bancos','pistas','interés, banco, comisión bancaria, juros'),
      jsonb_build_object('nombre','Retención de IVA','pistas','retención, IVA, retenção'),
      jsonb_build_object('nombre','Otros','pistas',''))

    when coalesce(p_rubro, 'comercio') = 'servicios' then jsonb_build_array(
      jsonb_build_object('nombre','Materiales','pistas','cemento, arena, cables, pintura, insumos'),
      jsonb_build_object('nombre','Repuestos','pistas','piezas, filtros, aceite'),
      jsonb_build_object('nombre','Herramientas','pistas',''),
      jsonb_build_object('nombre','Combustible','pistas','gasoil, nafta'),
      jsonb_build_object('nombre','Personal','pistas','ayudante, jornales, sueldos'),
      jsonb_build_object('nombre','Transporte','pistas','flete, viaje, delivery'),
      jsonb_build_object('nombre','Impuestos','pistas',''),
      jsonb_build_object('nombre','Otros','pistas',''))

    when coalesce(p_rubro, 'comercio') = 'clases' then jsonb_build_array(
      jsonb_build_object('nombre','Internet y plataformas','pistas','internet, wifi, Zoom, Meet, plan del celular, hosting'),
      jsonb_build_object('nombre','Comisiones','pistas','Preply, Italki, Superprof, lo que se lleva la plataforma, comisión de cobro'),
      jsonb_build_object('nombre','Material','pistas','libros, licencias, PDF, impresiones, fotocopias, cuadernos'),
      jsonb_build_object('nombre','Equipo','pistas','notebook, micrófono, cámara, auriculares, tablet, pizarra, luz'),
      jsonb_build_object('nombre','Publicidad','pistas','anuncios, Instagram, Facebook, volantes'),
      jsonb_build_object('nombre','Capacitación','pistas','cursos propios, certificaciones, exámenes, membresías'),
      jsonb_build_object('nombre','Alquiler','pistas','aula, salón, espacio de trabajo'),
      jsonb_build_object('nombre','Impuestos','pistas',''),
      jsonb_build_object('nombre','Otros','pistas',''))

    -- Lo que gasta un personal trainer (097): el equipo que lleva, el lugar
    -- donde entrena, y moverse hasta cada cliente.
    when coalesce(p_rubro, 'comercio') = 'entrenamiento' then jsonb_build_array(
      jsonb_build_object('nombre','Equipamiento','pistas','pesas, mancuernas, bandas, colchonetas, kettlebell, TRX, soga, conos'),
      jsonb_build_object('nombre','Gimnasio y espacio','pistas','cuota del gimnasio, alquiler del espacio, box, cancha, derecho de uso'),
      jsonb_build_object('nombre','Transporte','pistas','nafta, combustible, colectivo, uber, ir a domicilio'),
      jsonb_build_object('nombre','Ropa deportiva','pistas','ropa, zapatillas, calzas, uniforme'),
      jsonb_build_object('nombre','Internet y aplicaciones','pistas','internet, plan del celular, app de rutinas, Zoom'),
      jsonb_build_object('nombre','Publicidad','pistas','anuncios, Instagram, Facebook, TikTok, volantes'),
      jsonb_build_object('nombre','Capacitación','pistas','cursos, certificaciones, workshops, membresías'),
      jsonb_build_object('nombre','Impuestos','pistas',''),
      jsonb_build_object('nombre','Otros','pistas',''))

    else jsonb_build_array(
      jsonb_build_object('nombre','Mercadería','pistas','lo que comprás para revender'),
      jsonb_build_object('nombre','Transporte','pistas','combustible, flete, delivery'),
      jsonb_build_object('nombre','Comida','pistas',''),
      jsonb_build_object('nombre','Publicidad','pistas',''),
      jsonb_build_object('nombre','Servicios','pistas','luz, agua, internet, teléfono'),
      jsonb_build_object('nombre','Alquiler','pistas',''),
      jsonb_build_object('nombre','Sueldos','pistas','empleados, jornales'),
      jsonb_build_object('nombre','Impuestos','pistas',''),
      jsonb_build_object('nombre','Otros','pistas',''))
  end;
$fn$;

-- Los permisos, los mismos de siempre (021, 097): la lista la lee también
-- quien todavía no tiene cuenta, al elegir rubro. `create or replace` ya
-- los conserva; se escriben igual para que esta migración se lea sola.
grant execute on function public.categorias_de_rubro(text, text) to anon, authenticated;
