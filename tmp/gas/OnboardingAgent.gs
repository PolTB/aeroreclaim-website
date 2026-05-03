/**
 * ═══════════════════════════════════════════════════════════════
 * AERORECLAIM — AGENTE 3: ONBOARDING
 * Versión 1.0 | Marzo 2026
 * 
 * Gestiona el onboarding de clientes aceptados por el Legal Scoring:
 *   1. Envía email de bienvenida con mandato
 *   2. Recoge documentación (boarding pass, DNI, aceptación mandato)
 *   3. Envía reminders automáticos
 *   4. Marca caso como listo para extrajudicial
 * 
 * TRIGGERS NECESARIOS (instalar con installOnboardingTriggers()):
 *   - processNewOnboardingCases: cada 5 min
 *   - processIncomingEmails: cada 15 min
 *   - sendReminders: diario a las 10:00
 * ═══════════════════════════════════════════════════════════════
 */

// ─── CONFIGURACIÓN ─────────────────────────────────────────────
var OB_CONFIG = {
  SPREADSHEET_ID: '10zEyvd3P57DidwOi2UM1VnXHDnPrIWMnpTSbdZ4zX-E',
  SHEET_ONBOARDING: 'Onboarding_Queue',
  FROM_EMAIL: 'info@aeroreclaim.com',
  ADMIN_EMAIL: 'info@aeroreclaim.com',
  NOTIFICATION_EMAIL: 'ptusquets@gmail.com',
  
  // Carpeta raíz en Google Drive para documentos de casos
  DRIVE_ROOT_FOLDER_NAME: 'AeroReclaim_Casos',
  
  // Tiempos para reminders (en días)
  REMINDER_1_DAYS: 3,
  REMINDER_2_DAYS: 7,
  ABANDON_DAYS: 14,
  
  // Columnas de Onboarding_Queue (1-indexed)
  COL: {
    CASO_ID:          1,   // A
    TIMESTAMP:        2,   // B
    NOMBRE:           3,   // C
    EMAIL:            4,   // D
    TELEFONO:         5,   // E
    VUELO:            6,   // F
    FECHA_VUELO:      7,   // G
    AEROLINEA:        8,   // H
    ORIGEN:           9,   // I
    DESTINO:          10,  // J
    INCIDENCIA:       11,  // K
    COMPENSACION:     12,  // L
    HONORARIOS:       13,  // M
    SCORE:            14,  // N
    DISTANCIA:        15,  // O
    ESTADO:           16,  // P
    FECHA_BIENVENIDA: 17,  // Q
    ULTIMO_REMINDER:  18,  // R
    NUM_REMINDERS:    19,  // S
    TIENE_BOARDING:   20,  // T
    TIENE_DNI:        21,  // U
    MANDATO_ACEPTADO: 22,  // V
    TIENE_IBAN:       23,  // W
    CARPETA_DRIVE:    24,  // X
    FECHA_COMPLETO:   25,  // Y
    NOTAS:            26   // Z
  },
  
  // Extensiones de archivo aceptadas
  ALLOWED_EXTENSIONS: ['pdf', 'jpg', 'jpeg', 'png', 'heic', 'doc', 'docx', 'gif', 'bmp', 'tiff', 'webp'],
  MAX_FILE_SIZE_MB: 10
};


// ═══════════════════════════════════════════════════════════════
// INSTALAR TRIGGERS — Ejecutar UNA SOLA VEZ manualmente
// ═══════════════════════════════════════════════════════════════

function installOnboardingTriggers() {
  // Limpiar triggers de onboarding existentes
  var functionsToClean = ['processNewOnboardingCases', 'processIncomingEmails', 'sendReminders'];
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (functionsToClean.indexOf(t.getHandlerFunction()) >= 0) {
      ScriptApp.deleteTrigger(t);
    }
  });
  
  // 1. Procesar nuevos casos cada 5 minutos
  ScriptApp.newTrigger('processNewOnboardingCases')
    .timeBased()
    .everyMinutes(5)
    .create();
  
  // 2. Revisar emails entrantes cada 15 minutos
  ScriptApp.newTrigger('processIncomingEmails')
    .timeBased()
    .everyMinutes(15)
    .create();
  
  // 3. Enviar reminders diariamente a las 10:00 (España)
  ScriptApp.newTrigger('sendReminders')
    .timeBased()
    .atHour(9) // UTC = 10:00 CET
    .everyDays(1)
    .create();
  
  Logger.log('✅ 3 triggers de onboarding instalados correctamente.');
}


// ═══════════════════════════════════════════════════════════════
// TRIGGER 1: PROCESAR NUEVOS CASOS (cada 5 min)
// ═══════════════════════════════════════════════════════════════

