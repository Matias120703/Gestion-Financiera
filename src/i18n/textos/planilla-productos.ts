/**
 * «SUBIR PLANILLA» EN PRODUCTOS (122): la lista de productos de un Excel, un
 * CSV o un link de Google Sheets, como la tenga el negocio.
 *
 * Montado como `t.productos.planilla`. Lo de elegir el archivo, pegar el
 * link y por qué no se pudo leer es de todas las planillas (`t.planilla`).
 * Los números llegan armados (`n` con sus puntos de miles): el orden de las
 * palabras cambia con el idioma.
 */
const veces = (n: string, uno: string, varios: string, cuantos: number) => (cuantos === 1 ? uno : varios.replace('{n}', n));

/** «4.796 nuevos, 201 actualizados y 3 sin cambios»: solo lo que pasó, con su singular. */
type Cuenta = { creados: number; actualizados: number; sin_cambios: number };
const juntar = (partes: string[], y: string) => (partes.length > 1 ? `${partes.slice(0, -1).join(', ')} ${y} ${partes[partes.length - 1]}` : partes[0] ?? '');

export const planillaProductosEs = {
  boton: 'Subir planilla',
  titulo: 'Subir tu lista de productos',
  explicacion: 'Subí tu lista de Excel o Google Sheets, como la tengas: con el nombre, el costo, el precio y el stock. Antes de guardar te mostramos lo que entendimos.',
  explicacionServicios: 'Subí tu lista de Excel o Google Sheets, como la tengas: con el nombre y el precio. Antes de guardar te mostramos lo que entendimos.',
  ayudaColumnas: 'Entendemos las columnas en español y portugués (Producto, Descripción, Código, Costo, Precio, PVP, Stock, Existencia…), los montos con «Gs.» o puntos de miles, y varias hojas.',
  vacioSubir: 'O subí tu planilla',

  entendi: (cuantos: number, n: string) => veces(n, 'Entendí 1 producto', 'Entendí {n} productos', cuantos),
  entendiServicios: (cuantos: number, n: string) => veces(n, 'Entendí 1 servicio', 'Entendí {n} servicios', cuantos),
  yServicios: (cuantos: number, n: string) => veces(n, ' y 1 servicio', ' y {n} servicios', cuantos),
  nada: 'No encontré productos en esta planilla.',
  nadaAyuda: 'Fijate que tenga una columna con el nombre y otra con el precio. Si los títulos se leyeron mal, elegí abajo qué es cada columna.',
  comparando: 'Comparando con tu lista…',
  todosNuevos: (cuantos: number, n: string) => veces(n, 'Es nuevo: se crea', 'Todos son nuevos: se crean {n}', cuantos),
  todosExisten: (cuantos: number, n: string) => veces(n, 'Ya lo tenés: se actualiza', 'Ya los tenés todos: se actualizan {n}', cuantos),
  seCrean: (cuantos: number, n: string) => veces(n, 'Se crea 1', 'Se crean {n}', cuantos),
  seActualizan: (cuantos: number, n: string) => veces(n, 'se actualiza 1', 'se actualizan {n}', cuantos),
  vuelven: (cuantos: number, n: string) => veces(n, '1 estaba pausado y vuelve a la venta.', '{n} estaban pausados y vuelven a la venta.', cuantos),
  noSePudoComparar: 'No pudimos comparar con tu lista. Podés guardar igual: lo que ya tenés se actualiza, no se duplica.',

  hojaSinProductos: (nombre: string) => `${nombre}: sin productos`,
  columnas: 'Qué es cada columna',
  columnasDe: (hojas: string) => `Qué es cada columna (${hojas})`,
  columnasAyuda: 'Si algo se leyó mal, cambialo acá.',
  categoriaDeTitulos: 'Sale de los títulos',
  columnaN: (n: number) => `Columna ${n}`,
  oculta: 'oculta',
  noEsta: 'No está',
  noUsamos: (lista: string) => `No usamos: ${lista}.`,
  campos: {
    nombre: 'Nombre',
    codigo: 'Código',
    categoria: 'Categoría',
    costo: 'Costo',
    precio: 'Precio de venta',
    stock: 'Stock',
    stock_minimo: 'Stock mínimo',
    unidad: 'Unidad',
  },

  problemas: {
    sinPrecio: (cuantos: number, n: string) => veces(n, '1 sin precio: no se crea.', '{n} sin precio: no se crean.', cuantos),
    sinPrecioExisten: (cuantos: number, n: string) => veces(n, '1 de esos ya lo tenés: se le actualiza lo demás.', '{n} de esos ya los tenés: se les actualiza lo demás.', cuantos),
    sinNombre: (cuantos: number, n: string) => veces(n, '1 fila con precio y sin nombre: no se carga.', '{n} filas con precio y sin nombre: no se cargan.', cuantos),
    montoInvalido: (cuantos: number, n: string) => veces(n, '1 con un monto negativo o demasiado grande: no se carga.', '{n} con un monto negativo o demasiado grande: no se cargan.', cuantos),
    precioMenorCosto: (cuantos: number, n: string) => veces(n, '1 con el precio menor al costo: se carga igual.', '{n} con el precio menor al costo: se cargan igual.', cuantos),
    repetidos: (cuantos: number, n: string) => veces(n, '1 repetido en la planilla: queda el de más abajo.', '{n} repetidos en la planilla: queda el de más abajo.', cuantos),
    otroTipo: (cuantos: number, n: string) => veces(n, '1 ya lo tenés del otro tipo (servicio o producto): no se toca.', '{n} ya los tenés del otro tipo (servicio o producto): no se tocan.', cuantos),
    codigoDeOtro: (cuantos: number, n: string) => veces(n, '1 trae el código de otro producto que ya tenés: no se toca ninguno de los dos.', '{n} traen el código de otros productos que ya tenés: no se tocan.', cuantos),
    fila: (fila: number, hoja: string) => (hoja ? `${hoja}, fila ${fila}` : `Fila ${fila}`),
    costoYPrecio: (costo: string, precio: string) => `cuesta ${costo} y se vende a ${precio}`,
    queda: (fila: number, hoja: string) => (hoja ? `queda la de ${hoja}, fila ${fila}` : `queda la fila ${fila}`),
    yMas: (n: string) => `y ${n} más`,
    verFilas: 'Ver cuáles',
  },

  avisos: {
    formulasSinCalcular: (columnas: string) => `La columna ${columnas} tiene fórmulas sin calcular. Abrí la planilla en Excel o Google Sheets, guardala y subila de nuevo.`,
    ocultasIncluidas: (cuantas: number, n: string) => veces(n, '1 fila estaba oculta en tu planilla (un filtro): se carga igual.', '{n} filas estaban ocultas en tu planilla (un filtro): se cargan igual.', cuantas),
    ocultasAfuera: (cuantas: number, n: string) => veces(n, '1 fila oculta queda afuera.', '{n} filas ocultas quedan afuera.', cuantas),
    dejarlasAfuera: 'Dejarlas afuera',
    sumarlas: 'Sumarlas',
    sinTitulos: 'La planilla no tiene títulos: adivinamos qué es cada columna. Revisalas.',
    sinCosto: 'La planilla no trae el costo: sin él, la ganancia de esas ventas sale sin costo. Lo podés cargar después en cada producto.',
    recortada: 'La planilla es muy larga: leímos las primeras 30.000 filas.',
    nombreLargo: (cuantos: number, n: string) => veces(n, '1 nombre tenía más de 120 letras y se cortó.', '{n} nombres tenían más de 120 letras y se cortaron.', cuantos),
    otroPrecio: (columnas: string) => `Usamos un solo precio de venta: ${columnas} no se usa. Si es el tuyo, elegilo arriba.`,
    datosNoUsados: (columnas: string) => `No usamos estos datos de la planilla: ${columnas}.`,
    codigosCientificos: (columnas: string) => `Excel cambió los códigos ${columnas ? `de la columna ${columnas}` : 'de la planilla'} a notación científica (7,79E+12) y se perdieron: no los usamos, y esos productos se buscan por el nombre. Para traerlos, en Excel poné la columna como Número sin decimales (o como Texto) y volvé a exportar.`,
    codigosRepetidos: (columnas: string) => `${columnas ? `La columna ${columnas}` : 'La columna de código'} repite el mismo código en productos distintos: no la usamos, y los productos se buscan por el nombre. Si es el código de cada uno, revisalo en la planilla.`,
  },

  stock: {
    pregunta: 'El stock de los que ya tenés',
    reemplazar: 'Reemplazar por el de la planilla',
    dejar: 'Dejar como está',
  },

  primeros: (n: number) => `Los primeros ${n}`,
  tabla: { producto: 'Producto', precio: 'Precio' },
  sinCategoria: 'General',

  otroArchivo: 'Otro archivo',
  guardar: (cuantos: number, n: string) => veces(n, 'Guardar 1 producto', 'Guardar {n} productos', cuantos),
  guardando: (hechos: string, total: string) => `Guardando ${hechos} de ${total}…`,
  guardandoTitulo: 'Guardando tus productos…',
  deTotal: (hechos: string, total: string) => `${hechos} de ${total}`,
  noCerrar: 'No cierres esta ventana hasta que termine.',
  seCorto: (hechos: string, faltan: string) => `Se guardaron ${hechos}; faltan ${faltan}.`,
  siSeCorta: 'Tocá «Seguir desde ahí» para probar de nuevo. Si cerrás, podés subir la misma planilla otra vez: lo que ya está no se duplica.',
  seguir: 'Seguir desde ahí',
  cerrar: 'Cerrar',

  listo: 'Listo',
  resumen: (c: Cuenta, n: (x: number) => string) => {
    const partes = [
      c.creados ? veces(n(c.creados), '1 nuevo', '{n} nuevos', c.creados) : '',
      c.actualizados ? veces(n(c.actualizados), '1 actualizado', '{n} actualizados', c.actualizados) : '',
      c.sin_cambios ? `${n(c.sin_cambios)} sin cambios` : '',
    ].filter(Boolean);
    return partes.length ? `${juntar(partes, 'y')}.` : 'No hubo cambios.';
  },
  reactivados: (cuantos: number, n: string) => veces(n, '1 volvió a la venta.', '{n} volvieron a la venta.', cuantos),
  renombrados: (cuantos: number, n: string) => veces(n, '1 se guardó con su código en el nombre, porque ya tenías otro con ese nombre.', '{n} se guardaron con su código en el nombre, porque ya tenías otros con ese nombre.', cuantos),
  noSeCargaron: (cuantos: number, n: string) => veces(n, '1 no se cargó:', '{n} no se cargaron:', cuantos),
  motivos: {
    sin_precio: 'sin precio',
    otro_tipo: 'ya está como servicio o producto',
    nombre_repetido: 'ese nombre ya existe',
    codigo_de_otro: 'su código es de otro producto',
  },
  yaEstan: 'Ya están en tu lista, con su precio, listos para vender.',
  irAVender: 'Ir a Vender',
  irACobrar: 'Ir a Cobrar',
};

