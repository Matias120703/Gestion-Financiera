/**
 * Français. Parcial: lo que falta cae a inglés.
 */
import type { Parcial } from '../fusionar';
import type { Textos } from './es';

export const fr: Parcial<Textos> = {
  comun: {
    guardar: 'Enregistrer',
    cancelar: 'Annuler',
    cerrar: 'Fermer',
    volver: 'Retour',
    seguir: 'Continuer',
    listo: 'Terminé',
    borrar: 'Supprimer',
    reintentar: 'Réessayer',
    cargando: 'Chargement…',
    guardando: 'Enregistrement…',
    hoy: "Aujourd'hui",
    ayer: 'Hier',
    verTodo: 'Tout voir',
    error: "Quelque chose n'a pas marché",
  },

  formato: { mil: 'k', millon: 'M', milMillones: 'Md' },

  rangos: {
    hoy: "Aujourd'hui", ayer: 'Hier', semana: 'Cette semaine', semana_pasada: 'Semaine dernière',
    mes: 'Ce mois-ci', mes_pasado: 'Mois dernier', anio: 'Cette année', siempre: 'Tout',
    personalizado: 'Personnalisé', todoElHistorial: 'Tout l’historique',
  },

  nav: {
    panel: 'Tableau de bord',
    vender: 'Vendre',
    gastos: 'Dépenses',
    productos: 'Produits',
    historial: 'Historique',
    reto: 'Objectif',
    reportes: 'Rapports',
    ajustes: 'Réglages',
    cierre: 'Clôture du jour',
    cierreCorto: 'Clôture',

    plan: 'Mon offre',
    miCuenta: 'Mon compte',
    cambiarEmpresa: 'Changer de commerce',
    activa: 'active',
    mas: 'Plus',
    todasLasSecciones: 'Toutes les sections',

    salir: 'Se déconnecter',
  },

  captura: {
    titulo: 'Que voulez-vous noter ?',
    porVoz: 'Dites-le-moi',
    porVozDetalle: "Appuyez et racontez ce qui s'est passé",
    porFoto: 'Prenez une photo',
    porFotoDetalle: 'Ticket, facture ou reçu',
    porTexto: 'Écrivez-le',
    porTextoDetalle: 'Comme vous le diriez à quelqu’un',
    grabando: "Je vous écoute…",
    detener: "C'est bon, interprétez",
    interpretando: 'Je comprends ce que vous avez dit…',
    subiendoFoto: 'Lecture du justificatif…',
    revisar: "Vérifiez avant d'enregistrer",
    transcripcion: "Ce que j'ai compris",
    ejemplo: 'Ex : vendu deux parfums à 150 chacun',
  },

  cierre: {
    titulo: 'Clôture du jour',
    subtitulo: 'Dix secondes et vous savez comment la journée est passée',
    entro: 'Encaissé',
    salio: 'Dépensé',
    quedo: 'Il vous reste',
    sinActividad: "Vous n'avez encore rien noté aujourd'hui",
    sinActividadDetalle: 'Appuyez sur le bouton vert et racontez votre première vente du jour.',
    vsSemanaPasada: 'par rapport au même jour la semaine dernière',
    vsPromedio: 'par rapport à une journée normale',
    masQue: (p: string) => `${p} de plus`,
    menosQue: (p: string) => `${p} de moins`,
    igualQue: 'comme',
    estrella: "Ce qui a le plus rapporté aujourd'hui",
    marcar: 'Clôturer la journée',
    cerrado: 'Journée clôturée',
    volverManiana: 'À demain.',
  },

  racha: {
    dias: (n: number) => (n === 1 ? "1 jour d'affilée" : `${n} jours d'affilée`),
    ninguna: "Commencez votre série aujourd'hui",
    enRiesgo: (n: number) =>
      n === 1
        ? "Vous avez 1 jour de série. Notez quelque chose aujourd'hui pour la garder."
        : `Vous avez ${n} jours de série. Notez quelque chose aujourd'hui pour la garder.`,
    mejor: (n: number) => `Votre meilleure série : ${n}`,
    nueva: 'Nouvelle série !',
  },

  plan: {
    titulo: 'Votre offre',
    gratis: 'Gratuit',
    pro: 'Pro',
    negocio: 'Commerce',
    mensual: 'par mois',
    anual: 'par an',
    porMes: 'mois',
    porAnio: 'an',
    elegir: 'Choisir cette offre',
    actual: 'Votre offre actuelle',
    ahorroAnual: 'Deux mois offerts',
    enPrueba: 'Vous essayez Orden',
    diasDePrueba: (n: number) => (n === 1 ? "Il reste 1 jour d'essai" : `Il reste ${n} jours d'essai`),
    pruebaVence: 'À la fin, vous gardez toutes vos données et pouvez continuer à saisir à la main.',
    vencida: 'Votre offre payante a pris fin',
    sinTarjeta: 'Sans carte pour essayer',
    cancelarCuando: 'Annulable à tout moment',
    incluye: 'Comprend',
    personas: (n: number) => (n === 1 ? '1 personne' : `Jusqu'à ${n} personnes`),
    capturasMes: (n: number) => `${n} saisies par IA par mois`,
    capturasLibres: 'Voix, photo et texte sans limite',
    conAdjuntos: 'Justificatifs conservés',
    conExcel: 'Excel de cinq feuilles',
    soloManual: 'Saisie manuelle illimitée',
    historialCompleto: 'Tout votre historique, toujours',
    irAPagar: 'Aller au paiement',
  },

  ajustes: {
    idioma: 'Langue',
    zona: 'Fuseau horaire',
    avisos: 'Notifications',
    avisoCierre: 'Me rappeler de clôturer la journée',
    avisoSemanal: 'Résumé de la semaine par e-mail',
    horaCierre: 'À quelle heure vous rappeler',
    guardado: 'Enregistré',
  },

  errores: {
    sesion: 'Vous devez vous connecter.',
    permiso: "Vous n'avez pas la permission de faire ça.",
    red: 'Pas de connexion. On réessaie dès son retour.',
    generico: "Ça n'a pas marché. Réessayez.",
  },

  sinConexion: {
    titulo: 'Hors ligne',
    detalle: "On n'arrive pas à joindre le serveur. Tout ce qui est déjà enregistré est en sécurité.",
  },
};