function processNewOnboardingCases() {
  var ss = SpreadsheetApp.openById(OB_CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(OB_CONFIG.SHEET_ONBOARDING);
  if (!sheet) return;
  
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return; // Solo headers
  
  // Leer todas las filas
  var data = sheet.getRange(2, 1, lastRow - 1, 26).getValues();
  
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var estado = String(row[OB_CONFIG.COL.ESTADO - 1] || '').toUpperCase().trim();
    var email = String(row[OB_CONFIG.COL.EMAIL - 1] || '').trim();
    var casoId = String(row[OB_CONFIG.COL.CASO_ID - 1] || '').trim();
    var caseId = casoId; // alias defensivo AER-75

    // Solo procesar estado PENDIENTE
    if (estado !== 'PENDIENTE') continue;
    if (!email || email.indexOf('@') < 0) continue;
    if (!casoId) continue;
    
    var actualRow = i + 2; // +2 porque i empieza en 0 y fila 1 es header
    
    try {
      // Guardia AER-75: doble declaración de caseId para prevenir ReferenceError
      // si la versión GAS no está sincronizada con el repo.
      // eslint-disable-next-line no-unused-vars
      var caseId = casoId; // redeclaración defensiva (GAS tolera var shadowing)
      var caso = readCaso(row);
      caso.sheetRow = actualRow;
      
      // Crear carpeta en Drive
      var folder = getOrCreateCaseFolder(casoId);
      
      // Generar mandato PDF
      var mandatoPdf = generateMandatoPDF(caso);
      
      // Guardar mandato en carpeta del caso
      folder.createFile(mandatoPdf);
      
      // Enviar email de bienvenida
      sendWelcomeEmail(caso, mandatoPdf);
      
      // Actualizar estado
      sheet.getRange(actualRow, OB_CONFIG.COL.ESTADO).setValue('BIENVENIDA_ENVIADA');
      sheet.getRange(actualRow, OB_CONFIG.COL.FECHA_BIENVENIDA).setValue(new Date());
      sheet.getRange(actualRow, OB_CONFIG.COL.NUM_REMINDERS).setValue(0);
      sheet.getRange(actualRow, OB_CONFIG.COL.TIENE_BOARDING).setValue('No');
      sheet.getRange(actualRow, OB_CONFIG.COL.TIENE_DNI).setValue('No');
      sheet.getRange(actualRow, OB_CONFIG.COL.MANDATO_ACEPTADO).setValue('No');
      sheet.getRange(actualRow, OB_CONFIG.COL.TIENE_IBAN).setValue('No');
      sheet.getRange(actualRow, OB_CONFIG.COL.CARPETA_DRIVE).setValue(folder.getUrl());
      
      Logger.log('✅ Bienvenida enviada: ' + casoId + ' → ' + email);
      
    } catch(error) {
      Logger.log('❌ Error procesando caso ' + casoId + ': ' + error.toString());
      sheet.getRange(actualRow, OB_CONFIG.COL.NOTAS).setValue('Error: ' + error.toString());
      // Notificar error
      try {
        MailApp.sendEmail(OB_CONFIG.NOTIFICATION_EMAIL, 
          '⚠️ Error Agente 3 — ' + casoId,
          'Error al enviar bienvenida.\nCaso: ' + casoId + '\nEmail: ' + email + 
          '\nError: ' + error.toString());
      } catch(e2) {}
    }
  }
}


// ═══════════════════════════════════════════════════════════════
// TRIGGER 2: PROCESAR EMAILS ENTRANTES (cada 15 min)
// ═══════════════════════════════════════════════════════════════