export const planillaProductosPt: typeof planillaProductosEs = {
  boton: 'Enviar planilha',
  titulo: 'Enviar sua lista de produtos',
  explicacion: 'Envie sua lista do Excel ou do Google Sheets, do jeito que estiver: com o nome, o custo, o preço e o estoque. Antes de salvar, mostramos o que entendemos.',
  explicacionServicios: 'Envie sua lista do Excel ou do Google Sheets, do jeito que estiver: com o nome e o preço. Antes de salvar, mostramos o que entendemos.',
  ayudaColumnas: 'Entendemos as colunas em português e espanhol (Produto, Descrição, Código, Custo, Preço, Estoque, Qtd…), os valores com «R$» ou pontos de milhar, e várias abas.',
  vacioSubir: 'Ou envie sua planilha',

  entendi: (cuantos: number, n: string) => veces(n, 'Entendi 1 produto', 'Entendi {n} produtos', cuantos),
  entendiServicios: (cuantos: number, n: string) => veces(n, 'Entendi 1 serviço', 'Entendi {n} serviços', cuantos),
  yServicios: (cuantos: number, n: string) => veces(n, ' e 1 serviço', ' e {n} serviços', cuantos),
  nada: 'Não encontrei produtos nesta planilha.',
  nadaAyuda: 'Confira se ela tem uma coluna com o nome e outra com o preço. Se os títulos foram lidos errado, escolha abaixo o que é cada coluna.',
  comparando: 'Comparando com a sua lista…',
  todosNuevos: (cuantos: number, n: string) => veces(n, 'É novo: cria-se', 'Todos são novos: criam-se {n}', cuantos),
  todosExisten: (cuantos: number, n: string) => veces(n, 'Você já tem: atualiza-se', 'Você já tem todos: atualizam-se {n}', cuantos),
  seCrean: (cuantos: number, n: string) => veces(n, 'Cria-se 1', 'Criam-se {n}', cuantos),
  seActualizan: (cuantos: number, n: string) => veces(n, 'atualiza-se 1', 'atualizam-se {n}', cuantos),
  vuelven: (cuantos: number, n: string) => veces(n, '1 estava pausado e volta à venda.', '{n} estavam pausados e voltam à venda.', cuantos),
  noSePudoComparar: 'Não conseguimos comparar com a sua lista. Você pode salvar mesmo assim: o que você já tem é atualizado, não duplicado.',

  hojaSinProductos: (nombre: string) => `${nombre}: sem produtos`,
  columnas: 'O que é cada coluna',
  columnasDe: (hojas: string) => `O que é cada coluna (${hojas})`,
  columnasAyuda: 'Se algo foi lido errado, troque aqui.',
  categoriaDeTitulos: 'Vem dos títulos',
  columnaN: (n: number) => `Coluna ${n}`,
  oculta: 'oculta',
  noEsta: 'Não tem',
  noUsamos: (lista: string) => `Não usamos: ${lista}.`,
  campos: {
    nombre: 'Nome',
    codigo: 'Código',
    categoria: 'Categoria',
    costo: 'Custo',
    precio: 'Preço de venda',
    stock: 'Estoque',
    stock_minimo: 'Estoque mínimo',
    unidad: 'Unidade',
  },

  problemas: {
    sinPrecio: (cuantos: number, n: string) => veces(n, '1 sem preço: não é criado.', '{n} sem preço: não são criados.', cuantos),
    sinPrecioExisten: (cuantos: number, n: string) => veces(n, '1 desses você já tem: o resto dele é atualizado.', '{n} desses você já tem: o resto deles é atualizado.', cuantos),
    sinNombre: (cuantos: number, n: string) => veces(n, '1 linha com preço e sem nome: não é cadastrada.', '{n} linhas com preço e sem nome: não são cadastradas.', cuantos),
    montoInvalido: (cuantos: number, n: string) => veces(n, '1 com um valor negativo ou grande demais: não é cadastrado.', '{n} com um valor negativo ou grande demais: não são cadastrados.', cuantos),
    precioMenorCosto: (cuantos: number, n: string) => veces(n, '1 com o preço menor que o custo: é cadastrado mesmo assim.', '{n} com o preço menor que o custo: são cadastrados mesmo assim.', cuantos),
    repetidos: (cuantos: number, n: string) => veces(n, '1 repetido na planilha: fica o de mais abaixo.', '{n} repetidos na planilha: fica o de mais abaixo.', cuantos),
    otroTipo: (cuantos: number, n: string) => veces(n, '1 você já tem do outro tipo (serviço ou produto): não é mexido.', '{n} você já tem do outro tipo (serviço ou produto): não são mexidos.', cuantos),
    codigoDeOtro: (cuantos: number, n: string) => veces(n, '1 traz o código de outro produto que você já tem: nenhum dos dois é mexido.', '{n} trazem o código de outros produtos que você já tem: não são mexidos.', cuantos),
    fila: (fila: number, hoja: string) => (hoja ? `${hoja}, linha ${fila}` : `Linha ${fila}`),
    costoYPrecio: (costo: string, precio: string) => `custa ${costo} e é vendido por ${precio}`,
    queda: (fila: number, hoja: string) => (hoja ? `fica a de ${hoja}, linha ${fila}` : `fica a linha ${fila}`),
    yMas: (n: string) => `e mais ${n}`,
    verFilas: 'Ver quais',
  },

  avisos: {
    formulasSinCalcular: (columnas: string) => `A coluna ${columnas} tem fórmulas sem calcular. Abra a planilha no Excel ou no Google Sheets, salve e envie de novo.`,
    ocultasIncluidas: (cuantas: number, n: string) => veces(n, '1 linha estava oculta na sua planilha (um filtro): é cadastrada mesmo assim.', '{n} linhas estavam ocultas na sua planilha (um filtro): são cadastradas mesmo assim.', cuantas),
    ocultasAfuera: (cuantas: number, n: string) => veces(n, '1 linha oculta fica de fora.', '{n} linhas ocultas ficam de fora.', cuantas),
    dejarlasAfuera: 'Deixar de fora',
    sumarlas: 'Incluir',
    sinTitulos: 'A planilha não tem títulos: adivinhamos o que é cada coluna. Confira.',
    sinCosto: 'A planilha não traz o custo: sem ele, o lucro dessas vendas sai sem custo. Você pode cadastrar depois em cada produto.',
    recortada: 'A planilha é muito longa: lemos as primeiras 30.000 linhas.',
    nombreLargo: (cuantos: number, n: string) => veces(n, '1 nome tinha mais de 120 letras e foi cortado.', '{n} nomes tinham mais de 120 letras e foram cortados.', cuantos),
    otroPrecio: (columnas: string) => `Usamos um só preço de venda: ${columnas} não é usado. Se for o seu, escolha acima.`,
    datosNoUsados: (columnas: string) => `Não usamos estes dados da planilha: ${columnas}.`,
    codigosCientificos: (columnas: string) => `O Excel mudou os códigos ${columnas ? `da coluna ${columnas}` : 'da planilha'} para notação científica (7,79E+12) e eles se perderam: não os usamos, e esses produtos são buscados pelo nome. Para trazê-los, no Excel deixe a coluna como Número sem casas decimais (ou como Texto) e exporte de novo.`,
    codigosRepetidos: (columnas: string) => `${columnas ? `A coluna ${columnas}` : 'A coluna de código'} repete o mesmo código em produtos diferentes: não a usamos, e os produtos são buscados pelo nome. Se for o código de cada um, confira na planilha.`,
  },

  stock: {
    pregunta: 'O estoque dos que você já tem',
    reemplazar: 'Trocar pelo da planilha',
    dejar: 'Deixar como está',
  },

  primeros: (n: number) => `Os primeiros ${n}`,
  tabla: { producto: 'Produto', precio: 'Preço' },
  sinCategoria: 'Geral',

  otroArchivo: 'Outro arquivo',
  guardar: (cuantos: number, n: string) => veces(n, 'Salvar 1 produto', 'Salvar {n} produtos', cuantos),
  guardando: (hechos: string, total: string) => `Salvando ${hechos} de ${total}…`,
  guardandoTitulo: 'Salvando seus produtos…',
  deTotal: (hechos: string, total: string) => `${hechos} de ${total}`,
  noCerrar: 'Não feche esta janela até terminar.',
  seCorto: (hechos: string, faltan: string) => `Foram salvos ${hechos}; faltam ${faltan}.`,
  siSeCorta: 'Toque em «Continuar daí» para tentar de novo. Se fechar, você pode enviar a mesma planilha outra vez: o que já está não é duplicado.',
  seguir: 'Continuar daí',
  cerrar: 'Fechar',

  listo: 'Pronto',
  resumen: (c: Cuenta, n: (x: number) => string) => {
    const partes = [
      c.creados ? veces(n(c.creados), '1 novo', '{n} novos', c.creados) : '',
      c.actualizados ? veces(n(c.actualizados), '1 atualizado', '{n} atualizados', c.actualizados) : '',
      c.sin_cambios ? `${n(c.sin_cambios)} sem mudanças` : '',
    ].filter(Boolean);
    return partes.length ? `${juntar(partes, 'e')}.` : 'Nada mudou.';
  },
  reactivados: (cuantos: number, n: string) => veces(n, '1 voltou à venda.', '{n} voltaram à venda.', cuantos),
  renombrados: (cuantos: number, n: string) => veces(n, '1 foi salvo com o código no nome, porque você já tinha outro com esse nome.', '{n} foram salvos com o código no nome, porque você já tinha outros com esse nome.', cuantos),
  noSeCargaron: (cuantos: number, n: string) => veces(n, '1 não foi cadastrado:', '{n} não foram cadastrados:', cuantos),
  motivos: {
    sin_precio: 'sem preço',
    otro_tipo: 'já está como serviço ou produto',
    nombre_repetido: 'esse nome já existe',
    codigo_de_otro: 'o código é de outro produto',
  },
  yaEstan: 'Já estão na sua lista, com o preço, prontos para vender.',
  irAVender: 'Ir para Vender',
  irACobrar: 'Ir para Receber',
};
