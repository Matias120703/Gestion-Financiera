/**
 * SUBIR UNA PLANILLA (114, compartido desde la 122).
 *
 * Lo que es igual en todo lugar donde se sube un Excel, un CSV o un link de
 * Google Sheets: elegir el archivo, pegar el link, «Leyendo la planilla…»,
 * los chips de las hojas y por qué no se pudo leer. Lo usan la rutina del
 * trainer (`rutinasEditor.importar`, que suma lo suyo) y la lista de
 * productos (`productos.planilla`).
 */
export const planillaEs = {
  elegirArchivo: 'Elegir archivo (.xlsx o .csv)',
  oLink: 'O pegá el link de Google Sheets',
  linkCampo: 'Link de Google Sheets',
  linkEjemplo: 'https://docs.google.com/spreadsheets/d/…',
  traer: 'Traer',
  ayudaGoogle: 'En Google Sheets: Archivo → Descargar → Microsoft Excel (.xlsx), y subí ese archivo. O compartila con «Cualquier persona con el enlace» y pegá el link.',
  leyendo: 'Leyendo la planilla…',
  hojas: 'Hojas de la planilla',
  errores: {
    muy_grande: 'La planilla pesa más de 4 MB. Guardala sin imágenes o bajala como CSV.',
    xls_viejo: 'Es un Excel viejo (.xls) o tiene contraseña. Abrilo y guardalo como «Libro de Excel (.xlsx)», sin contraseña.',
    ods: 'Es de LibreOffice (.ods). Guardalo como .xlsx y subilo de nuevo.',
    numbers: 'Es de Numbers. En Numbers: Archivo → Exportar a → Excel, y subí ese archivo.',
    no_es_planilla: 'No pudimos abrir ese archivo. Guardalo de nuevo como .xlsx o bajalo como CSV.',
    enlace_invalido: 'Ese link no es de Google Sheets.',
    no_es_sheets: 'Ese link es de un documento, no de una planilla.',
    archivo_en_drive: 'Ese link es de Drive. Abrí la planilla con Google Sheets y copiá ese link, o descargala y subila.',
    no_compartida: 'Esa planilla no está compartida. En Google Sheets: Compartir → Acceso general → «Cualquier persona con el enlace». O descargala como Excel y subila.',
    no_existe: 'Esa planilla no existe o se borró.',
    google_no_responde: 'Google no respondió. Probá de nuevo en un rato, o descargala como Excel y subila.',
    sin_sesion: 'Tu sesión se cerró. Volvé a entrar y probá de nuevo.',
    sin_acceso: 'No tenés acceso a esta cuenta.',
    error: 'No se pudo leer la planilla. Probá de nuevo.',
  },
};

export type CodigoErrorPlanilla = keyof typeof planillaEs.errores;

export const planillaPt: typeof planillaEs = {
  elegirArchivo: 'Escolher arquivo (.xlsx ou .csv)',
  oLink: 'Ou cole o link do Google Sheets',
  linkCampo: 'Link do Google Sheets',
  linkEjemplo: 'https://docs.google.com/spreadsheets/d/…',
  traer: 'Buscar',
  ayudaGoogle: 'No Google Sheets: Arquivo → Fazer download → Microsoft Excel (.xlsx) e envie esse arquivo. Ou compartilhe com «Qualquer pessoa com o link» e cole o link.',
  leyendo: 'Lendo a planilha…',
  hojas: 'Abas da planilha',
  errores: {
    muy_grande: 'A planilha tem mais de 4 MB. Salve sem imagens ou baixe como CSV.',
    xls_viejo: 'É um Excel antigo (.xls) ou tem senha. Abra e salve como «Pasta de Trabalho do Excel (.xlsx)», sem senha.',
    ods: 'É do LibreOffice (.ods). Salve como .xlsx e envie de novo.',
    numbers: 'É do Numbers. No Numbers: Arquivo → Exportar para → Excel e envie esse arquivo.',
    no_es_planilla: 'Não conseguimos abrir esse arquivo. Salve de novo como .xlsx ou baixe como CSV.',
    enlace_invalido: 'Esse link não é do Google Sheets.',
    no_es_sheets: 'Esse link é de um documento, não de uma planilha.',
    archivo_en_drive: 'Esse link é do Drive. Abra a planilha no Google Sheets e copie esse link, ou baixe e envie.',
    no_compartida: 'Essa planilha não está compartilhada. No Google Sheets: Compartilhar → Acesso geral → «Qualquer pessoa com o link». Ou baixe como Excel e envie.',
    no_existe: 'Essa planilha não existe ou foi apagada.',
    google_no_responde: 'O Google não respondeu. Tente de novo daqui a pouco, ou baixe como Excel e envie.',
    sin_sesion: 'Sua sessão foi encerrada. Entre de novo e tente outra vez.',
    sin_acceso: 'Você não tem acesso a esta conta.',
    error: 'Não deu para ler a planilha. Tente de novo.',
  },
};