function processIncomingEmails() {
  var ss = SpreadsheetApp.openById(OB_CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(OB_CONFIG.SHEET_ONBOARDING);
  if (!sheet) return;
  
  // Buscar emails no leídos con nuestro subject pattern
  var threads = GmailApp.search('is:unread subject:"AeroReclaim" subject:"reclamación" -from:me', 0, 20);
  
  if (threads.length === 0) return;
  
  // Cargar datos del sheet para buscar casos activos
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  var sheetData = sheet.getRange(2, 1, lastRow - 1, 26).getValues();
  
  // Construir mapa email → caso
  var emailToCaso = {};
  for (var i = 0; i < sheetData.length; i++) {
    var email = String(sheetData[i][OB_CONFIG.COL.EMAIL - 1] || '').trim().toLowerCase();
    var estado = String(sheetData[i][OB_CONFIG.COL.ESTADO - 1] || '').toUpperCase().trim();
    
    // Solo casos en espera de documentos
    var estadosActivos = ['BIENVENIDA_ENVIADA', 'REMINDER_1', 'REMINDER_2', 'DOCS_PARCIAL', 'ABANDONADO'];
    if (estadosActivos.indexOf(estado) >= 0 && email) {
      emailToCaso[email] = {
        row: i + 2,
        data: sheetData[i],
        caso: readCaso(sheetData[i])
      };
      emailToCaso[email].caso.sheetRow = i + 2;
    }
  }
  
  // Procesar cada thread
  for (var t = 0; t < threads.length; t++) {
    var thread = threads[t];
    var messages = thread.getMessages();
    
    for (var m = 0; m < messages.length; m++) {
      var msg = messages[m];
      if (!msg.isUnread()) continue;
      
      var fromEmail = extractEmail(msg.getFrom()).toLowerCase();
      
      // ¿Este email corresponde a un caso activo?
      if (!emailToCaso[fromEmail]) {
        // No es un email de caso, marcar como leído y continuar
        continue;
      }
      
      var casoInfo = emailToCaso[fromEmail];
      var caso = casoInfo.caso;
      var sheetRow = casoInfo.row;
      
      try {
        processClientResponse(ss, sheet, sheetRow, caso, msg);
        msg.markRead();
        
        // Etiquetar email
        try {
          var label = GmailApp.getUserLabelByName('Sistema/Onboarding');
          if (!label) label = GmailApp.createLabel('Sistema/Onboarding');
          thread.addLabel(label);
        } catch(labelErr) {}
        
        Logger.log('✅ Email procesado de ' + fromEmail + ' para caso ' + caso.casoId);
        
      } catch(error) {
        Logger.log('❌ Error procesando email de ' + fromEmail + ': ' + error.toString());
      }
    }
  }
}


/**
 * Procesa la respuesta de un cliente
 */
function processClientResponse(ss, sheet, sheetRow, caso, message) {
  var body = message.getPlainBody() || '';
  var attachments = message.getAttachments();
  
  // 1. Verificar si acepta el mandato
  var bodyUpper = body.toUpperCase();
  var mandatoAceptado = bodyUpper.indexOf('ACEPTO') >= 0;
  
  // 2. Procesar adjuntos
  var tieneAdjuntos = attachments.length > 0;
  var adjuntosGuardados = 0;
  
  if (tieneAdjuntos) {
    var folder = getOrCreateCaseFolder(caso.casoId);
    
    for (var a = 0; a < attachments.length; a++) {
      var att = attachments[a];
      var fileName = att.getName() || 'documento_' + a;
      var extension = fileName.split('.').pop().toLowerCase();
      var sizeMB = att.getBytes().length / (1024 * 1024);
      
      // Validar extensión y tamaño
      if (OB_CONFIG.ALLOWED_EXTENSIONS.indexOf(extension) >= 0 && sizeMB <= OB_CONFIG.MAX_FILE_SIZE_MB) {
        folder.createFile(att.copyBlob().setName(fileName));
        adjuntosGuardados++;
      }
    }
  }
  
  // 3. Actualizar estado del caso
  var estadoActual = String(sheet.getRange(sheetRow, OB_CONFIG.COL.ESTADO).getValue()).toUpperCase().trim();
  var teniaBoardingAntes = String(sheet.getRange(sheetRow, OB_CONFIG.COL.TIENE_BOARDING).getValue()) === 'Sí';
  var teniaDNIAntes = String(sheet.getRange(sheetRow, OB_CONFIG.COL.TIENE_DNI).getValue()) === 'Sí';
  var mandatoAntes = String(sheet.getRange(sheetRow, OB_CONFIG.COL.MANDATO_ACEPTADO).getValue()) === 'Sí';
  
  // Heurística simple para adjuntos
  var tieneBoardingAhora = teniaBoardingAntes;
  var tieneDNIAhora = teniaDNIAntes;
  
  if (adjuntosGuardados >= 2) {
    tieneBoardingAhora = true;
    tieneDNIAhora = true;
  } else if (adjuntosGuardados === 1) {
    if (!teniaBoardingAntes) {
      tieneBoardingAhora = true;
    } else if (!teniaDNIAntes) {
      tieneDNIAhora = true;
    }
  }
  
  var mandatoAhora = mandatoAntes || mandatoAceptado;
  
  // Actualizar sheet
  sheet.getRange(sheetRow, OB_CONFIG.COL.TIENE_BOARDING).setValue(tieneBoardingAhora ? 'Sí' : 'No');
  sheet.getRange(sheetRow, OB_CONFIG.COL.TIENE_DNI).setValue(tieneDNIAhora ? 'Sí' : 'No');
  sheet.getRange(sheetRow, OB_CONFIG.COL.MANDATO_ACEPTADO).setValue(mandatoAhora ? 'Sí' : 'No');
  
  // Si estaba abandonado, reactivar
  if (estadoActual === 'ABANDONADO') {
    sheet.getRange(sheetRow, OB_CONFIG.COL.ESTADO).setValue('REACTIVADO');
    appendNote(sheet, sheetRow, 'Caso reactivado por respuesta del pasajero');
  }
  
  // 4. Determinar si documentación está completa
  var docsCompletos = tieneBoardingAhora && tieneDNIAhora && mandatoAhora;
  
  if (docsCompletos) {
    // ¡Onboarding completo!
    sheet.getRange(sheetRow, OB_CONFIG.COL.ESTADO).setValue('DOCS_COMPLETO');
    sheet.getRange(sheetRow, OB_CONFIG.COL.FECHA_COMPLETO).setValue(new Date());
    
    // Email de confirmación al pasajero
    sendOnboardingCompleteEmail(caso);
    
    // Notificar al admin
    MailApp.sendEmail(
      OB_CONFIG.NOTIFICATION_EMAIL,
      '🎉 Onboarding COMPLETO — ' + caso.casoId,
      'El pasajero ha enviado toda la documentación.\n\n' +
      'Caso: ' + caso.casoId + '\n' +
      'Pasajero: ' + caso.nombre + ' (' + caso.email + ')\n' +
      'Vuelo: ' + caso.vuelo + ' — ' + caso.aerolinea + '\n' +
      'Compensación: ' + caso.compensacion + '€\n\n' +
      'El caso está listo para la fase extrajudicial.'
    );
    
    // Marcar como listo para extrajudicial
    sheet.getRange(sheetRow, OB_CONFIG.COL.ESTADO).setValue('LISTO_EXTRAJUDICIAL');
    
    Logger.log('🎉 Onboarding completo: ' + caso.casoId);
    
  } else {
    // Documentación parcial — pedir lo que falta
    var faltantes = [];
    if (!tieneBoardingAhora) faltantes.push('Tarjeta de embarque o confirmación de reserva');
    if (!tieneDNIAhora) faltantes.push('Copia de DNI, NIE o Pasaporte');
    if (!mandatoAhora) faltantes.push('Escribe "ACEPTO" para autorizar la gestión de tu reclamación');
    
    if (faltantes.length > 0) {
      sendMissingDocsEmail(caso, faltantes);
      sheet.getRange(sheetRow, OB_CONFIG.COL.ESTADO).setValue('DOCS_PARCIAL');
    }
  }
  
  // Añadir nota con resumen
  var nota = 'Email recibido ' + formatDateES(new Date()) + ': ' + 
             adjuntosGuardados + ' adjuntos' + 
             (mandatoAceptado ? ', ACEPTO detectado' : '');
  appendNote(sheet, sheetRow, nota);
}


// ═══════════════════════════════════════════════════════════════
// TRIGGER 3: ENVIAR REMINDERS (diario)
// ═══════════════════════════════════════════════════════════════

function sendReminders() {
  var ss = SpreadsheetApp.openById(OB_CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(OB_CONFIG.SHEET_ONBOARDING);
  if (!sheet) return;
  
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  
  var data = sheet.getRange(2, 1, lastRow - 1, 26).getValues();
  var hoy = new Date();
  
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var estado = String(row[OB_CONFIG.COL.ESTADO - 1] || '').toUpperCase().trim();
    var fechaBienvenida = row[OB_CONFIG.COL.FECHA_BIENVENIDA - 1];
    var numReminders = Number(row[OB_CONFIG.COL.NUM_REMINDERS - 1]) || 0;
    var casoId = String(row[OB_CONFIG.COL.CASO_ID - 1] || '');
    var email = String(row[OB_CONFIG.COL.EMAIL - 1] || '');
    
    // Solo para estados en espera
    var estadosEspera = ['BIENVENIDA_ENVIADA', 'REMINDER_1', 'REMINDER_2', 'DOCS_PARCIAL'];
    if (estadosEspera.indexOf(estado) < 0) continue;
    if (!fechaBienvenida) continue;
    
    var diasDesde = daysBetween(new Date(fechaBienvenida), hoy);
    var actualRow = i + 2;
    var caso = readCaso(row);
    caso.sheetRow = actualRow;
    
    try {
      // Reminder 1: 3 días
      if (diasDesde >= OB_CONFIG.REMINDER_1_DAYS && numReminders === 0) {
        sendReminder1(caso);
        sheet.getRange(actualRow, OB_CONFIG.COL.ESTADO).setValue('REMINDER_1');
        sheet.getRange(actualRow, OB_CONFIG.COL.ULTIMO_REMINDER).setValue(new Date());
        sheet.getRange(actualRow, OB_CONFIG.COL.NUM_REMINDERS).setValue(1);
        Logger.log('📧 Reminder 1 enviado: ' + casoId);
      }
      // Reminder 2: 7 días
      else if (diasDesde >= OB_CONFIG.REMINDER_2_DAYS && numReminders === 1) {
        sendReminder2(caso);
        sheet.getRange(actualRow, OB_CONFIG.COL.ESTADO).setValue('REMINDER_2');
        sheet.getRange(actualRow, OB_CONFIG.COL.ULTIMO_REMINDER).setValue(new Date());
        sheet.getRange(actualRow, OB_CONFIG.COL.NUM_REMINDERS).setValue(2);
        Logger.log('📧 Reminder 2 enviado: ' + casoId);
      }
      // Abandonar: 14 días
      else if (diasDesde >= OB_CONFIG.ABANDON_DAYS && numReminders >= 2) {
        sendAbandonEmail(caso);
        sheet.getRange(actualRow, OB_CONFIG.COL.ESTADO).setValue('ABANDONADO');
        sheet.getRange(actualRow, OB_CONFIG.COL.ULTIMO_REMINDER).setValue(new Date());
        Logger.log('🚫 Caso abandonado: ' + casoId);
        
        // Notificar admin
        MailApp.sendEmail(OB_CONFIG.NOTIFICATION_EMAIL,
          '🚫 Caso ABANDONADO — ' + casoId,
          'El pasajero no respondió en ' + OB_CONFIG.ABANDON_DAYS + ' días.\n' +
          'Caso: ' + casoId + '\nPasajero: ' + caso.nombre + ' (' + caso.email + ')');
      }
    } catch(error) {
      Logger.log('❌ Error en reminder ' + casoId + ': ' + error.toString());
    }
  }
}


// ═══════════════════════════════════════════════════════════════
// GENERACIÓN DE MANDATO PDF
// ═══════════════════════════════════════════════════════════════

function generateMandatoPDF(caso) {
  var fechaActual = formatDateES(new Date());
  
  var html = '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    '<style>' +
    'body { font-family: "Segoe UI", Arial, sans-serif; margin: 40px; color: #333; line-height: 1.6; }' +
    'h1 { color: #1a3a5c; text-align: center; font-size: 18px; border-bottom: 2px solid #1a3a5c; padding-bottom: 10px; }' +
    'h2 { color: #1a3a5c; font-size: 14px; margin-top: 25px; }' +
    '.header { text-align: center; margin-bottom: 30px; }' +
    '.header img { height: 40px; }' +
    '.header p { color: #666; font-size: 12px; }' +
    '.data-box { background: #f5f8fc; border: 1px solid #d0dde8; padding: 15px; margin: 15px 0; border-radius: 4px; }' +
    '.data-box table { width: 100%; border-collapse: collapse; }' +
    '.data-box td { padding: 4px 8px; }' +
    '.data-box td:first-child { color: #666; width: 40%; }' +
    '.data-box td:last-child { font-weight: bold; }' +
    '.legal { font-size: 13px; }' +
    '.signature { margin-top: 40px; border-top: 1px solid #ccc; padding-top: 20px; }' +
    '.signature table { width: 100%; }' +
    '.signature td { padding: 5px; }' +
    '.footer { margin-top: 40px; text-align: center; font-size: 11px; color: #999; border-top: 1px solid #eee; padding-top: 10px; }' +
    '</style></head><body>' +
    
    '<div class="header">' +
    '<h1>AUTORIZACIÓN DE REPRESENTACIÓN<br>PARA RECLAMACIÓN AÉREA</h1>' +
    '<p>Reglamento (CE) nº 261/2004 del Parlamento Europeo y del Consejo</p>' +
    '</div>' +
    
    '<div class="legal">' +
    
    '<p>Yo, <strong>' + escapeHtml(caso.nombre) + '</strong>, con dirección de email ' +
    '<strong>' + escapeHtml(caso.email) + '</strong>,</p>' +
    
    '<p><strong>AUTORIZO</strong> a <strong>AERORECLAIM</strong>, con correo de contacto ' +
    'info@aeroreclaim.com y domicilio fiscal en España, a actuar en mi nombre y ' +
    'representación para lo siguiente:</p>' +
    
    '<h2>1. OBJETO DE LA AUTORIZACIÓN</h2>' +
    
    '<div class="data-box"><table>' +
    '<tr><td>Caso de referencia:</td><td>' + escapeHtml(caso.casoId) + '</td></tr>' +
    '<tr><td>Número de vuelo:</td><td>' + escapeHtml(caso.vuelo) + '</td></tr>' +
    '<tr><td>Fecha del vuelo:</td><td>' + escapeHtml(formatDateES(new Date(caso.fechaVuelo))) + '</td></tr>' +
    '<tr><td>Aerolínea:</td><td>' + escapeHtml(caso.aerolinea) + '</td></tr>' +
    '<tr><td>Ruta:</td><td>' + escapeHtml(caso.origen) + ' → ' + escapeHtml(caso.destino) + '</td></tr>' +
    '<tr><td>Incidencia:</td><td>' + escapeHtml(caso.incidencia) + '</td></tr>' +
    '<tr><td>Compensación estimada:</td><td>' + caso.compensacion + ' €</td></tr>' +
    '</table></div>' +
    
    '<p>La presente autorización faculta a AERORECLAIM para:</p>' +
    '<ol>' +
    '<li><strong>PRESENTAR</strong> reclamación extrajudicial ante ' + escapeHtml(caso.aerolinea) + 
    ' en virtud del Reglamento (CE) nº 261/2004.</li>' +
    '<li><strong>RECIBIR</strong> cualquier comunicación de la aerolínea relativa a esta reclamación.</li>' +
    '<li><strong>NEGOCIAR</strong> y, en su caso, aceptar la compensación económica prevista en el ' +
    'artículo 7 del citado Reglamento.</li>' +
    '</ol>' +
    
    '<h2>2. CONDICIONES ECONÓMICAS</h2>' +
    '<ul>' +
    '<li>AeroReclaim cobrará una comisión del <strong>25% + IVA (21%)</strong> sobre la ' +
    'compensación efectivamente cobrada.</li>' +
    '<li>Si no se obtiene compensación, <strong>no se cobrará nada</strong> al pasajero ' +
    '("No win, no fee").</li>' +
    '<li>Honorarios estimados: <strong>' + caso.honorarios + ' €</strong> (IVA incluido).</li>' +
    '</ul>' +
    
    '<h2>3. DURACIÓN Y REVOCACIÓN</h2>' +
    '<p>Esta autorización será válida hasta la resolución completa de la reclamación y ' +
    'podrá ser revocada en cualquier momento por el autorizante mediante comunicación ' +
    'escrita a info@aeroreclaim.com.</p>' +
    
    '<h2>4. PROTECCIÓN DE DATOS</h2>' +
    '<p>Los datos personales facilitados serán tratados exclusivamente para la gestión ' +
    'de la reclamación, conforme al Reglamento (UE) 2016/679 (RGPD). Puede ejercer ' +
    'sus derechos escribiendo a info@aeroreclaim.com.</p>' +
    
    '<div class="signature">' +
    '<p><strong>ACEPTACIÓN ELECTRÓNICA</strong></p>' +
    '<p>La aceptación de esta autorización se realiza mediante respuesta afirmativa ' +
    '("ACEPTO") al email enviado por AeroReclaim, constituyendo consentimiento válido ' +
    'conforme al artículo 1262 del Código Civil español y la Ley 34/2002 LSSI.</p>' +
    '<table>' +
    '<tr><td>Pasajero:</td><td><strong>' + escapeHtml(caso.nombre) + '</strong></td></tr>' +
    '<tr><td>Email:</td><td>' + escapeHtml(caso.email) + '</td></tr>' +
    '<tr><td>Fecha de generación:</td><td>' + fechaActual + '</td></tr>' +
    '<tr><td>Referencia:</td><td>' + escapeHtml(caso.casoId) + '</td></tr>' +
    '</table>' +
    '</div>' +
    
    '</div>' +
    
    '<div class="footer">' +
    '<p>AeroReclaim · Reclamaciones aéreas CE 261/2004 · info@aeroreclaim.com · aeroreclaim.com</p>' +
    '</div>' +
    
    '</body></html>';
  
  // Convertir HTML a PDF usando Apps Script
  var blob = HtmlService.createHtmlOutput(html)
    .getBlob()
    .setName('mandato_' + caso.casoId + '.pdf')
    .getAs('application/pdf');
  
  return blob;
}


// ═══════════════════════════════════════════════════════════════
// EMAILS AUTOMÁTICOS
// ═══════════════════════════════════════════════════════════════

function sendWelcomeEmail(caso, mandatoPdf) {
  var compensacionStr = String(caso.compensacion);
  var fechaVueloStr = formatDateES(new Date(caso.fechaVuelo));
  
  var subject = 'AeroReclaim — Tu reclamación de ' + compensacionStr + '€ por el vuelo ' + caso.vuelo;
  
  var htmlBody = 
    '<div style="font-family: \'Segoe UI\', Arial, sans-serif; max-width: 600px; margin: 0 auto;">' +
    
    '<div style="background: #1a3a5c; padding: 20px; text-align: center;">' +
    '<h1 style="color: white; margin: 0; font-size: 24px;">AeroReclaim</h1>' +
    '<p style="color: #a8c8e8; margin: 5px 0 0 0;">Tu compensación aérea, sin complicaciones</p>' +
    '</div>' +
    
    '<div style="padding: 30px; background: #ffffff;">' +
    '<p>Hola <strong>' + escapeHtml(caso.nombre) + '</strong>,</p>' +
    
    '<p>Hemos analizado tu caso y tenemos buenas noticias: <strong>tu vuelo ' + escapeHtml(caso.vuelo) + 
    ' del ' + fechaVueloStr + ' (' + escapeHtml(caso.origen) + ' → ' + escapeHtml(caso.destino) + 
    ') cumple los requisitos</strong> del Reglamento Europeo CE 261/2004 para reclamar compensación.</p>' +
    
    '<div style="background: #f0f7ff; border-left: 4px solid #1a3a5c; padding: 15px; margin: 20px 0;">' +
    '<h3 style="margin: 0 0 10px 0; color: #1a3a5c;">Resumen de tu caso</h3>' +
    '<table style="width: 100%; border-collapse: collapse;">' +
    '<tr><td style="padding: 5px 0; color: #666;">Caso ID:</td><td><strong>' + escapeHtml(caso.casoId) + '</strong></td></tr>' +
    '<tr><td style="padding: 5px 0; color: #666;">Vuelo:</td><td><strong>' + escapeHtml(caso.vuelo) + ' — ' + escapeHtml(caso.aerolinea) + '</strong></td></tr>' +
    '<tr><td style="padding: 5px 0; color: #666;">Ruta:</td><td><strong>' + escapeHtml(caso.origen) + ' → ' + escapeHtml(caso.destino) + '</strong></td></tr>' +
    '<tr><td style="padding: 5px 0; color: #666;">Fecha:</td><td><strong>' + fechaVueloStr + '</strong></td></tr>' +
    '<tr><td style="padding: 5px 0; color: #666;">Incidencia:</td><td><strong>' + escapeHtml(caso.incidencia) + '</strong></td></tr>' +
    '<tr><td style="padding: 5px 0; color: #666;">Compensación:</td><td style="color: #27ae60; font-size: 20px;"><strong>' + compensacionStr + '€</strong></td></tr>' +
    '<tr><td style="padding: 5px 0; color: #666;">Nuestros honorarios:</td><td>' + caso.honorarios + '€ (25% + IVA) — <em>solo si ganamos</em></td></tr>' +
    '</table></div>' +
    
    '<h3 style="color: #1a3a5c;">¿Qué necesitamos de ti?</h3>' +
    
    '<p>Para iniciar la reclamación, necesitamos que nos envíes <strong>respondiendo a este email</strong>:</p>' +
    
    '<ol>' +
    '<li><strong>Tarjeta de embarque</strong> o <strong>confirmación de reserva</strong> (foto, PDF o captura de pantalla)</li>' +
    '<li><strong>Copia de tu DNI, NIE o pasaporte</strong> (foto del anverso)</li>' +
    '<li>Escribe <strong>"ACEPTO"</strong> en tu respuesta para autorizar a AeroReclaim a gestionar tu reclamación</li>' +
    '</ol>' +
    
    '<div style="background: #fff8e1; border-left: 4px solid #f9a825; padding: 15px; margin: 20px 0;">' +
    '<p style="margin: 0;">Adjuntamos la <strong>autorización de representación</strong> para que la revises. ' +
    'Al responder "ACEPTO" confirmas tu conformidad con sus términos.</p>' +
    '</div>' +
    
    '<p>Es muy sencillo: simplemente <strong>responde a este email</strong> adjuntando los documentos y ' +
    'escribiendo "ACEPTO". Nosotros nos encargamos de todo lo demás.</p>' +
    
    '<div style="background: #e8f5e9; padding: 15px; border-radius: 5px; margin: 20px 0;">' +
    '<p style="margin: 0;"><strong>Recuerda:</strong> Si no obtenemos tu compensación, no pagas nada. ' +
    'Así de simple.</p>' +
    '</div>' +
    
    '<p>Si tienes alguna pregunta, responde a este email y te atenderemos lo antes posible.</p>' +
    
    '<p>Un saludo,<br>' +
    '<strong>El equipo de AeroReclaim</strong><br>' +
    '<a href="https://aeroreclaim.com" style="color: #1a3a5c;">aeroreclaim.com</a></p>' +
    '</div>' +
    
    '<div style="background: #f5f5f5; padding: 15px; text-align: center; font-size: 12px; color: #999;">' +
    '<p>AeroReclaim · Reclamaciones aéreas CE 261/2004<br>' +
    'info@aeroreclaim.com · <a href="https://aeroreclaim.com">aeroreclaim.com</a></p>' +
    '</div>' +
    '</div>';
  
  var options = {
    htmlBody: htmlBody,
    from: OB_CONFIG.FROM_EMAIL,
    name: 'AeroReclaim',
    attachments: [mandatoPdf]
  };
  
  GmailApp.sendEmail(caso.email, subject, 
    'Hola ' + caso.nombre + ', tu vuelo ' + caso.vuelo + ' cumple los requisitos para reclamar ' + 
    compensacionStr + '€. Responde con tu tarjeta de embarque, DNI y escribe ACEPTO.',
    options);
}


function sendReminder1(caso) {
  var subject = 'Recordatorio: Tu compensación de ' + caso.compensacion + '€ está pendiente — ' + caso.casoId;
  
  var htmlBody = 
    '<div style="font-family: \'Segoe UI\', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">' +
    '<p>Hola <strong>' + escapeHtml(caso.nombre) + '</strong>,</p>' +
    
    '<p>Hace unos días te informamos de que tu vuelo <strong>' + escapeHtml(caso.vuelo) + '</strong> cumple ' +
    'los requisitos para reclamar <strong>' + caso.compensacion + '€</strong> de compensación.</p>' +
    
    '<p>Para poder iniciar la reclamación solo necesitamos que respondas a nuestro email anterior con:</p>' +
    
    '<ol>' +
    '<li>Tarjeta de embarque o confirmación de reserva</li>' +
    '<li>Copia de DNI/NIE/Pasaporte</li>' +
    '<li>La palabra "ACEPTO"</li>' +
    '</ol>' +
    
    '<p><strong>Es rápido y no te costará nada si no ganamos.</strong></p>' +
    
    '<p>¿Tienes alguna duda? Responde a este email y te ayudamos.</p>' +
    
    '<p>Un saludo,<br>El equipo de <a href="https://aeroreclaim.com">AeroReclaim</a></p>' +
    '</div>';
  
  GmailApp.sendEmail(caso.email, subject,
    'Recordatorio: responde con tus documentos y ACEPTO para reclamar ' + caso.compensacion + '€.',
    { htmlBody: htmlBody, from: OB_CONFIG.FROM_EMAIL, name: 'AeroReclaim' });
}


function sendReminder2(caso) {
  var subject = 'Última oportunidad: ' + caso.compensacion + '€ pendientes — ' + caso.casoId;
  
  var htmlBody = 
    '<div style="font-family: \'Segoe UI\', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">' +
    '<p>Hola <strong>' + escapeHtml(caso.nombre) + '</strong>,</p>' +
    
    '<p>Te escribimos por última vez sobre tu posible compensación de <strong>' + caso.compensacion + 
    '€</strong> por el vuelo <strong>' + escapeHtml(caso.vuelo) + '</strong> del ' + 
    formatDateES(new Date(caso.fechaVuelo)) + '.</p>' +
    
    '<p>Entendemos que puedes tener dudas. Aquí van las respuestas más habituales:</p>' +
    
    '<ul>' +
    '<li><strong>¿Es gratis?</strong> Sí, si no ganamos, no pagas nada.</li>' +
    '<li><strong>¿Cuánto se lleva AeroReclaim?</strong> Solo el 25% + IVA de la compensación cobrada.</li>' +
    '<li><strong>¿Cuánto tarda?</strong> Entre 2 y 6 meses, dependiendo de la aerolínea.</li>' +
    '<li><strong>¿Es seguro?</strong> Sí, operamos conforme al Reglamento CE 261/2004.</li>' +
    '</ul>' +
    
    '<p>Si quieres seguir adelante, solo tienes que responder con tus documentos y "ACEPTO".</p>' +
    
    '<p>Si prefieres no continuar, no necesitas hacer nada. Cerraremos tu caso automáticamente en 7 días.</p>' +
    
    '<p>Un saludo,<br>El equipo de <a href="https://aeroreclaim.com">AeroReclaim</a></p>' +
    '</div>';
  
  GmailApp.sendEmail(caso.email, subject,
    'Última oportunidad: responde con tus documentos y ACEPTO para reclamar ' + caso.compensacion + '€.',
    { htmlBody: htmlBody, from: OB_CONFIG.FROM_EMAIL, name: 'AeroReclaim' });
}


function sendAbandonEmail(caso) {
  var subject = 'Tu caso ' + caso.casoId + ' ha sido cerrado — AeroReclaim';
  
  var htmlBody = 
    '<div style="font-family: \'Segoe UI\', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">' +
    '<p>Hola <strong>' + escapeHtml(caso.nombre) + '</strong>,</p>' +
    
    '<p>Como no hemos recibido tu documentación, hemos cerrado temporalmente tu caso ' +
    '<strong>' + escapeHtml(caso.casoId) + '</strong>.</p>' +
    
    '<p>Si cambias de opinión, puedes reabrir tu reclamación en cualquier momento respondiendo ' +
    'a este email o visitando <a href="https://aeroreclaim.com">aeroreclaim.com</a>.</p>' +
    
    '<p>Recuerda que tienes hasta 5 años desde la fecha del vuelo para reclamar (tu vuelo fue el ' +
    formatDateES(new Date(caso.fechaVuelo)) + ').</p>' +
    
    '<p>Un saludo,<br>El equipo de <a href="https://aeroreclaim.com">AeroReclaim</a></p>' +
    '</div>';
  
  GmailApp.sendEmail(caso.email, subject,
    'Tu caso ' + caso.casoId + ' ha sido cerrado por falta de documentación.',
    { htmlBody: htmlBody, from: OB_CONFIG.FROM_EMAIL, name: 'AeroReclaim' });
}


function sendMissingDocsEmail(caso, faltantes) {
  var subject = 'Re: Tu reclamación ' + caso.casoId + ' — Nos falta documentación';
  
  var listaHtml = '';
  for (var i = 0; i < faltantes.length; i++) {
    listaHtml += '<li>' + escapeHtml(faltantes[i]) + '</li>';
  }
  
  var htmlBody = 
    '<div style="font-family: \'Segoe UI\', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">' +
    '<p>Hola <strong>' + escapeHtml(caso.nombre) + '</strong>,</p>' +
    
    '<p>Gracias por tu respuesta. Hemos recibido parte de la documentación, pero aún nos falta:</p>' +
    
    '<ul>' + listaHtml + '</ul>' +
    
    '<p>¿Podrías enviárnoslo respondiendo a este email?</p>' +
    
    '<p>Un saludo,<br>El equipo de <a href="https://aeroreclaim.com">AeroReclaim</a></p>' +
    '</div>';
  
  GmailApp.sendEmail(caso.email, subject,
    'Gracias por tu respuesta. Aún nos falta: ' + faltantes.join(', '),
    { htmlBody: htmlBody, from: OB_CONFIG.FROM_EMAIL, name: 'AeroReclaim' });
}


function sendOnboardingCompleteEmail(caso) {
  var subject = 'Documentación recibida — Iniciamos tu reclamación ' + caso.casoId;
  
  var htmlBody = 
    '<div style="font-family: \'Segoe UI\', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">' +
    '<p>Hola <strong>' + escapeHtml(caso.nombre) + '</strong>,</p>' +
    
    '<p>Hemos recibido toda la documentación necesaria. <strong>Tu caso ' + escapeHtml(caso.casoId) + 
    ' está oficialmente en marcha.</strong></p>' +
    
    '<div style="background: #e8f5e9; padding: 15px; border-radius: 5px; margin: 20px 0;">' +
    '<h3 style="margin: 0 0 10px 0;">Estado de tu caso</h3>' +
    '<ul style="margin: 0;">' +
    '<li>Tarjeta de embarque / reserva: Recibida</li>' +
    '<li>Documento de identidad: Recibido</li>' +
    '<li>Autorización de representación: Aceptada</li>' +
    '</ul></div>' +
    
    '<h3>¿Qué pasa ahora?</h3>' +
    '<ol>' +
    '<li>Enviaremos la reclamación formal a <strong>' + escapeHtml(caso.aerolinea) + '</strong></li>' +
    '<li>La aerolínea tiene entre 4 y 8 semanas para responder</li>' +
    '<li>Te mantendremos informado de cualquier novedad</li>' +
    '</ol>' +
    
    '<p>Si necesitas contactarnos, responde a este email en cualquier momento.</p>' +
    
    '<p>Un saludo,<br>El equipo de <a href="https://aeroreclaim.com">AeroReclaim</a></p>' +
    '</div>';
  
  GmailApp.sendEmail(caso.email, subject,
    'Documentación recibida. Tu caso ' + caso.casoId + ' está en marcha.',
    { htmlBody: htmlBody, from: OB_CONFIG.FROM_EMAIL, name: 'AeroReclaim' });
}


// ═══════════════════════════════════════════════════════════════
// GOOGLE DRIVE — CARPETAS DE CASOS
// ═══════════════════════════════════════════════════════════════

function getOrCreateCaseFolder(casoId) {
  var rootFolders = DriveApp.getFoldersByName(OB_CONFIG.DRIVE_ROOT_FOLDER_NAME);
  var root;
  
  if (rootFolders.hasNext()) {
    root = rootFolders.next();
  } else {
    root = DriveApp.createFolder(OB_CONFIG.DRIVE_ROOT_FOLDER_NAME);
  }
  
  // Buscar carpeta del caso
  var caseFolders = root.getFoldersByName(casoId);
  if (caseFolders.hasNext()) {
    return caseFolders.next();
  }
  
  return root.createFolder(casoId);
}


// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function readCaso(row) {
  return {
    casoId:        String(row[OB_CONFIG.COL.CASO_ID - 1] || ''),
    timestamp:     row[OB_CONFIG.COL.TIMESTAMP - 1],
    nombre:        String(row[OB_CONFIG.COL.NOMBRE - 1] || ''),
    email:         String(row[OB_CONFIG.COL.EMAIL - 1] || ''),
    telefono:      String(row[OB_CONFIG.COL.TELEFONO - 1] || ''),
    vuelo:         String(row[OB_CONFIG.COL.VUELO - 1] || ''),
    fechaVuelo:    row[OB_CONFIG.COL.FECHA_VUELO - 1],
    aerolinea:     String(row[OB_CONFIG.COL.AEROLINEA - 1] || ''),
    origen:        String(row[OB_CONFIG.COL.ORIGEN - 1] || ''),
    destino:       String(row[OB_CONFIG.COL.DESTINO - 1] || ''),
    incidencia:    String(row[OB_CONFIG.COL.INCIDENCIA - 1] || ''),
    compensacion:  Number(row[OB_CONFIG.COL.COMPENSACION - 1]) || 0,
    honorarios:    Number(row[OB_CONFIG.COL.HONORARIOS - 1]) || 0,
    score:         Number(row[OB_CONFIG.COL.SCORE - 1]) || 0,
    distancia:     Number(row[OB_CONFIG.COL.DISTANCIA - 1]) || 0,
    estado:        String(row[OB_CONFIG.COL.ESTADO - 1] || ''),
    sheetRow:      null // Se asigna después
  };
}

