/**
 * LOS MENSAJES DE LA BASE, EN PORTUGUÉS.
 *
 * Las funciones de PostgreSQL explican con palabras por qué dicen que no
 * («Ese horario ya no está disponible»), y `mensajeDeError` le muestra ese
 * texto tal cual a la persona. Ese texto está escrito en español adentro de
 * la base, y ahí se queda: traducirlo en la base obligaría a cada función a
 * saber el idioma de quien la llama.
 *
 * Así que se traduce en el camino, en el navegador, justo antes de
 * mostrarlo. La clave es el mensaje exacto de la base; los que llevan un
 * dato adentro (un nombre, un monto) tienen `%` en el mismo lugar donde lo
 * pone PostgreSQL, y la traducción tiene sus `%` en el orden en que se
 * llenan.
 *
 * `pruebas/errores.test.js` lee la última versión de cada función de las
 * migraciones y falla si aparece un mensaje nuevo sin traducir. Un mensaje
 * que se cuela en español en la pantalla de un brasileño es exactamente lo
 * que la regla de idiomas.ts no permite.
 *
 * Sin dependencias a propósito: lo compilan las pruebas con tsc suelto.
 */

export const MENSAJES_PT: Record<string, string> = {
  // ---- las reglas de errores técnicos (lib/errores.ts) ----
  'No tenés permiso para hacer esto. Si creés que deberías, pedile a un administrador.': 'Você não tem permissão pra fazer isso. Se acha que deveria ter, peça a um administrador.',
  'Los números de esa operación no cierran. Volvé a cargarla desde la app.': 'Os números dessa operação não fecham. Lance de novo pelo app.',
  'Un gasto o un ingreso no puede llevar descuento ni costo de mercadería.': 'Uma despesa ou entrada não pode ter desconto nem custo de mercadoria.',
  'Una anulación tiene que registrar quién y cuándo. Usá el botón de anular.': 'Um cancelamento precisa registrar quem e quando. Use o botão de cancelar.',
  'Esa fecha no es válida.': 'Essa data não é válida.',
  'Ya existe algo con ese nombre.': 'Já existe algo com esse nome.',
  'Eso hace referencia a algo que ya no existe. Recargá la página.': 'Isso faz referência a algo que não existe mais. Recarregue a página.',
  'Tu sesión venció. Volvé a entrar.': 'Sua sessão expirou. Entre de novo.',
  'Se cortó la conexión. Revisá tu internet y probá de nuevo.': 'A conexão caiu. Confira sua internet e tente de novo.',
  'No se guardó: no tenés permiso para cambiar esto.': 'Não foi salvo: você não tem permissão pra mudar isso.',
  'No se pudo completar la operación.': 'Não foi possível concluir a operação.',

  // ---- los avisos que arma el servidor al revisar lo dictado (lib/acciones.ts y lib/turno-voz.ts) ----
  'No encontré ese producto en tu catálogo. Elegilo vos.': 'Não encontrei esse produto no seu catálogo. Escolha você.',
  '«%» es un servicio: no lleva stock.': '«%» é um serviço: não tem estoque.',
  'Ya tenés «%» en el catálogo. Si querés cambiarle el precio o el stock, decilo así.': 'Você já tem «%» no catálogo. Se quiser mudar o preço ou o estoque, diga assim.',
  'No entendí el nombre del cliente. Escribilo vos.': 'Não entendi o nome do cliente. Escreva você.',
  'La fecha que entendí ya pasó. Elegí el día.': 'A data que eu entendi já passou. Escolha o dia.',

  // ---- los de la base (raise exception) ----
  // 074 · la billetera
  'Solo el dueño de la cuenta puede ver esto.': 'Só o dono da conta pode ver isso.',
  // No lo ve nadie —`disparar_tarea` la llama el planificador de la base
  // (081)— pero la regla es que todo mensaje de la base esté en los dos
  // idiomas, y una regla con excepciones deja de ser una regla.
  'Esa no es una ruta de tareas.': 'Essa não é uma rota de tarefas.',
  'Ponele un nombre: el del banco, «Efectivo», «Tigo Money».': 'Dê um nome: o do banco, «Dinheiro», «Tigo Money».',
  'Ese tipo de cuenta no existe.': 'Esse tipo de conta não existe.',
  'Ya tenés 20 cuentas. Archivá alguna antes de sumar otra.': 'Você já tem 20 contas. Arquive alguma antes de adicionar outra.',
  'Escribí cuánto dice tu banco que tenés.': 'Escreva quanto o seu banco diz que você tem.',
  'Elegí dos cuentas distintas.': 'Escolha duas contas diferentes.',
  // 073 · ahorrar en otra moneda
  'Esa moneda no es válida.': 'Essa moeda não é válida.',
  'Ese fondo ya tiene movimientos: no se le puede cambiar la moneda. Creá otro fondo.': 'Essa reserva já tem movimentos: não dá pra mudar a moeda. Crie outra reserva.',
  'Escribí cuánto fue en %: sin eso no se puede sumar a tus números.': 'Escreva quanto foi em %: sem isso não dá pra somar aos seus números.',
  // 072 · la agenda como calendario
  'Elegí un rango de hasta tres meses.': 'Escolha um intervalo de até três meses.',
  // 070 · saldo y retiros
  'Ya pediste un retiro de % el %. Cuando te lo transfiramos vas a poder pedir otro.': 'Você já pediu um saque de % em %. Quando transferirmos, vai poder pedir outro.',
  'Para retirar necesitás al menos %. Hoy tenés %.': 'Pra sacar você precisa de pelo menos %. Hoje você tem %.',
  'Escribí cuánto querés retirar.': 'Escreva quanto quer sacar.',
  'El mínimo para retirar es %.': 'O mínimo pra sacar é %.',
  'No podés retirar más de lo que tenés: tu saldo es %.': 'Você não pode sacar mais do que tem: seu saldo é %.',
  'Ese retiro no existe.': 'Esse saque não existe.',
  'Ese retiro ya está pagado.': 'Esse saque já está pago.',
  'Ese retiro está rechazado: la plata volvió a su saldo.': 'Esse saque foi recusado: o dinheiro voltou pro saldo.',
  'Solo se puede rechazar un retiro que todavía no se pagó.': 'Só dá pra recusar um saque que ainda não foi pago.',
  'Escribí por qué no se pudo pagar: es lo que va a leer.': 'Escreva por que não deu pra pagar: é o que a pessoa vai ler.',
  'Solo se ajusta una comisión que todavía está en el saldo.': 'Só dá pra ajustar uma comissão que ainda está no saldo.',
  'Ese socio ya retiró parte de esa plata: el monto no puede bajar de %.': 'Esse sócio já sacou parte desse dinheiro: o valor não pode ficar abaixo de %.',
  'Este socio cobra con retiros desde su saldo. Registrá el pago desde su pedido de retiro.': 'Este sócio recebe com saques do saldo. Registre o pagamento a partir do pedido de saque.',
  'Ese socio ya retiró esa plata. Si hay que recuperarla, eso se arregla con la persona, no anulando la comisión.': 'Esse sócio já sacou esse dinheiro. Se for preciso recuperar, isso se resolve com a pessoa, não anulando a comissão.',
  '% está desactivado como socio. Activalo en «Socios» y volvé a anotarlo.': '% está desativado como sócio. Ative em «Socios» e anote de novo.',
  '% no te debe nada.': '% não te deve nada.',
  '% te debe %, no podés cobrarle más que eso.': '% te deve %, não dá pra cobrar mais que isso.',
  '% todavía te debe %. Cobrale o borrá esa deuda desde Fiado, y después lo eliminás.': '% ainda te deve %. Receba ou apague essa dívida em Fiado, e depois exclua.',
  '% todavía tiene turnos agendados (%). Pasalos a otra persona o cancelalos desde Agenda, y después lo sacás del equipo.': '% ainda tem horários agendados (%). Passe pra outra pessoa ou cancele em Agenda, e depois tire da equipe.',
  '% trabaja en ese negocio: no se cobra comisión por traerse a uno mismo.': '% trabalha nesse negócio: não se cobra comissão por trazer a si mesmo.',
  'Al propietario del negocio no se lo puede sacar.': 'O dono do negócio não pode ser tirado.',
  'Antes de pedir el cobro, completá dónde te transferimos.': 'Antes de pedir o pagamento, preencha pra onde transferimos.',
  'Cada línea de la venta tiene que ser un objeto.': 'Cada linha da venda precisa ser um objeto.',
  'Cada producto suelto necesita un nombre.': 'Cada produto avulso precisa de um nome.',
  'Con comisión hace falta un porcentaje entre 1 y 100.': 'Com comissão é preciso uma porcentagem entre 1 e 100.',
  'El costo no puede ser negativo.': 'O custo não pode ser negativo.',
  'El código es para cuentas nuevas, y esta ya tiene más de un mes.': 'O código é pra contas novas, e esta já tem mais de um mês.',
  'El código no corresponde a ninguna empresa.': 'O código não corresponde a nenhuma empresa.',
  'El descuento no puede ser mayor que el subtotal de la venta.': 'O desconto não pode ser maior que o subtotal da venda.',
  'El descuento no puede ser negativo.': 'O desconto não pode ser negativo.',
  'El identificador del producto no es válido.': 'O identificador do produto não é válido.',
  'El lote necesita un nombre.': 'O lote precisa de um nome.',
  'El monto no puede ser negativo.': 'O valor não pode ser negativo.',
  'El monto tiene que ser mayor que cero.': 'O valor precisa ser maior que zero.',
  'El movimiento no existe.': 'O lançamento não existe.',
  'El nombre del negocio es muy corto.': 'O nome do negócio é muito curto.',
  'El pago tiene que ser mayor que cero.': 'O pagamento precisa ser maior que zero.',
  'El periodo elegido tiene % movimientos y el máximo por consulta es %. Elegí un rango más corto para que los totales sean exactos.': 'O período escolhido tem % lançamentos e o máximo por consulta é %. Escolha um intervalo menor pros totais serem exatos.',
  'El plan solo lo puede cambiar el sistema de suscripciones.': 'O plano só pode ser mudado pelo sistema de assinaturas.',
  'El precio no puede ser negativo.': 'O preço não pode ser negativo.',
  'El rango de fechas no es válido.': 'O intervalo de datas não é válido.',
  'El rango no puede superar los 3 años para la serie diaria.': 'O intervalo não pode passar de 3 anos pra série diária.',
  'El saldo no puede ser mayor que el monto original.': 'O saldo não pode ser maior que o valor original.',
  'El tope de vendedores no puede ser negativo.': 'O limite de vendedores não pode ser negativo.',
  'El último día no puede ser anterior al primero.': 'O último dia não pode ser anterior ao primeiro.',
  'Eliminar clientes es del dueño o de un administrador.': 'Excluir clientes é do dono ou de um administrador.',
  'Eliminar del catálogo es del dueño o de un administrador.': 'Excluir do catálogo é do dono ou de um administrador.',
  'Esa categoría no existe en esta cuenta.': 'Essa categoria não existe nesta conta.',
  'Esa categoría ya existe.': 'Essa categoria já existe.',
  'Esa comisión está anulada: el cobro que la generó se deshizo.': 'Essa comissão está cancelada: o pagamento que a gerou foi desfeito.',
  'Esa comisión no existe.': 'Essa comissão não existe.',
  'Esa comisión ya está pagada.': 'Essa comissão já está paga.',
  'Esa comisión ya se pagó. Si hay que recuperar la plata, eso se arregla con la persona, no borrando el registro.': 'Essa comissão já foi paga. Se precisar recuperar o dinheiro, isso se resolve com a pessoa, não apagando o registro.',
  'Esa cotización es demasiado grande. Revisá los ceros.': 'Essa cotação é grande demais. Confira os zeros.',
  'Esa cuenta no es tuya.': 'Essa conta não é sua.',
  'Esa cuenta no existe.': 'Essa conta não existe.',
  'Esa deuda no existe.': 'Essa dívida não existe.',
  'Ese pago no existe.': 'Esse pagamento não existe.',
  'Solo el dueño de la cuenta puede elegir en qué cuenta entra.':
    'Só o dono da conta pode escolher em que conta entra.',
  'Solo el dueño de la cuenta puede sacar plata de la billetera.':
    'Só o dono da conta pode tirar dinheiro da carteira.',
  'Solo el propietario o un administrador puede deshacer un pago.':
    'Só o dono ou um administrador pode desfazer um pagamento.',
  'Esa deuda viene de una venta. Para borrarla, anulá la venta desde el historial: así también vuelve el stock.': 'Essa dívida vem de uma venda. Pra apagar, cancele a venda no histórico: assim o estoque também volta.',
  'Esa deuda ya está saldada.': 'Essa dívida já está quitada.',
  'Esa empresa no existe.': 'Essa empresa não existe.',
  'Esa empresa no tiene suscripción.': 'Essa empresa não tem assinatura.',
  'Esa es una cuenta personal: no admite más personas.': 'Essa é uma conta pessoal: não aceita mais pessoas.',
  'Esa excepción no existe.': 'Essa exceção não existe.',
  'Esa fecha ya pasó. Poné para cuándo lo querés juntar.': 'Essa data já passou. Coloque pra quando você quer juntar.',
  'Esa forma de cobro no es válida.': 'Essa forma de pagamento não é válida.',
  'Esa línea ya no existe.': 'Essa linha não existe mais.',
  'Esa persona no atiende en este local.': 'Essa pessoa não atende neste local.',
  'Esa persona no es parte de este negocio.': 'Essa pessoa não faz parte deste negócio.',
  'Esa persona no está en el equipo de esta cuenta.': 'Essa pessoa não está na equipe desta conta.',
  'Esa persona no está en el equipo.': 'Essa pessoa não está na equipe.',
  'Esa persona trabaja en este negocio: no corresponde comisión.': 'Essa pessoa trabalha neste negócio: não cabe comissão.',
  'Esa reserva no existe.': 'Esse agendamento não existe.',
  'Esa reserva ya no se puede cancelar.': 'Esse agendamento não pode mais ser cancelado.',
  'Esa reserva ya se cerró.': 'Esse agendamento já foi encerrado.',
  'Esa venta fiada ya fue cobrada, entera o en parte. Borrá primero el pago desde Fiado y después anulá la venta.': 'Essa venda fiada já foi recebida, inteira ou em parte. Apague primeiro o pagamento em Fiado e depois cancele a venda.',
  'Esa zona horaria no existe.': 'Esse fuso horário não existe.',
  'Escribí tu nombre.': 'Escreva seu nome.',
  'Escribí un nombre para la categoría.': 'Escreva um nome pra categoria.',
  'Escribí un teléfono, para poder avisarte si pasa algo.': 'Escreva um telefone, pra podermos te avisar se acontecer algo.',
  'Ese cambio ya se deshizo.': 'Essa mudança já foi desfeita.',
  'Ese cliente no es de esta cuenta.': 'Esse cliente não é desta conta.',
  'Ese cliente no existe.': 'Esse cliente não existe.',
  'Ese cliente ya no existe.': 'Esse cliente não existe mais.',
  'Ese comprobante no existe.': 'Esse comprovante não existe.',
  'Ese código no existe. Revisalo con quien te lo pasó.': 'Esse código não existe. Confira com quem te passou.',
  'Ese código ya no está activo.': 'Esse código não está mais ativo.',
  'Ese día de la semana no existe.': 'Esse dia da semana não existe.',
  'Ese es tu propio código: no se gana comisión por uno mismo.': 'Esse é o seu próprio código: não se ganha comissão por si mesmo.',
  'Ese fondo no existe en esta cuenta.': 'Essa reserva não existe nesta conta.',
  'Ese fondo tiene menos de lo que querés retirar.': 'Essa reserva tem menos do que você quer retirar.',
  'Ese fondo todavía tiene plata. Retirala primero y después borralo.': 'Essa reserva ainda tem dinheiro. Retire primeiro e depois apague.',
  'Ese gasto fijo no existe en esta cuenta.': 'Essa despesa fixa não existe nesta conta.',
  'Ese horario no está disponible.': 'Esse horário não está disponível.',
  'Ese horario no existe.': 'Esse horário não existe.',
  'Ese horario se superpone con otro del mismo día.': 'Esse horário se sobrepõe a outro do mesmo dia.',
  'Ese horario ya no está disponible.': 'Esse horário não está mais disponível.',
  'Ese ingreso no existe en esta cuenta.': 'Essa entrada não existe nesta conta.',
  'Ese link es demasiado corto.': 'Esse link é curto demais.',
  'Ese link ya está tomado.': 'Esse link já está em uso.',
  'Ese lote no es de esta cuenta.': 'Esse lote não é desta conta.',
  'Ese lote no existe.': 'Esse lote não existe.',
  'Ese lote tiene % movimientos cargados. Sacáselos antes de borrarlo.': 'Esse lote tem % lançamentos. Tire eles antes de apagar.',
  'Ese movimiento está anulado.': 'Esse lançamento está cancelado.',
  'Ese movimiento no existe en esta cuenta.': 'Esse lançamento não existe nesta conta.',
  'Ese movimiento no existe.': 'Esse lançamento não existe.',
  'Ese negocio no está anotado a nombre de nadie.': 'Esse negócio não está anotado em nome de ninguém.',
  'Ese negocio no existe.': 'Esse negócio não existe.',
  'Ese negocio ya está anotado a nombre de %. Se cuenta una sola vez y no se cambia.': 'Esse negócio já está anotado em nome de %. Conta uma vez só e não muda.',
  'Ese nombre es muy largo. Con 40 letras alcanza.': 'Esse nome é muito longo. 40 letras bastam.',
  'Ese producto no pertenece a esta empresa.': 'Esse produto não pertence a esta empresa.',
  'Ese servicio no existe en esta cuenta.': 'Esse serviço não existe nesta conta.',
  'Ese socio no existe.': 'Esse sócio não existe.',
  'Ese teléfono ya es de «%». Si son la misma persona, eliminá la ficha que sobra.': 'Esse telefone já é de «%». Se for a mesma pessoa, exclua a ficha que sobra.',
  'Ese tipo de arreglo no existe.': 'Esse tipo de acordo não existe.',
  'Ese turno no existe.': 'Esse horário não existe.',
  'Ese turno ya se cerró: no se puede cancelar.': 'Esse horário já foi encerrado: não dá pra cancelar.',
  'Ese turno ya se cerró: no se puede mover.': 'Esse horário já foi encerrado: não dá pra remarcar.',
  'Eso es un producto con stock: cobralo como una venta normal.': 'Isso é um produto com estoque: receba como uma venda normal.',
  'Eso no es un servicio de esta cuenta.': 'Isso não é um serviço desta conta.',
  'Eso no es una cuenta personal.': 'Isso não é uma conta pessoal.',
  'Eso ya no está en tu catálogo.': 'Isso não está mais no seu catálogo.',
  'Esperá un momento antes de tomar otro turno.': 'Espere um momento antes de agendar outro horário.',
  'Esta cuenta ya entró con otro código.': 'Esta conta já entrou com outro código.',
  'Esta cuenta ya pagó, así que el código no corresponde.': 'Esta conta já pagou, então o código não vale.',
  'Esta página de reservas no está disponible.': 'Esta página de agendamentos não está disponível.',
  'Estado desconocido: %': 'Estado desconhecido: %',
  'Este movimiento ya estaba anulado.': 'Este lançamento já estava cancelado.',
  'Este movimiento ya tiene % comprobantes, que es el máximo.': 'Este lançamento já tem % comprovantes, que é o máximo.',
  'Este negocio ya tiene sus % personas. Para sumar a alguien más hay que ampliar el plan.': 'Este negócio já tem suas % pessoas. Pra adicionar mais alguém é preciso ampliar o plano.',
  'Este panel es solo para la administración de Orden.': 'Este painel é só pra administração do Orden.',
  'Esto es solo para la administración de Orden.': 'Isto é só pra administração do Orden.',
  'Falta el horario nuevo.': 'Falta o horário novo.',
  'Falta el horario.': 'Falta o horário.',
  'Falta el nombre de la persona.': 'Falta o nome da pessoa.',
  'Falta el nombre de quien reserva.': 'Falta o nome de quem agenda.',
  'Falta el precio del servicio.': 'Falta o preço do serviço.',
  'Falta el teléfono.': 'Falta o telefone.',
  'Falta el usuario.': 'Falta o usuário.',
  'Falta la categoría.': 'Falta a categoria.',
  'Falta la fecha.': 'Falta a data.',
  'Falta la ruta del archivo.': 'Falta o caminho do arquivo.',
  'Faltan datos de la suscripción push.': 'Faltam dados da inscrição de avisos.',
  'Faltan las fechas.': 'Faltam as datas.',
  'Hay una comisión por pagar por ese negocio. Anulala primero y después desanotalo.': 'Há uma comissão a pagar por esse negócio. Cancele primeiro e depois desanote.',
  'La cantidad es demasiado grande.': 'A quantidade é grande demais.',
  'La cantidad no puede ser negativa.': 'A quantidade não pode ser negativa.',
  'La cantidad tiene que ser mayor a cero.': 'A quantidade precisa ser maior que zero.',
  'La cantidad tiene que ser un número.': 'A quantidade precisa ser um número.',
  'La deuda tiene que tener un monto.': 'A dívida precisa ter um valor.',
  'La duración tiene que estar entre 5 minutos y 8 horas.': 'A duração precisa estar entre 5 minutos e 8 horas.',
  'La empresa no existe.': 'A empresa não existe.',
  'La fecha de la venta no es válida.': 'A data da venda não é válida.',
  'La forma de cobro no es válida.': 'A forma de pagamento não é válida.',
  'La foto pesa demasiado.': 'A foto é pesada demais.',
  'La hora de cierre tiene que ser posterior a la de apertura.': 'O horário de fechamento precisa ser depois do de abertura.',
  'La meta tiene que ser mayor que cero, o dejala vacía.': 'A meta precisa ser maior que zero, ou deixe vazia.',
  'La propiedad de la empresa no se transfiere desde la aplicación.': 'A propriedade da empresa não se transfere pelo aplicativo.',
  'La ruta no corresponde a este movimiento.': 'O caminho não corresponde a este lançamento.',
  'La venta necesita al menos un producto.': 'A venda precisa de pelo menos um produto.',
  'La venta necesita una lista de productos.': 'A venda precisa de uma lista de produtos.',
  'La venta que querés corregir no existe.': 'A venda que você quer corrigir não existe.',
  'Necesitás iniciar sesión.': 'Você precisa entrar na sua conta.',
  'No conocemos esa moneda.': 'Não conhecemos essa moeda.',
  'No hay ningún cambio para deshacer en esta cuenta.': 'Não há nenhuma mudança pra desfazer nesta conta.',
  'No hay ningún socio con ese código.': 'Não há nenhum sócio com esse código.',
  'No hay stock suficiente de %.': 'Não há estoque suficiente de %.',
  'No pertenecés a esta empresa.': 'Você não pertence a esta empresa.',
  'No podés cambiar tu propio rol.': 'Você não pode mudar o seu próprio perfil.',
  'No podés sacarte a vos mismo del equipo.': 'Você não pode tirar a si mesmo da equipe.',
  'No se le pueden agregar comprobantes a un movimiento anulado.': 'Não dá pra adicionar comprovantes a um lançamento cancelado.',
  'No se pudo generar el código. Probá de nuevo.': 'Não foi possível gerar o código. Tente de novo.',
  'No se pudo generar un código de acceso.': 'Não foi possível gerar um código de acesso.',
  'No se pudo generar un código nuevo.': 'Não foi possível gerar um código novo.',
  'No se pudo generar un link.': 'Não foi possível gerar um link.',
  'No se puede cambiar quién creó la empresa.': 'Não dá pra mudar quem criou a empresa.',
  'No se puede cerrar más de un año seguido.': 'Não dá pra fechar mais de um ano seguido.',
  'No se puede cerrar un día que todavía no pasó.': 'Não dá pra fechar um dia que ainda não passou.',
  'No se puede mover un miembro de empresa ni de usuario.': 'Não dá pra mover um membro de empresa nem de usuário.',
  'No se puede quitar el rol al propietario.': 'Não dá pra tirar o perfil do dono.',
  'No se pueden cambiar los datos de identidad de la empresa.': 'Não dá pra mudar os dados de identidade da empresa.',
  'No se pueden tomar turnos con ese número. Comunicate con el local.': 'Não dá pra agendar com esse número. Fale com o local.',
  'No tenés acceso a esta cuenta.': 'Você não tem acesso a esta conta.',
  'No tenés acceso a estos números.': 'Você não tem acesso a estes números.',
  'No tenés permiso para ver esta deuda.': 'Você não tem permissão pra ver esta dívida.',
  'No tenés permiso para ver las deudas del negocio.': 'Você não tem permissão pra ver as dívidas do negócio.',
  'No trabajás en ese negocio.': 'Você não trabalha nesse negócio.',
  'Para borrar hay que escribir el nombre exacto: %': 'Pra apagar é preciso escrever o nome exato: %',
  'Para estar en el equipo, esa persona tiene que entrar antes al negocio con el código de acceso. Pasale el código, que se cree su cuenta, y después sumala acá.': 'Pra estar na equipe, essa pessoa precisa entrar antes no negócio com o código de acesso. Passe o código, ela cria a conta, e depois adicione aqui.',
  'Para vaciar el negocio hay que escribir su nombre exacto: %': 'Pra zerar o negócio é preciso escrever o nome exato: %',
  'Para vender fiado hay que decir a quién: elegí o creá el cliente.': 'Pra vender fiado é preciso dizer pra quem: escolha ou crie o cliente.',
  'Plan desconocido: %': 'Plano desconhecido: %',
  'Ponele un nombre, para reconocerlo cuando lo pagues.': 'Dê um nome, pra reconhecer quando pagar.',
  'Ponele un nombre, para saber de quién es cada corte.': 'Dê um nome, pra saber de quem é cada corte.',
  'Ponele un nombre, para saber de quién estamos hablando.': 'Dê um nome, pra saber de quem estamos falando.',
  'Ponele un nombre, para saber para qué estás juntando.': 'Dê um nome, pra saber pra que você está juntando.',
  'Ponele un nombre, para saber qué es cuando entre.': 'Dê um nome, pra saber o que é quando entrar.',
  'Poné a cuánto está el cambio: sin eso no se puede convertir nada.': 'Coloque a cotação: sem isso não dá pra converter nada.',
  'Rubro desconocido: %': 'Ramo desconhecido: %',
  'Se te terminó la prueba. Para seguir usando Orden hace falta activar tu plan.': 'Seu teste terminou. Pra continuar usando o Orden é preciso ativar seu plano.',
  'Si borrás eso quedaría debiendo menos que cero, porque ya te pagó parte. Borrá primero el pago.': 'Se apagar isso a dívida ficaria menor que zero, porque já te pagou uma parte. Apague primeiro o pagamento.',
  'Si ese día abrís, decí de cuándo a cuándo.': 'Se nesse dia você abre, diga de que horas a que horas.',
  'Solo administración maneja los lotes.': 'Só a administração cuida dos lotes.',
  'Solo el dueño de la cuenta puede bloquear.': 'Só o dono da conta pode bloquear.',
  'Solo el dueño de la cuenta puede cerrar el local.': 'Só o dono da conta pode fechar o local.',
  'Solo el dueño de la cuenta puede definir los servicios.': 'Só o dono da conta pode definir os serviços.',
  'Solo el dueño de la cuenta puede pagar al equipo.': 'Só o dono da conta pode pagar a equipe.',
  'Solo el dueño de la cuenta puede tocar el equipo.': 'Só o dono da conta pode mexer na equipe.',
  'Solo el dueño de la cuenta puede tocar el link.': 'Só o dono da conta pode mexer no link.',
  'Solo el dueño de la cuenta puede tocar esto.': 'Só o dono da conta pode mexer nisso.',
  'Solo el dueño de la cuenta puede tocar los feriados.': 'Só o dono da conta pode mexer nos feriados.',
  'Solo el dueño de la cuenta puede usar un código.': 'Só o dono da conta pode usar um código.',
  'Solo el propietario o un administrador puede archivar deudas.': 'Só o dono ou um administrador pode arquivar dívidas.',
  'Solo el propietario o un administrador puede cambiar el rubro.': 'Só o dono ou um administrador pode mudar o ramo.',
  'Solo el propietario o un administrador puede cambiar esto.': 'Só o dono ou um administrador pode mudar isso.',
  'Solo el propietario o un administrador puede cambiar la zona horaria.': 'Só o dono ou um administrador pode mudar o fuso horário.',
  'Solo el propietario o un administrador puede cargar deudas.': 'Só o dono ou um administrador pode cadastrar dívidas.',
  'Solo el propietario o un administrador puede editar deudas.': 'Só o dono ou um administrador pode editar dívidas.',
  'Solo el propietario o un administrador puede registrar pagos.': 'Só o dono ou um administrador pode lançar pagamentos.',
  'Solo el propietario o un administrador puede sacar gente del equipo.': 'Só o dono ou um administrador pode tirar gente da equipe.',
  'Solo el propietario puede cambiar el código de invitación.': 'Só o dono pode mudar o código de convite.',
  'Solo el propietario puede vaciar el negocio.': 'Só o dono pode zerar o negócio.',
  'Solo podés borrar los comprobantes que subiste vos.': 'Você só pode apagar os comprovantes que você enviou.',
  'Solo podés cambiar el precio de tus propios servicios.': 'Você só pode mudar o preço dos seus próprios serviços.',
  'Solo podés cambiar tu propia agenda.': 'Você só pode mudar a sua própria agenda.',
  'Solo podés cambiar tu propio horario.': 'Você só pode mudar o seu próprio horário.',
  'Solo podés cargar tus propios servicios.': 'Você só pode lançar os seus próprios serviços.',
  'Solo podés elegir una empresa tuya.': 'Você só pode escolher uma empresa sua.',
  'Solo quien la anotó o un administrador puede borrarla.': 'Só quem anotou ou um administrador pode apagar.',
  'Solo se puede guardar o retirar.': 'Só dá pra guardar ou retirar.',
  'Solo un administrador puede anular movimientos de otra persona o de días anteriores.': 'Só um administrador pode cancelar lançamentos de outra pessoa ou de dias anteriores.',
  'Tiene % comisión(es) en el historial de Orden, así que no se puede borrar. Si ya no trabaja con nosotros, desactivalo: desactivado no recibe negocios nuevos y el historial queda entero.': 'Tem % comissão(ões) no histórico do Orden, então não dá pra apagar. Se não trabalha mais com a gente, desative: desativado não recebe negócios novos e o histórico fica inteiro.',
  'Tipo de adjunto no reconocido.': 'Tipo de anexo não reconhecido.',
  'Tipo de cuenta desconocido: %': 'Tipo de conta desconhecido: %',
  'Tipo de deuda no reconocido.': 'Tipo de dívida não reconhecido.',
  'Todavía hay gente trabajando en % de tus negocios. Sacalos del equipo antes de borrar tu cuenta.': 'Ainda há gente trabalhando em % dos seus negócios. Tire eles da equipe antes de excluir sua conta.',
  'Todavía no pediste tu código de recomendación.': 'Você ainda não pediu seu código de indicação.',
  'Todavía no tenés nada por cobrar.': 'Você ainda não tem nada pra receber.',
  'Trajo % cuenta(s). Sacale el referido a esas cuentas primero, desde la ficha de cada una, y después borralo.': 'Trouxe % conta(s). Tire a indicação dessas contas primeiro, na ficha de cada uma, e depois apague.',
  'Tu código de recomendación está desactivado. Escribinos y lo vemos.': 'Seu código de indicação está desativado. Fale com a gente e resolvemos.',
  'Tu código está pausado. Escribinos y lo vemos.': 'Seu código está pausado. Fale com a gente e resolvemos.',
  'Un administrador no puede sacar a otro administrador. Pedíselo al propietario.': 'Um administrador não pode tirar outro administrador. Peça ao dono.',
  'Un lote no puede cerrarse antes de haberse abierto.': 'Um lote não pode fechar antes de ter aberto.',
  'Un movimiento anulado no se puede reactivar.': 'Um lançamento cancelado não pode ser reativado.',
  'Un movimiento no puede cambiar de empresa.': 'Um lançamento não pode mudar de empresa.',
  'Un movimiento no puede cambiar de tipo.': 'Um lançamento não pode mudar de tipo.',
  'Un producto no puede cambiar de empresa.': 'Um produto não pode mudar de empresa.',
  'Una nota de voz sin transcripción no se guarda.': 'Um áudio sem transcrição não é salvo.',
  'Una venta no puede tener más de 200 líneas.': 'Uma venda não pode ter mais de 200 linhas.',
  'Ya está todo cargado: no tenés nada pendiente de ese negocio.': 'Já está tudo lançado: você não tem nada pendente desse negócio.',
  'Ya se pagó la comisión por ese negocio, así que no se puede desanotar.': 'A comissão desse negócio já foi paga, então não dá pra desanotar.',
  'Ya tenés movimientos cargados en %, así que la moneda del negocio no se puede cambiar: se reetiquetaría todo tu historial sin convertirlo. Si querés ver tus números en otra moneda, usá «Ver en» y poné la cotización.': 'Você já tem lançamentos em %, então a moeda do negócio não pode mudar: todo o seu histórico seria renomeado sem converter. Se quiser ver seus números em outra moeda, use «Ver em» e coloque a cotação.',
  'Ya tenés varios turnos reservados. Cancelá alguno antes de tomar otro.': 'Você já tem vários horários agendados. Cancele algum antes de agendar outro.',
};

