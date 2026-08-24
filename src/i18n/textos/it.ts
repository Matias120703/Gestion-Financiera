/**
 * Italiano. Parcial: lo que falta cae a inglés.
 */
import type { Parcial } from '../fusionar';
import type { Textos } from './es';

export const it: Parcial<Textos> = {
  comun: {
    guardar: 'Salva',
    cancelar: 'Annulla',
    cerrar: 'Chiudi',
    volver: 'Indietro',
    seguir: 'Continua',
    listo: 'Fatto',
    borrar: 'Elimina',
    reintentar: 'Riprova',
    cargando: 'Caricamento…',
    guardando: 'Salvataggio…',
    hoy: 'Oggi',
    ayer: 'Ieri',
    verTodo: 'Vedi tutto',
    error: 'Qualcosa è andato storto',
  },

  formato: { mil: 'mila', millon: 'Mln', milMillones: 'Mld' },

  rangos: {
    hoy: 'Oggi', ayer: 'Ieri', semana: 'Questa settimana', semana_pasada: 'Settimana scorsa',
    mes: 'Questo mese', mes_pasado: 'Mese scorso', anio: "Quest'anno", siempre: 'Tutto',
    personalizado: 'Personalizzato', todoElHistorial: 'Tutta la cronologia',
  },

  nav: {
    panel: 'Pannello',
    vender: 'Vendere',
    gastos: 'Spese',
    productos: 'Prodotti',
    historial: 'Cronologia',
    reto: 'Obiettivo',
    reportes: 'Report',
    ajustes: 'Impostazioni',
    cierre: 'Chiusura del giorno',
    cierreCorto: 'Chiusura',

    plan: 'Il mio piano',
    miCuenta: 'Il mio account',
    cambiarEmpresa: 'Cambia attività',
    activa: 'attiva',
    mas: 'Altro',
    todasLasSecciones: 'Tutte le sezioni',

    salir: 'Esci',
  },

  captura: {
    titulo: 'Cosa vuoi annotare?',
    porVoz: 'Raccontamelo a voce',
    porVozDetalle: 'Tocca e dì cosa è successo',
    porFoto: 'Scatta una foto',
    porFotoDetalle: 'Scontrino, fattura o ricevuta',
    porTexto: 'Scrivilo',
    porTextoDetalle: 'Come lo racconteresti a qualcuno',
    grabando: 'Ti ascolto…',
    detener: 'Fatto, interpreta',
    interpretando: 'Sto capendo cosa hai detto…',
    subiendoFoto: 'Sto leggendo la ricevuta…',
    revisar: 'Controlla prima di salvare',
    transcripcion: 'Quello che ho capito',
    ejemplo: 'Es: venduti due profumi a 150 ciascuno',
  },

  cierre: {
    titulo: 'Chiusura del giorno',
    subtitulo: 'Dieci secondi e sai com’è andata',
    entro: 'Entrato',
    salio: 'Uscito',
    quedo: 'Ti è rimasto',
    sinActividad: 'Oggi non hai ancora annotato niente',
    sinActividadDetalle: 'Tocca il pulsante verde e racconta la tua prima vendita di oggi.',
    vsSemanaPasada: 'rispetto allo stesso giorno della settimana scorsa',
    vsPromedio: 'rispetto a una tua giornata normale',
    masQue: (p: string) => `${p} in più`,
    menosQue: (p: string) => `${p} in meno`,
    igualQue: 'come',
    estrella: 'Quello che ha reso di più oggi',
    marcar: 'Chiudi la giornata',
    cerrado: 'Giornata chiusa',
    volverManiana: 'A domani.',
  },

  racha: {
    dias: (n: number) => (n === 1 ? '1 giorno di fila' : `${n} giorni di fila`),
    ninguna: 'Inizia oggi la tua serie',
    enRiesgo: (n: number) =>
      n === 1
        ? 'Hai 1 giorno di serie. Annota qualcosa oggi per non perderla.'
        : `Hai ${n} giorni di serie. Annota qualcosa oggi per non perderla.`,
    mejor: (n: number) => `La tua serie migliore: ${n}`,
    nueva: 'Nuova serie!',
  },

  plan: {
    titulo: 'Il tuo piano',
    gratis: 'Gratis',
    pro: 'Pro',
    negocio: 'Attività',
    mensual: 'al mese',
    anual: "all'anno",
    porMes: 'mese',
    porAnio: 'anno',
    elegir: 'Scegli questo piano',
    actual: 'Il tuo piano attuale',
    ahorroAnual: 'Due mesi gratis',
    enPrueba: 'Stai provando Orden',
    diasDePrueba: (n: number) => (n === 1 ? 'Ti resta 1 giorno di prova' : `Ti restano ${n} giorni di prova`),
    pruebaVence: 'Quando finisce, i tuoi dati restano tuoi e puoi continuare a inserire a mano.',
    vencida: 'Il tuo piano a pagamento è finito',
    sinTarjeta: 'Senza carta per provare',
    cancelarCuando: 'Disdici quando vuoi',
    incluye: 'Include',
    personas: (n: number) => (n === 1 ? '1 persona' : `Fino a ${n} persone`),
    capturasMes: (n: number) => `${n} acquisizioni con IA al mese`,
    capturasLibres: 'Voce, foto e testo senza limiti',
    conAdjuntos: 'Ricevute conservate',
    conExcel: 'Excel da cinque fogli',
    soloManual: 'Inserimento manuale illimitato',
    historialCompleto: 'Tutta la tua cronologia, sempre',
    irAPagar: 'Vai al pagamento',
  },

  ajustes: {
    idioma: 'Lingua',
    zona: 'Fuso orario',
    avisos: 'Avvisi',
    avisoCierre: 'Ricordami di chiudere la giornata',
    avisoSemanal: 'Riepilogo settimanale via email',
    horaCierre: 'A che ora ricordartelo',
    guardado: 'Salvato',
  },

  errores: {
    sesion: 'Devi accedere.',
    permiso: 'Non hai il permesso di farlo.',
    red: 'Nessuna connessione. Riproviamo appena torna.',
    generico: 'Non è andata a buon fine. Riprova.',
  },

  sinConexion: {
    titulo: 'Offline',
    detalle: 'Non riusciamo a raggiungere il server. Quello che hai già salvato è al sicuro.',
  },
};