function extractEmail(fromStr) {
  // "Juan García <juan@example.com>" → "juan@example.com"
  var match = fromStr.match(/<(.+?)>/);
  if (match) return match[1];
  // Si no hay <>, asumir que es el email directamente
  return fromStr.trim();
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDateES(date) {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) return '';
  try {
    return Utilities.formatDate(date, 'Europe/Madrid', 'dd/MM/yyyy');
  } catch(e) {
    return '';
  }
}

function daysBetween(date1, date2) {
  var oneDay = 24 * 60 * 60 * 1000;
  return Math.floor(Math.abs(date2 - date1) / oneDay);
}

function appendNote(sheet, row, note) {
  var current = String(sheet.getRange(row, OB_CONFIG.COL.NOTAS).getValue() || '');
  var separator = current ? ' | ' : '';
  sheet.getRange(row, OB_CONFIG.COL.NOTAS).setValue(current + separator + note);
}


// ═══════════════════════════════════════════════════════════════
// TESTING — Ejecutar manualmente
// ═══════════════════════════════════════════════════════════════

function testOnboardingWelcome() {
  var ss = SpreadsheetApp.openById(OB_CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(OB_CONFIG.SHEET_ONBOARDING);
  
  var testCaso = {
    casoId: 'AR-TEST-' + new Date().getTime(),
    nombre: 'Test Pasajero',
    email: OB_CONFIG.ADMIN_EMAIL,
    telefono: '',
    vuelo: 'VY7821',
    fechaVuelo: new Date('2025-12-15'),
    aerolinea: 'Vueling',
    origen: 'BCN',
    destino: 'LHR',
    incidencia: 'retraso >3h',
    compensacion: 250,
    honorarios: 75.63,
    score: 78,
    distancia: 1138
  };
  
  var mandato = generateMandatoPDF(testCaso);
  Logger.log('✅ Mandato PDF generado: ' + mandato.getName() + ' (' + mandato.getBytes().length + ' bytes)');
  
  sendWelcomeEmail(testCaso, mandato);
  Logger.log('✅ Email de bienvenida enviado a: ' + testCaso.email);
  
  return 'Test completado. Revisa ' + testCaso.email;
}

function testGenerateMandato() {
  var testCaso = {
    casoId: 'AR-TEST-001',
    nombre: 'María López García',
    email: 'maria@example.com',
    vuelo: 'IB3456',
    fechaVuelo: new Date('2025-11-20'),
    aerolinea: 'Iberia',
    origen: 'MAD',
    destino: 'CDG',
    incidencia: 'cancelación',
    compensacion: 400,
    honorarios: 121.00,
    score: 85,
    distancia: 1053
  };
  
  var mandato = generateMandatoPDF(testCaso);
  Logger.log('✅ Mandato generado: ' + mandato.getName());
  Logger.log('Tamaño: ' + (mandato.getBytes().length / 1024).toFixed(1) + ' KB');
  
  var file = DriveApp.createFile(mandato);
  Logger.log('📁 Guardado en Drive: ' + file.getUrl());
  
  return file.getUrl();
}

function checkOnboardingTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  var obTriggers = ['processNewOnboardingCases', 'processIncomingEmails', 'sendReminders'];
  var found = [];
  
  triggers.forEach(function(t) {
    if (obTriggers.indexOf(t.getHandlerFunction()) >= 0) {
      found.push(t.getHandlerFunction() + ' (' + t.getTriggerSource() + ')');
    }
  });
  
  Logger.log('Triggers de onboarding encontrados: ' + found.length);
  found.forEach(function(f) { Logger.log('  - ' + f); });
  
  if (found.length < 3) {
    Logger.log('⚠️ Faltan triggers. Ejecuta installOnboardingTriggers()');
  } else {
    Logger.log('✅ Todos los triggers de onboarding están instalados.');
  }

  return found;
}