/** Los que llevan `%`, armados una sola vez como expresiones. */
let conHuecos: { patron: RegExp; destino: string }[] | null = null;

function plantillas() {
  if (conHuecos) return conHuecos;
  conHuecos = Object.entries(MENSAJES_PT)
    .filter(([origen]) => origen.includes('%'))
    .map(([origen, destino]) => ({
      patron: new RegExp(
        '^' + origen.split('%').map((pedazo) => pedazo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(.+?)') + '$',
        's',
      ),
      destino,
    }));
  return conHuecos;
}

/**
 * Un aviso armado con varias frases pegadas («La IA dijo X. La fecha que
 * entendí ya pasó.»). Traduce cada frase conocida adentro del texto; lo que
 * escribió el modelo ya viene en portugués y queda como está.
 */
export function traducirAvisoAPortugues(texto: string): string {
  const entero = traducirMensajeAPortugues(texto);
  if (entero !== texto) return entero;
  let salida = texto;
  for (const [origen, destino] of Object.entries(MENSAJES_PT)) {
    if (!origen.includes('%') && salida.includes(origen)) salida = salida.split(origen).join(destino);
  }
  return salida;
}

/**
 * Un mensaje de la base, en portugués. Si no lo conoce, lo devuelve igual:
 * mejor el mensaje en español que ninguno.
 */
export function traducirMensajeAPortugues(texto: string): string {
  const exacto = MENSAJES_PT[texto];
  if (exacto) return exacto;

  for (const { patron, destino } of plantillas()) {
    const m = patron.exec(texto);
    if (!m) continue;
    let i = 1;
    return destino.replace(/%/g, () => m[i++] ?? '');
  }
  return texto;
}
