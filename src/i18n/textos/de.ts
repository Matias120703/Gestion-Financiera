/**
 * Deutsch. Parcial: lo que falta cae a inglés.
 */
import type { Parcial } from '../fusionar';
import type { Textos } from './es';

export const de: Parcial<Textos> = {
  comun: {
    guardar: 'Speichern',
    cancelar: 'Abbrechen',
    cerrar: 'Schließen',
    volver: 'Zurück',
    seguir: 'Weiter',
    listo: 'Fertig',
    borrar: 'Löschen',
    reintentar: 'Erneut versuchen',
    cargando: 'Lädt…',
    guardando: 'Wird gespeichert…',
    hoy: 'Heute',
    ayer: 'Gestern',
    verTodo: 'Alle ansehen',
    error: 'Etwas ist schiefgelaufen',
  },

  formato: { mil: 'Tsd.', millon: 'Mio.', milMillones: 'Mrd.' },

  rangos: {
    hoy: 'Heute', ayer: 'Gestern', semana: 'Diese Woche', semana_pasada: 'Letzte Woche',
    mes: 'Dieser Monat', mes_pasado: 'Letzter Monat', anio: 'Dieses Jahr', siempre: 'Alles',
    personalizado: 'Benutzerdefiniert', todoElHistorial: 'Gesamter Verlauf',
  },

  nav: {
    panel: 'Übersicht',
    vender: 'Verkaufen',
    gastos: 'Ausgaben',
    productos: 'Produkte',
    historial: 'Verlauf',
    reto: 'Ziel',
    reportes: 'Berichte',
    ajustes: 'Einstellungen',
    cierre: 'Tagesabschluss',
    plan: 'Mein Tarif',
    miCuenta: 'Mein Konto',
    cambiarEmpresa: 'Betrieb wechseln',
    activa: 'aktiv',
    mas: 'Mehr',
    todasLasSecciones: 'Alle Bereiche',

    salir: 'Abmelden',
  },

  captura: {
    titulo: 'Was möchtest du erfassen?',
    porVoz: 'Sag es mir einfach',
    porVozDetalle: 'Tippen und erzählen',
    porFoto: 'Foto machen',
    porFotoDetalle: 'Bon, Rechnung oder Quittung',
    porTexto: 'Tippen',
    porTextoDetalle: 'So, wie du es jemandem erzählen würdest',
    grabando: 'Ich höre zu…',
    detener: 'Fertig, auswerten',
    interpretando: 'Ich verstehe gerade…',
    subiendoFoto: 'Beleg wird gelesen…',
    revisar: 'Vor dem Speichern prüfen',
    transcripcion: 'Was ich verstanden habe',
    ejemplo: 'z. B. zwei Parfums zu je 150 verkauft',
  },

  cierre: {
    titulo: 'Tagesabschluss',
    subtitulo: 'Zehn Sekunden und du weißt, wie der Tag lief',
    entro: 'Eingenommen',
    salio: 'Ausgegeben',
    quedo: 'Geblieben',
    sinActividad: 'Heute hast du noch nichts erfasst',
    sinActividadDetalle: 'Tippe auf den grünen Knopf und erzähl von deinem ersten Verkauf.',
    vsSemanaPasada: 'gegenüber demselben Tag letzte Woche',
    vsPromedio: 'gegenüber einem normalen Tag',
    masQue: (p: string) => `${p} mehr`,
    menosQue: (p: string) => `${p} weniger`,
    igualQue: 'genauso wie',
    estrella: 'Heute am besten gelaufen',
    marcar: 'Tag abschließen',
    cerrado: 'Tag abgeschlossen',
    volverManiana: 'Bis morgen.',
  },

  racha: {
    dias: (n: number) => (n === 1 ? '1 Tag in Folge' : `${n} Tage in Folge`),
    ninguna: 'Starte heute deine Serie',
    enRiesgo: (n: number) =>
      n === 1
        ? 'Du hast 1 Tag Serie. Erfasse heute etwas, damit sie hält.'
        : `Du hast ${n} Tage Serie. Erfasse heute etwas, damit sie hält.`,
    mejor: (n: number) => `Deine beste Serie: ${n}`,
    nueva: 'Neue Serie!',
  },

  plan: {
    titulo: 'Dein Tarif',
    gratis: 'Kostenlos',
    pro: 'Pro',
    negocio: 'Betrieb',
    mensual: 'pro Monat',
    anual: 'pro Jahr',
    porMes: 'Monat',
    porAnio: 'Jahr',
    elegir: 'Diesen Tarif wählen',
    actual: 'Dein aktueller Tarif',
    ahorroAnual: 'Zwei Monate gratis',
    enPrueba: 'Du testest Orden gerade',
    diasDePrueba: (n: number) => (n === 1 ? 'Noch 1 Tag Testphase' : `Noch ${n} Tage Testphase`),
    pruebaVence: 'Danach behältst du alle Daten und kannst weiter von Hand erfassen.',
    vencida: 'Dein bezahlter Tarif ist abgelaufen',
    sinTarjeta: 'Zum Testen ohne Karte',
    cancelarCuando: 'Jederzeit kündbar',
    incluye: 'Enthält',
    personas: (n: number) => (n === 1 ? '1 Person' : `Bis zu ${n} Personen`),
    capturasMes: (n: number) => `${n} KI-Erfassungen pro Monat`,
    capturasLibres: 'Sprache, Foto und Text ohne Limit',
    conAdjuntos: 'Belege werden aufbewahrt',
    conExcel: 'Excel mit fünf Blättern',
    soloManual: 'Manuelle Erfassung ohne Limit',
    historialCompleto: 'Dein ganzer Verlauf, immer',
    irAPagar: 'Zur Zahlung',
  },

  ajustes: {
    idioma: 'Sprache',
    zona: 'Zeitzone',
    avisos: 'Benachrichtigungen',
    avisoCierre: 'An den Tagesabschluss erinnern',
    avisoSemanal: 'Wochenrückblick per E-Mail',
    horaCierre: 'Wann erinnern',
    guardado: 'Gespeichert',
  },

  errores: {
    sesion: 'Du musst dich anmelden.',
    permiso: 'Dafür fehlt dir die Berechtigung.',
    red: 'Keine Verbindung. Wir versuchen es erneut, sobald sie zurück ist.',
    generico: 'Das hat nicht geklappt. Versuch es noch einmal.',
  },

  sinConexion: {
    titulo: 'Offline',
    detalle: 'Wir erreichen den Server nicht. Alles bereits Gespeicherte ist sicher.',
  },
};