// ═══════════════════════════════════════════════════════════════
// doPost — Webhook updateCaseStatus (AER-75)
// ═══════════════════════════════════════════════════════════════

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    if (payload.action !== 'updateCaseStatus') {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Unknown action' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var casoId = String(payload.casoId || '').trim();
    var newStatus = String(payload.status || '').trim();
    var notes = String(payload.notes || '').trim();

    if (!casoId || !newStatus) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'casoId and status required' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var ss = SpreadsheetApp.openById(OB_CONFIG.SPREADSHEET_ID);
    var sheet = ss.getSheetByName(OB_CONFIG.SHEET_ONBOARDING);
    if (!sheet) throw new Error('Sheet Onboarding_Queue not found');

    var data = sheet.getDataRange().getValues();
    var found = false;
    for (var i = 1; i < data.length; i++) {
      var rowCasoId = String(data[i][OB_CONFIG.COL.CASO_ID - 1] || '').trim();
      if (rowCasoId === casoId) {
        var sheetRow = i + 1;
        sheet.getRange(sheetRow, OB_CONFIG.COL.ESTADO).setValue(newStatus);
        if (notes) {
          sheet.getRange(sheetRow, OB_CONFIG.COL.NOTAS).setValue(notes);
        }
        found = true;
        break;
      }
    }

    if (!found) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'casoId not found: ' + casoId }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ success: true, casoId: casoId, newStatus: newStatus }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
