/**
 * ═══════════════════════════════════════════════════════════════
 * AERORECLAIM — AGENTE 5: AESA / ESCALADA LEGAL
 * Versión 1.0 | Marzo 2026
 *
 * Gestiona el proceso completo de escalada ante AESA (RAL):
 *   1. Detecta ESCALADA_AESA / RECHAZADA en Extrajudicial_Queue
 *   2. Valida elegibilidad para procedimiento RAL (5 checks)
 *   3. Prepara dossier completo + datos pre-rellenados para formulario
 *   4. Envía alerta interna rica con paquete ready-to-submit
 *   5. Monitoriza actualizaciones manuales (presentación, expediente, decisión)
 *   6. Gestiona plazos críticos: subsanación (10 días hábiles) y cumplimiento (1 mes)
 *   7. Notifica al pasajero en cada hito relevante
 *
 * RESTRICCIÓN CLAVE: AESA no tiene API. La presentación es manual
 * (certificado digital + formulario web en sede.seguridadaerea.gob.es).
 * Este agente PREPARA y ALERTA; el operador humano PRESENTA.
 *
 * TRIGGERS (instalar con installAESATriggers()):
 *   - processNewAESACases:  cada 5 min
 *   - processAESAUpdates:   cada 15 min
 *   - processAESADeadlines: diario a las 10:00
 *
 * COSTE: 0€/mes — todo sobre Google Workspace existente
 * ═══════════════════════════════════════════════════════════════
 */

// ─── CONFIGURACIÓN ─────────────────────────────────────────────
var AESA_CONFIG = {
  SPREADSHEET_ID: '10zEyvd3P57DidwOi2UM1VnXHDnPrIWMnpTSbdZ4zX-E',
  SHEETS: {
    EXTRAJUDICIAL_QUEUE: 'Extrajudicial_Queue',
    AESA_QUEUE:          'AESA_Queue',
    LOG:                 'Agent5_Log'
  },
  AERORECLAIM_EMAIL:  'info@aeroreclaim.com',
  AERORECLAIM_NAME:   'AeroReclaim Solutions',
  NOTIFICATION_EMAIL: 'ptusquets@gmail.com',
  AESA_SEDE_URL:      'https://sede.seguridadaerea.gob.es',

  // Fecha de activación del RAL (vuelos desde esta fecha → vinculante)
  RAL_START_DATE: new Date('2023-06-02T00:00:00'),

  // Plazos en días
  DEADLINES: {
    MIN_WAIT_AFTER_AIRLINE_CLAIM:    30,   // mínimo antes de ir a AESA
    MAX_WAIT_AFTER_AIRLINE_CLAIM:    365,  // máximo para presentar
    SUBSANACION_BUSINESS_DAYS:       10,   // días hábiles para subsanar
    COMPLIANCE_DAYS:                 30,   // días para que aerolínea pague
    DOSSIER_READY_REMINDER_DAYS:     7,    // recordar presentar si >7 días
    PRESENTED_NO_EXPEDIENTE_DAYS:    30    // recordar expediente si >30 días
  },

  // Status values
  STATUS: {
    // Extrajudicial_Queue (source)
    EX_ESCALATED_AESA:  'ESCALADA_AESA',
    EX_REJECTED:        'RECHAZADA',
    EX_PROCESSED_AESA:  'PROCESADO_AESA',
    // AESA_Queue
    PENDING_VALIDATION: 'PENDIENTE_VALIDACION',
    NOT_ELIGIBLE:       'NO_ELEGIBLE',
    DOSSIER_PREP:       'DOSSIER_EN_PREPARACION',
    DOSSIER_READY:      'DOSSIER_LISTO',
    PRESENTED:          'PRESENTADA_AESA',
    SUBSANACION:        'SUBSANACION_REQUERIDA',
    HEARING:            'AUDIENCIA_AEROLINEA',
    PENDING_DECISION:   'PENDIENTE_DECISION',
    DECISION_FAV:       'DECISION_FAVORABLE',
    DECISION_UNFAV:     'DECISION_DESFAVORABLE',
    COBRO_PENDING:      'COBRO_PENDIENTE',
    NON_COMPLIANCE:     'INCUMPLIMIENTO_AEROLINEA',
    CLOSED_SUCCESS:     'CERRADO_EXITOSO',
    CLOSED_FAIL:        'CERRADO_SIN_EXITO',
    MANUAL_REVIEW:      'REQUIERE_REVISION_MANUAL',
    ERROR:              'ERROR'
  },

  // Tipos de incidencia elegibles para RAL
  ELIGIBLE_INCIDENT_TYPES: ['RETRASO', 'CANCELACION', 'OVERBOOKING', 'DOWNGRADE', 'PMR'],

  // Aerolíneas de la UE (para check de jurisdicción llegadas)
  EU_CARRIERS: ['VY','IB','I2','UX','V7','TO','AF','LH','AZ','EW','SK','KL',
                'OS','BA','TP','SN','LX','BT','TK','A3','FR','U2','W6','DY'],

  // Aeropuertos españoles (para check de jurisdicción)
  SPANISH_AIRPORTS: ['MAD','BCN','AGP','PMI','ALC','VLC','SVQ','BIO','SCQ',
                     'LPA','TFN','TFS','FUE','ACE','IBZ','MAH','VGO','OVD',
                     'SDR','GRX','LEI','REU','GRO','ZAZ','XRY','SPC','BJZ',
                     'MJV','RMU','PNA','VIT','LCG','EAS','RGS','ABC','HSK']
};


// ═══════════════════════════════════════════════════════════════
// MÓDULO 1: NUEVOS CASOS (trigger cada 5 min)
// ═══════════════════════════════════════════════════════════════

function processNewAESACases() {
  var ss = SpreadsheetApp.openById(AESA_CONFIG.SPREADSHEET_ID);
  var exSheet   = ss.getSheetByName(AESA_CONFIG.SHEETS.EXTRAJUDICIAL_QUEUE);
  var aesaSheet = ss.getSheetByName(AESA_CONFIG.SHEETS.AESA_QUEUE);

  if (!exSheet || !aesaSheet) {
    logActionAESA_(ss, 'SYSTEM', 'ERROR', 'Falta pestaña Extrajudicial_Queue o AESA_Queue');
    return;
  }

  var exData = exSheet.getDataRange().getValues();
  if (exData.length < 2) return;

  var headers    = exData[0];
  var colStatus  = findColAESA_(headers, 'status');
  var colCaseId  = findColAESA_(headers, 'case_id');

  if (colStatus < 0 || colCaseId < 0) {
    logActionAESA_(ss, 'SYSTEM', 'ERROR', 'Columnas status/case_id no encontradas en Extrajudicial_Queue');
    return;
  }

  var SOURCE_STATUSES = [
    AESA_CONFIG.STATUS.EX_ESCALATED_AESA,
    AESA_CONFIG.STATUS.EX_REJECTED
  ];

  var processedCount = 0;

  for (var i = 1; i < exData.length; i++) {
    var row    = exData[i];
    var status = row[colStatus];

    if (SOURCE_STATUSES.indexOf(status) === -1) continue;

    var caseId = row[colCaseId];
    if (!caseId) continue;

    // Deduplicación
    if (caseExistsInAESA_(aesaSheet, caseId)) {
      logActionAESA_(ss, caseId, 'SKIP_DUPLICATE', 'Ya existe en AESA_Queue');
      exSheet.getRange(i + 1, colStatus + 1).setValue(AESA_CONFIG.STATUS.EX_PROCESSED_AESA);
      continue;
    }

    try {
      logActionAESA_(ss, caseId, 'CASE_RECEIVED', 'Desde Extrajudicial status: ' + status);

      var caseData   = extractAESACaseData_(row, headers);
      var eligibility = validateAESAEligibility_(caseData);

      var newStatus;
      var dossier    = null;
      var aesaRecord = null;

      if (eligibility.informativeOnly) {
        // Vuelo anterior a 02/06/2023 → vía informativa (no vinculante)
        newStatus  = AESA_CONFIG.STATUS.MANUAL_REVIEW;
        aesaRecord = buildAESARecord_(caseData, eligibility, null, newStatus);
        aesaSheet.appendRow(aesaRecord);
        sendInternalAlertAESA_(ss, caseId,
          'VÍA INFORMATIVA (no RAL): vuelo anterior al 02/06/2023.\n' +
          'Solo procedimiento informativo AESA (no vinculante para aerolínea).\n' +
          'Pasajero: ' + caseData.passenger_name + ' | Vuelo: ' + caseData.flight_number +
          ' (' + caseData.flight_date + ')');
        logActionAESA_(ss, caseId, 'INFORMATIVE_ONLY', 'Vuelo pre-RAL: ' + caseData.flight_date);

      } else if (!eligibility.eligible) {
        newStatus  = AESA_CONFIG.STATUS.NOT_ELIGIBLE;
        aesaRecord = buildAESARecord_(caseData, eligibility, null, newStatus);
        aesaSheet.appendRow(aesaRecord);
        sendInternalAlertAESA_(ss, caseId,
          'NO ELEGIBLE para RAL AESA.\nMotivo: ' + eligibility.notes +
          '\nPasajero: ' + caseData.passenger_name + ' | Vuelo: ' + caseData.flight_number);
        logActionAESA_(ss, caseId, 'ELIGIBILITY_FAIL', eligibility.notes);

      } else {
        // Elegible: preparar dossier
        dossier    = buildAESADossier_(caseData);
        newStatus  = AESA_CONFIG.STATUS.DOSSIER_READY;
        aesaRecord = buildAESARecord_(caseData, eligibility, dossier, newStatus);
        aesaSheet.appendRow(aesaRecord);

        // Enviar alerta interna rica con el dossier completo
        sendDossierAlert_(caseData, eligibility, dossier);

        logActionAESA_(ss, caseId, 'DOSSIER_READY',
          'Dossier listo. Docs faltantes: ' + (dossier.missingDocs.join(', ') || 'ninguno'));
      }

      // Marcar caso como procesado en Extrajudicial_Queue
      exSheet.getRange(i + 1, colStatus + 1).setValue(AESA_CONFIG.STATUS.EX_PROCESSED_AESA);
      processedCount++;
      Utilities.sleep(2000);

    } catch (error) {
      logActionAESA_(ss, caseId, 'ERROR', error.toString());
      sendInternalAlertAESA_(ss, caseId, 'ERROR procesando caso en Agent 5: ' + error.toString());
    }
  }

  if (processedCount > 0) {
    logActionAESA_(ss, 'SYSTEM', 'BATCH_COMPLETE', 'Procesados ' + processedCount + ' casos nuevos');
  }
}


// ═══════════════════════════════════════════════════════════════
// MÓDULO 2: ACTUALIZACIONES MANUALES (trigger cada 15 min)
// ═══════════════════════════════════════════════════════════════

function processAESAUpdates() {
  var ss        = SpreadsheetApp.openById(AESA_CONFIG.SPREADSHEET_ID);
  var aesaSheet = ss.getSheetByName(AESA_CONFIG.SHEETS.AESA_QUEUE);

  if (!aesaSheet) return;

  var data = aesaSheet.getDataRange().getValues();
  if (data.length < 2) return;

  var headers = data[0];

  var cols = {
    caseId:              findColAESA_(headers, 'case_id'),
    passengerName:       findColAESA_(headers, 'passenger_name'),
    passengerEmail:      findColAESA_(headers, 'passenger_email'),
    airlineName:         findColAESA_(headers, 'airline_name'),
    flightNumber:        findColAESA_(headers, 'flight_number'),
    compensationEur:     findColAESA_(headers, 'compensation_eur'),
    submissionDate:      findColAESA_(headers, 'aesa_submission_date'),
    expedienteNum:       findColAESA_(headers, 'aesa_expediente_num'),
    subsanacionDate:     findColAESA_(headers, 'aesa_subsanacion_date'),
    subsanacionDeadline: findColAESA_(headers, 'aesa_subsanacion_deadline'),
    decisionDate:        findColAESA_(headers, 'aesa_decision_date'),
    decisionType:        findColAESA_(headers, 'aesa_decision_type'),
    decisionNotes:       findColAESA_(headers, 'aesa_decision_notes'),
    complianceDeadline:  findColAESA_(headers, 'airline_compliance_deadline'),
    airlineComplied:     findColAESA_(headers, 'airline_complied'),
    status:              findColAESA_(headers, 'status'),
    statusUpdatedAt:     findColAESA_(headers, 'status_updated_at')
  };

  // Status activos que pueden tener actualizaciones
  var CLOSED_STATUSES = [
    AESA_CONFIG.STATUS.CLOSED_SUCCESS,
    AESA_CONFIG.STATUS.CLOSED_FAIL,
    AESA_CONFIG.STATUS.NOT_ELIGIBLE,
    AESA_CONFIG.STATUS.ERROR
  ];

  for (var i = 1; i < data.length; i++) {
    var row    = data[i];
    var status = row[cols.status];

    if (CLOSED_STATUSES.indexOf(status) >= 0) continue;

    var caseId = row[cols.caseId];
    if (!caseId) continue;

    try {
      var rowNum = i + 1;

      // ─── TRANSITION 1: Fecha de presentación rellenada → PRESENTADA_AESA ───
      if (status === AESA_CONFIG.STATUS.DOSSIER_READY) {
        var submDate = row[cols.submissionDate];
        if (submDate && submDate !== '') {
          aesaSheet.getRange(rowNum, cols.status + 1).setValue(AESA_CONFIG.STATUS.PRESENTED);
          aesaSheet.getRange(rowNum, cols.statusUpdatedAt + 1).setValue(new Date());
          logActionAESA_(ss, caseId, 'PRESENTED_AESA',
            'Fecha presentación: ' + formatDateAESA_(new Date(submDate)));
          notifyPassengerPresented_(row, cols);
          Utilities.sleep(500);
        }
      }

      // ─── TRANSITION 2: Número de expediente rellenado → log ───
      if (status === AESA_CONFIG.STATUS.PRESENTED ||
          status === AESA_CONFIG.STATUS.SUBSANACION ||
          status === AESA_CONFIG.STATUS.HEARING) {
        var expNum = row[cols.expedienteNum];
        var prevLog = checkExpedienteLogged_(ss, caseId);
        if (expNum && expNum !== '' && !prevLog) {
          logActionAESA_(ss, caseId, 'EXPEDIENTE_ASSIGNED', 'Expediente AESA: ' + expNum);
          sendInternalAlertAESA_(ss, caseId,
            'Expediente AESA asignado: ' + expNum +
            '\nPasajero: ' + row[cols.passengerName] +
            '\nVuelo: ' + row[cols.flightNumber]);
        }
      }

      // ─── TRANSITION 3: Fecha subsanación rellenada → SUBSANACION_REQUERIDA ───
      if (status === AESA_CONFIG.STATUS.PRESENTED &&
          row[cols.subsanacionDate] && row[cols.subsanacionDate] !== '') {
        var subsDate = new Date(row[cols.subsanacionDate]);
        var subsDeadline = addBusinessDays_(subsDate, AESA_CONFIG.DEADLINES.SUBSANACION_BUSINESS_DAYS);

        aesaSheet.getRange(rowNum, cols.subsanacionDeadline + 1).setValue(subsDeadline);
        aesaSheet.getRange(rowNum, cols.status + 1).setValue(AESA_CONFIG.STATUS.SUBSANACION);
        aesaSheet.getRange(rowNum, cols.statusUpdatedAt + 1).setValue(new Date());

        var daysLeft = countBusinessDaysUntil_(subsDeadline);
        logActionAESA_(ss, caseId, 'SUBSANACION_REQUIRED',
          'Deadline: ' + formatDateAESA_(subsDeadline) + ' (' + daysLeft + ' días hábiles)');
        sendSubsanacionAlert_(ss, caseId, row, cols, subsDeadline, daysLeft);
        Utilities.sleep(500);
      }

      // ─── TRANSITION 4: Decisión AESA rellenada ───
      if (row[cols.decisionDate] && row[cols.decisionDate] !== '' &&
          row[cols.decisionType] && row[cols.decisionType] !== '') {

        var curSt = row[cols.status];
        var alreadyProcessed = (curSt === AESA_CONFIG.STATUS.DECISION_FAV  ||
                                curSt === AESA_CONFIG.STATUS.DECISION_UNFAV ||
                                curSt === AESA_CONFIG.STATUS.COBRO_PENDING  ||
                                curSt === AESA_CONFIG.STATUS.CLOSED_FAIL);

        if (!alreadyProcessed) {
          var decType  = String(row[cols.decisionType]).toUpperCase().trim();
          var decDate  = new Date(row[cols.decisionDate]);
          var decNotes = row[cols.decisionNotes] || '';

          if (decType === 'FAVORABLE') {
            var complianceDl = new Date(decDate);
            complianceDl.setDate(complianceDl.getDate() + AESA_CONFIG.DEADLINES.COMPLIANCE_DAYS);

            aesaSheet.getRange(rowNum, cols.complianceDeadline + 1).setValue(complianceDl);
            aesaSheet.getRange(rowNum, cols.status + 1).setValue(AESA_CONFIG.STATUS.COBRO_PENDING);
            aesaSheet.getRange(rowNum, cols.statusUpdatedAt + 1).setValue(new Date());

            logActionAESA_(ss, caseId, 'DECISION_FAVORABLE',
              'Decisión: ' + formatDateAESA_(decDate) + ' | Deadline cobro: ' + formatDateAESA_(complianceDl));
            notifyPassengerFavorableDecision_(row, cols, complianceDl);
            sendInternalAlertAESA_(ss, caseId,
              'DECISIÓN FAVORABLE de AESA.\n' +
              'Pasajero: ' + row[cols.passengerName] +
              ' | Aerolínea: ' + row[cols.airlineName] +
              ' | Compensación: ' + row[cols.compensationEur] + '€\n' +
              'Deadline pago aerolínea: ' + formatDateAESA_(complianceDl) +
              '\nNotas: ' + decNotes);

          } else if (decType === 'DESFAVORABLE' || decType === 'DESISTIMIENTO') {
            aesaSheet.getRange(rowNum, cols.status + 1).setValue(AESA_CONFIG.STATUS.DECISION_UNFAV);
            aesaSheet.getRange(rowNum, cols.statusUpdatedAt + 1).setValue(new Date());

            logActionAESA_(ss, caseId, 'DECISION_DESFAVORABLE', 'Tipo: ' + decType + ' | ' + decNotes);
            notifyPassengerUnfavorableDecision_(row, cols, decType);
            sendInternalAlertAESA_(ss, caseId,
              'DECISIÓN ' + decType + ' de AESA.\n' +
              'Pasajero: ' + row[cols.passengerName] +
              ' | Aerolínea: ' + row[cols.airlineName] +
              '\nNotas: ' + decNotes + '\nRevisar si el pasajero quiere ir a juicio.');
          }
          Utilities.sleep(500);
        }
      }

      // ─── TRANSITION 5: airline_complied = TRUE → CERRADO_EXITOSO ───
      if (status === AESA_CONFIG.STATUS.COBRO_PENDING &&
          row[cols.airlineComplied] === true) {
        aesaSheet.getRange(rowNum, cols.status + 1).setValue(AESA_CONFIG.STATUS.CLOSED_SUCCESS);
        aesaSheet.getRange(rowNum, cols.statusUpdatedAt + 1).setValue(new Date());

        logActionAESA_(ss, caseId, 'CASE_CLOSED_SUCCESS',
          'Aerolínea cumplió. Compensación: ' + row[cols.compensationEur] + '€');
        notifyPassengerPaymentConfirmed_(row, cols);
        sendInternalAlertAESA_(ss, caseId,
          '¡COBRO CONFIRMADO! Aerolínea ' + row[cols.airlineName] +
          ' ha pagado los ' + row[cols.compensationEur] + '€.\n' +
          'Pasajero: ' + row[cols.passengerName] + '\nExpediente: ' + row[cols.caseId]);
        Utilities.sleep(500);
      }

    } catch (error) {
      logActionAESA_(ss, caseId, 'ERROR', 'processAESAUpdates: ' + error.toString());
    }
  }
}


// ═══════════════════════════════════════════════════════════════
// MÓDULO 3: GESTIÓN DE PLAZOS (trigger diario 10:00)
// ═══════════════════════════════════════════════════════════════

function processAESADeadlines() {
  var ss        = SpreadsheetApp.openById(AESA_CONFIG.SPREADSHEET_ID);
  var aesaSheet = ss.getSheetByName(AESA_CONFIG.SHEETS.AESA_QUEUE);

  if (!aesaSheet) return;

  var data = aesaSheet.getDataRange().getValues();
  if (data.length < 2) return;

  var headers = data[0];
  var today   = new Date();
  today.setHours(0, 0, 0, 0);

  var cols = {
    caseId:              findColAESA_(headers, 'case_id'),
    createdAt:           findColAESA_(headers, 'created_at'),
    passengerName:       findColAESA_(headers, 'passenger_name'),
    passengerEmail:      findColAESA_(headers, 'passenger_email'),
    airlineName:         findColAESA_(headers, 'airline_name'),
    compensationEur:     findColAESA_(headers, 'compensation_eur'),
    flightNumber:        findColAESA_(headers, 'flight_number'),
    submissionDate:      findColAESA_(headers, 'aesa_submission_date'),
    expedienteNum:       findColAESA_(headers, 'aesa_expediente_num'),
    subsanacionDeadline: findColAESA_(headers, 'aesa_subsanacion_deadline'),
    decisionDate:        findColAESA_(headers, 'aesa_decision_date'),
    complianceDeadline:  findColAESA_(headers, 'airline_compliance_deadline'),
    airlineComplied:     findColAESA_(headers, 'airline_complied'),
    status:              findColAESA_(headers, 'status'),
    statusUpdatedAt:     findColAESA_(headers, 'status_updated_at')
  };

  var SKIP_STATUSES = [
    AESA_CONFIG.STATUS.CLOSED_SUCCESS,
    AESA_CONFIG.STATUS.CLOSED_FAIL,
    AESA_CONFIG.STATUS.NOT_ELIGIBLE,
    AESA_CONFIG.STATUS.ERROR
  ];

  for (var i = 1; i < data.length; i++) {
    var row    = data[i];
    var status = row[cols.status];
    var caseId = row[cols.caseId];

    if (!caseId || SKIP_STATUSES.indexOf(status) >= 0) continue;

    try {
      var rowNum = i + 1;

      // ─── CHECK 1: Subsanación — plazo de 10 días hábiles ──────
      if (status === AESA_CONFIG.STATUS.SUBSANACION) {
        var subsDl = row[cols.subsanacionDeadline];
        if (subsDl && subsDl !== '') {
          var daysLeft = countBusinessDaysUntil_(new Date(subsDl));

          if (daysLeft <= 0) {
            logActionAESA_(ss, caseId, 'SUBSANACION_EXPIRED',
              'VENCIDA el ' + formatDateAESA_(new Date(subsDl)));
            sendInternalAlertAESA_(ss, caseId,
              '🚨 SUBSANACIÓN VENCIDA — PLAZO EXPIRADO\n' +
              'El plazo de 10 días hábiles para subsanar documentación ha VENCIDO.\n' +
              'Pasajero: ' + row[cols.passengerName] +
              '\nAerolínea: ' + row[cols.airlineName] +
              '\nDeadline era: ' + formatDateAESA_(new Date(subsDl)) +
              '\nRiesgo de DESISTIMIENTO automático por AESA. Contactar URGENTE.');

          } else if (daysLeft <= 3) {
            logActionAESA_(ss, caseId, 'SUBSANACION_DEADLINE_ALERT',
              daysLeft + ' días hábiles restantes');
            sendInternalAlertAESA_(ss, caseId,
              '⚠️ SUBSANACIÓN URGENTE — ' + daysLeft + ' DÍAS HÁBILES\n' +
              'Quedan ' + daysLeft + ' día(s) hábil(es) para aportar documentación.\n' +
              'Pasajero: ' + row[cols.passengerName] +
              '\nAerolínea: ' + row[cols.airlineName] +
              '\nDeadline: ' + formatDateAESA_(new Date(subsDl)) +
              '\nSi no se subsana a tiempo, AESA cierra el caso por desistimiento.');
          }
        }
      }

      // ─── CHECK 2: Compliance aerolínea — 1 mes desde decisión ─
      if (status === AESA_CONFIG.STATUS.COBRO_PENDING) {
        var compDl = row[cols.complianceDeadline];
        if (compDl && compDl !== '') {
          var compDate = new Date(compDl);
          compDate.setHours(0, 0, 0, 0);

          if (today > compDate && row[cols.airlineComplied] !== true) {
            // Aerolínea incumplió
            aesaSheet.getRange(rowNum, cols.status + 1)
              .setValue(AESA_CONFIG.STATUS.NON_COMPLIANCE);
            aesaSheet.getRange(rowNum, cols.statusUpdatedAt + 1).setValue(new Date());

            logActionAESA_(ss, caseId, 'INCUMPLIMIENTO',
              'Deadline vencido: ' + formatDateAESA_(compDate));
            sendIncumplimientoAlert_(ss, caseId, row, cols);
            notifyPassengerNonCompliance_(row, cols);

          } else if (today <= compDate) {
            var daysToComply = Math.ceil((compDate - today) / (1000 * 60 * 60 * 24));
            if (daysToComply <= 5) {
              logActionAESA_(ss, caseId, 'COMPLIANCE_DEADLINE_ALERT',
                daysToComply + ' días para vencimiento de cumplimiento');
              sendInternalAlertAESA_(ss, caseId,
                'Plazo de cumplimiento aerolínea vence en ' + daysToComply + ' día(s).\n' +
                'Aerolínea: ' + row[cols.airlineName] +
                ' | Pasajero: ' + row[cols.passengerName] +
                ' | Compensación: ' + row[cols.compensationEur] + '€\n' +
                'Si la aerolínea no paga, marcar airline_complied=FALSE en la hoja para activar incumplimiento.');
            }
          }
        }
      }

      // ─── CHECK 3: Dossier listo sin presentar (>7 días) ───────
      if (status === AESA_CONFIG.STATUS.DOSSIER_READY) {
        var submDate = row[cols.submissionDate];
        if (!submDate || submDate === '') {
          var createdAt = row[cols.createdAt];
          if (createdAt && createdAt !== '') {
            var daysSinceReady = Math.floor(
              (today - new Date(createdAt)) / (1000 * 60 * 60 * 24)
            );
            if (daysSinceReady >= AESA_CONFIG.DEADLINES.DOSSIER_READY_REMINDER_DAYS) {
              logActionAESA_(ss, caseId, 'REMINDER_PRESENTATION',
                'Dossier listo hace ' + daysSinceReady + ' días sin presentar');
              sendInternalAlertAESA_(ss, caseId,
                'RECORDATORIO: El dossier lleva ' + daysSinceReady + ' días listo SIN PRESENTAR.\n' +
                'Pasajero: ' + row[cols.passengerName] +
                ' | Aerolínea: ' + row[cols.airlineName] +
                ' | ' + row[cols.compensationEur] + '€\n' +
                'Presentar en: ' + AESA_CONFIG.AESA_SEDE_URL +
                '\nRecuerda rellenar columna AA (aesa_submission_date) una vez presentado.');
            }
          }
        }
      }

      // ─── CHECK 4: Presentada sin expediente >30 días ──────────
      if (status === AESA_CONFIG.STATUS.PRESENTED) {
        var sDate   = row[cols.submissionDate];
        var expNum  = row[cols.expedienteNum];
        if (sDate && sDate !== '' && (!expNum || expNum === '')) {
          var daysSincePresented = Math.floor(
            (today - new Date(sDate)) / (1000 * 60 * 60 * 24)
          );
          if (daysSincePresented >= AESA_CONFIG.DEADLINES.PRESENTED_NO_EXPEDIENTE_DAYS) {
            logActionAESA_(ss, caseId, 'REMINDER_EXPEDIENTE',
              'Sin número de expediente tras ' + daysSincePresented + ' días');
            sendInternalAlertAESA_(ss, caseId,
              'RECORDATORIO: Han pasado ' + daysSincePresented + ' días desde la presentación en AESA sin número de expediente.\n' +
              'Pasajero: ' + row[cols.passengerName] +
              '\nConsultar estado en "Mis Solicitudes" de la sede AESA y rellenar columna AB.');
          }
        }
      }

      Utilities.sleep(300);

    } catch (error) {
      logActionAESA_(ss, caseId, 'ERROR', 'processAESADeadlines: ' + error.toString());
    }
  }
}


// ═══════════════════════════════════════════════════════════════
// MÓDULO 4: VALIDACIÓN DE ELEGIBILIDAD
// ═══════════════════════════════════════════════════════════════

/**
 * Valida si un caso es elegible para el procedimiento RAL de AESA.
 * Retorna: { eligible, informativeOnly, checks, notes }
 */
function validateAESAEligibility_(caseData) {
  var checks = [];
  var failReasons = [];
  var informativeOnly = false;

  // CHECK 1 — Fecha de vuelo >= 02/06/2023
  var flightDate = null;
  try {
    var fd = caseData.flight_date;
    if (fd) {
      // Intentar parsear dd/MM/yyyy o yyyy-MM-dd
      if (String(fd).match(/^\d{2}\/\d{2}\/\d{4}$/)) {
        var parts = String(fd).split('/');
        flightDate = new Date(parts[2], parts[1] - 1, parts[0]);
      } else {
        flightDate = new Date(fd);
      }
    }
  } catch (e) { flightDate = null; }

  if (!flightDate || isNaN(flightDate.getTime())) {
    checks.push('✗ Fecha vuelo (no parseable: ' + caseData.flight_date + ')');
    failReasons.push('Fecha de vuelo no válida');
  } else if (flightDate < AESA_CONFIG.RAL_START_DATE) {
    checks.push('✗ Fecha vuelo ' + formatDateAESA_(flightDate) + ' < 02/06/2023 (vía informativa)');
    informativeOnly = true;
  } else {
    checks.push('✓ Fecha vuelo RAL (' + formatDateAESA_(flightDate) + ')');
  }

  // CHECK 2 — Jurisdicción AESA
  var origin = String(caseData.origin_iata || '').toUpperCase().trim();
  var dest   = String(caseData.destination_iata || '').toUpperCase().trim();
  var carrier = String(caseData.airline_iata || '').toUpperCase().trim();

  var departuresFromSpain = AESA_CONFIG.SPANISH_AIRPORTS.indexOf(origin) >= 0;
  var arrivesToSpainOnEU  = AESA_CONFIG.SPANISH_AIRPORTS.indexOf(dest) >= 0 &&
                             AESA_CONFIG.EU_CARRIERS.indexOf(carrier) >= 0;

  if (departuresFromSpain) {
    checks.push('✓ Jurisdicción AESA (sale de ' + origin + ')');
  } else if (arrivesToSpainOnEU) {
    checks.push('✓ Jurisdicción AESA (llega a ' + dest + ' en aerolínea UE ' + carrier + ')');
  } else {
    checks.push('✗ Jurisdicción fuera de AESA (' + origin + '→' + dest + ', aerolínea ' + carrier + ')');
    failReasons.push('Vuelo fuera de jurisdicción AESA (competente otro NEB)');
  }

  // CHECK 3 — Espera mínima de 30 días desde reclamación a aerolínea
  var claimDate = null;
  try {
    if (caseData.extrajudicial_claim_date) {
      claimDate = new Date(caseData.extrajudicial_claim_date);
    }
  } catch (e) { claimDate = null; }

  if (!claimDate || isNaN(claimDate.getTime())) {
    checks.push('✗ Fecha reclamación aerolínea (no disponible)');
    failReasons.push('Fecha de reclamación a aerolínea no disponible');
  } else {
    var today = new Date();
    var daysSinceClaim = Math.floor((today - claimDate) / (1000 * 60 * 60 * 24));
    if (daysSinceClaim < AESA_CONFIG.DEADLINES.MIN_WAIT_AFTER_AIRLINE_CLAIM) {
      checks.push('✗ Espera mínima (' + daysSinceClaim + '/' +
        AESA_CONFIG.DEADLINES.MIN_WAIT_AFTER_AIRLINE_CLAIM + ' días)');
      failReasons.push('No han transcurrido 30 días desde la reclamación a la aerolínea');
    } else {
      checks.push('✓ Espera mínima (' + daysSinceClaim + ' días desde reclamación)');
    }

    // CHECK 4 — Plazo máximo de 1 año
    if (daysSinceClaim >= AESA_CONFIG.DEADLINES.MAX_WAIT_AFTER_AIRLINE_CLAIM) {
      checks.push('✗ Plazo máximo excedido (' + daysSinceClaim + ' días — máx. 365)');
      failReasons.push('Superado el plazo de 1 año para presentar en AESA');
    } else {
      var daysLeft = AESA_CONFIG.DEADLINES.MAX_WAIT_AFTER_AIRLINE_CLAIM - daysSinceClaim;
      checks.push('✓ Plazo máximo OK (' + daysLeft + ' días restantes)');
    }
  }

  // CHECK 5 — Tipo de incidencia elegible
  var incidentType = String(caseData.incident_type || '').toUpperCase().trim();
  if (AESA_CONFIG.ELIGIBLE_INCIDENT_TYPES.indexOf(incidentType) >= 0) {
    checks.push('✓ Tipo incidencia RAL (' + incidentType + ')');
  } else {
    checks.push('✗ Tipo incidencia no elegible (' + incidentType + ' — equipaje/calidad excluidos)');
    failReasons.push('Tipo de incidencia "' + incidentType + '" no cubierto por RAL AESA');
  }

  var eligible = (failReasons.length === 0 && !informativeOnly);
  var notes = informativeOnly
    ? 'Vuelo anterior al RAL → vía informativa (no vinculante)'
    : (failReasons.length > 0 ? failReasons.join('; ') : 'Todos los checks OK');

  return {
    eligible:        eligible,
    informativeOnly: informativeOnly,
    checks:          checks,
    notes:           notes
  };
}


// ═══════════════════════════════════════════════════════════════
// MÓDULO 5: PREPARACIÓN DEL DOSSIER
// ═══════════════════════════════════════════════════════════════

/**
 * Verifica documentación y genera texto del dossier AESA.
 * Retorna: { ready, missingDocs, docStatus, formFields, dossierText }
 */
function buildAESADossier_(caseData) {
  var missingDocs = [];
  var docStatus   = {};

  // DOC 1 — Mandato de representación (Drive)
  var hasMandato = (caseData.mandate_drive_url && caseData.mandate_drive_url !== '');
  if (hasMandato) {
    try {
      var mandateId = extractDriveFileIdAESA_(caseData.mandate_drive_url);
      if (mandateId) {
        DriveApp.getFileById(mandateId);
        docStatus.mandato = { ok: true, url: caseData.mandate_drive_url };
      } else {
        docStatus.mandato = { ok: false, note: 'URL sin ID de Drive válido' };
        missingDocs.push('Mandato de representación (URL inválida)');
      }
    } catch (e) {
      docStatus.mandato = { ok: false, note: 'Archivo no accesible en Drive' };
      missingDocs.push('Mandato de representación (no accesible en Drive)');
    }
  } else {
    docStatus.mandato = { ok: false, note: 'URL vacía' };
    missingDocs.push('Mandato de representación (URL no disponible)');
  }

  // DOC 2 — Tarjeta de embarque (Drive)
  var hasBoardingPass = (caseData.boarding_pass_url && caseData.boarding_pass_url !== '');
  if (hasBoardingPass) {
    docStatus.boardingPass = { ok: true, url: caseData.boarding_pass_url };
  } else {
    docStatus.boardingPass = { ok: false, note: 'URL vacía' };
    missingDocs.push('Tarjeta de embarque (URL no disponible)');
  }

  // DOC 3 — DNI/Pasaporte del pasajero (datos)
  var hasDni = (caseData.passenger_dni && caseData.passenger_dni !== '');
  if (hasDni) {
    docStatus.dni = { ok: true, value: caseData.passenger_dni };
  } else {
    docStatus.dni = { ok: false, note: 'DNI/NIE no disponible' };
    missingDocs.push('DNI/NIE del pasajero');
  }

  // DOC 4 — Prueba de reclamación previa (email de Agent 4)
  var hasClaimProof = (caseData.extrajudicial_claim_date && caseData.extrajudicial_claim_date !== '');
  if (hasClaimProof) {
    docStatus.claimProof = {
      ok:   true,
      note: 'Email enviado por Agent 4 el ' + formatDateAESA_(new Date(caseData.extrajudicial_claim_date))
    };
  } else {
    docStatus.claimProof = { ok: false, note: 'Fecha de reclamación no disponible' };
    missingDocs.push('Prueba de reclamación a aerolínea (fecha no disponible)');
  }

  // DOC 5 — Respuesta aerolínea (o declaración de silencio)
  var responseType = String(caseData.airline_response_type || 'SILENCIO').toUpperCase();
  if (responseType === 'SILENCIO') {
    docStatus.airlineResponse = {
      ok:   true,
      note: 'Silencio administrativo — se declara no-respuesta en el formulario'
    };
  } else {
    docStatus.airlineResponse = {
      ok:   true,
      note: 'Respuesta aerolínea tipo: ' + responseType + ' (adjuntar en formulario)'
    };
  }

  // Campos pre-rellenados del formulario AESA
  var incidentLabel = {
    'RETRASO':      'Retraso en la llegada',
    'CANCELACION':  'Cancelación de vuelo',
    'OVERBOOKING':  'Denegación de embarque',
    'DOWNGRADE':    'Descenso de clase',
    'PMR':          'Incidencia PMR/PRM'
  };
  var incidentText = incidentLabel[String(caseData.incident_type).toUpperCase()] ||
                     caseData.incident_type;

  var hechos = buildHechosAESA_(caseData);

  var formFields = {
    reclamante_nombre:   caseData.passenger_name,
    reclamante_dni:      caseData.passenger_dni,
    reclamante_email:    caseData.passenger_email,
    reclamante_telefono: caseData.passenger_phone,
    representante:       'AeroReclaim Solutions (info@aeroreclaim.com) — representante profesional',
    aerolinea:           caseData.airline_name + ' (' + caseData.airline_iata + ')',
    vuelo:               caseData.flight_number,
    fecha_vuelo:         formatDateAESA_(new Date(caseData.flight_date)) || caseData.flight_date,
    origen:              caseData.origin_iata,
    destino:             caseData.destination_iata,
    tipo_incidencia:     incidentText,
    fecha_reclamacion:   caseData.extrajudicial_claim_date ?
                         formatDateAESA_(new Date(caseData.extrajudicial_claim_date)) : '',
    respuesta_aerolinea: responseType,
    compensacion_eur:    caseData.compensation_eur,
    hechos:              hechos
  };

  var dossierText = buildDossierText_(caseData, docStatus, formFields);

  return {
    ready:       missingDocs.length === 0,
    missingDocs: missingDocs,
    docStatus:   docStatus,
    formFields:  formFields,
    dossierText: dossierText
  };
}

/**
 * Genera descripción de hechos para el formulario AESA según tipo de incidencia
 */
function buildHechosAESA_(caseData) {
  var type   = String(caseData.incident_type || '').toUpperCase();
  var fn     = caseData.flight_number;
  var fd     = caseData.flight_date;
  var orig   = caseData.origin_iata;
  var dest   = caseData.destination_iata;
  var airl   = caseData.airline_name;
  var comp   = caseData.compensation_eur;
  var dist   = caseData.distance_km;

  if (type === 'RETRASO') {
    return 'El vuelo ' + fn + ' de ' + airl + ' con fecha ' + fd +
      ' (' + orig + '→' + dest + ') sufrió un retraso de ' +
      (caseData.delay_hours || '>3') + ' horas en la llegada al destino final. ' +
      'El pasajero tiene derecho a compensación de ' + comp +
      ' EUR conforme al Art. 7.1.a/b/c del Reglamento (CE) n.º 261/2004 ' +
      '(distancia ' + dist + ' km). La aerolínea no ha acreditado circunstancias ' +
      'extraordinarias según Art. 5.3. Se adjunta mandato de representación, ' +
      'tarjeta de embarque y prueba de reclamación previa.';
  } else if (type === 'CANCELACION') {
    return 'El vuelo ' + fn + ' de ' + airl + ' con fecha ' + fd +
      ' (' + orig + '→' + dest + ') fue CANCELADO por la aerolínea sin previo aviso ' +
      'con antelación mínima de 14 días y sin ofrecer transporte alternativo en condiciones ' +
      'equivalentes. El pasajero tiene derecho a compensación de ' + comp +
      ' EUR conforme al Art. 5 y 7.1 del Reglamento (CE) n.º 261/2004 ' +
      '(distancia ' + dist + ' km). La aerolínea no ha acreditado circunstancias ' +
      'extraordinarias según Art. 5.3. Se adjunta mandato de representación, ' +
      'tarjeta de embarque y prueba de reclamación previa.';
  } else if (type === 'OVERBOOKING') {
    return 'El pasajero se presentó puntualmente al embarque del vuelo ' + fn +
      ' de ' + airl + ' con fecha ' + fd + ' (' + orig + '→' + dest + ') ' +
      'con documentación en regla y reserva confirmada, siendo denegado el embarque ' +
      'por causas imputables a la aerolínea (sobreventa de plazas), en infracción ' +
      'del Art. 4 del Reglamento (CE) n.º 261/2004. Compensación reclamada: ' + comp +
      ' EUR (distancia ' + dist + ' km). Se adjunta mandato, tarjeta de embarque ' +
      'y prueba de reclamación previa.';
  }
  return 'Se produjo una incidencia tipo ' + type + ' en el vuelo ' + fn +
    ' de ' + airl + ' (' + fd + ', ' + orig + '→' + dest +
    '). Compensación reclamada: ' + comp + ' EUR.';
}

/**
 * Genera texto plano del dossier para almacenamiento en Sheet
 */
function buildDossierText_(caseData, docStatus, formFields) {
  var lines = [
    '══ DOSSIER AESA — Exp. ' + caseData.case_id + ' ══',
    'Generado: ' + formatDateAESA_(new Date()),
    '',
    '── PASAJERO ──',
    'Nombre: ' + formFields.reclamante_nombre,
    'DNI/NIE: ' + formFields.reclamante_dni,
    'Email: ' + formFields.reclamante_email,
    'Teléfono: ' + (formFields.reclamante_telefono || 'N/A'),
    '',
    '── VUELO ──',
    'Aerolínea: ' + formFields.aerolinea,
    'Vuelo: ' + formFields.vuelo + '  Fecha: ' + formFields.fecha_vuelo,
    'Ruta: ' + formFields.origen + ' → ' + formFields.destino,
    'Incidencia: ' + formFields.tipo_incidencia,
    'Compensación: ' + formFields.compensacion_eur + ' EUR',
    '',
    '── RECLAMACIÓN PREVIA ──',
    'Fecha envío a aerolínea: ' + formFields.fecha_reclamacion,
    'Respuesta aerolínea: ' + formFields.respuesta_aerolinea,
    '',
    '── DOCUMENTOS ──',
    'Mandato: ' + (docStatus.mandato.ok ? 'OK — ' + (docStatus.mandato.url || '') : 'FALTA'),
    'Tarjeta de embarque: ' + (docStatus.boardingPass.ok ? 'OK — ' + (docStatus.boardingPass.url || '') : 'FALTA'),
    'DNI pasajero: ' + (docStatus.dni.ok ? 'OK (' + docStatus.dni.value + ')' : 'FALTA'),
    'Prueba reclamación: ' + (docStatus.claimProof.ok ? 'OK' : 'FALTA'),
    'Respuesta aerolínea: ' + (docStatus.airlineResponse.ok ? 'OK' : 'FALTA')
  ];
  return lines.join('\n');
}


// ═══════════════════════════════════════════════════════════════
// MÓDULO 6: EMAIL INTERNO — DOSSIER LISTO
// ═══════════════════════════════════════════════════════════════

/**
 * Envía email HTML rico al operador con el dossier completo para presentar en AESA
 */
function sendDossierAlert_(caseData, eligibility, dossier) {
  var subject = '[AESA Agent 5] DOSSIER LISTO — Exp. ' + caseData.case_id +
    ' — ' + caseData.passenger_name + ' vs ' + caseData.airline_name +
    ' — ' + caseData.compensation_eur + '€';

  var ff = dossier.formFields;
  var ds = dossier.docStatus;

  // Build doc checklist rows
  var docRows = [
    { label: 'Mandato de representación', ok: ds.mandato.ok,
      note: ds.mandato.ok ? ('<a href="' + (ds.mandato.url || '#') + '" style="color:#2563eb;">Ver en Drive</a>') : ds.mandato.note },
    { label: 'Tarjeta de embarque', ok: ds.boardingPass.ok,
      note: ds.boardingPass.ok ? ('<a href="' + (ds.boardingPass.url || '#') + '" style="color:#2563eb;">Ver en Drive</a>') : ds.boardingPass.note },
    { label: 'DNI/NIE pasajero (' + (caseData.passenger_dni || '') + ')', ok: ds.dni.ok,
      note: ds.dni.ok ? 'Dato disponible (adjuntar escaneado)' : ds.dni.note },
    { label: 'Prueba reclamación aerolínea', ok: ds.claimProof.ok,
      note: ds.claimProof.ok ? ds.claimProof.note : ds.claimProof.note },
    { label: 'Respuesta aerolínea / silencio', ok: ds.airlineResponse.ok,
      note: ds.airlineResponse.note }
  ];

  var docHtml = '';
  for (var d = 0; d < docRows.length; d++) {
    var dr = docRows[d];
    docHtml += '<tr>' +
      '<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">' +
        (dr.ok ? '✅' : '❌') + ' ' + dr.label + '</td>' +
      '<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#475569;font-size:13px;">' +
        dr.note + '</td>' +
      '</tr>';
  }

  var checksHtml = '';
  for (var c = 0; c < eligibility.checks.length; c++) {
    var ck = eligibility.checks[c];
    var isPass = ck.charAt(0) === '✓';
    checksHtml += '<tr>' +
      '<td style="padding:7px 12px;border-bottom:1px solid #e2e8f0;color:' +
        (isPass ? '#16a34a' : '#dc2626') + ';font-size:13px;">' + ck + '</td>' +
      '</tr>';
  }

  var formHtml =
    '<tr><td style="color:#64748b;padding:5px 0;">Nombre pasajero</td>' +
    '<td style="color:#1e293b;font-weight:600;padding:5px 0;">' + ff.reclamante_nombre + '</td></tr>' +
    '<tr><td style="color:#64748b;padding:5px 0;">DNI/NIE</td>' +
    '<td style="color:#1e293b;font-weight:600;padding:5px 0;">' + ff.reclamante_dni + '</td></tr>' +
    '<tr><td style="color:#64748b;padding:5px 0;">Email pasajero</td>' +
    '<td style="color:#1e293b;font-weight:600;padding:5px 0;">' + ff.reclamante_email + '</td></tr>' +
    '<tr><td style="color:#64748b;padding:5px 0;">Teléfono</td>' +
    '<td style="color:#1e293b;font-weight:600;padding:5px 0;">' + (ff.reclamante_telefono || 'N/A') + '</td></tr>' +
    '<tr><td style="color:#64748b;padding:5px 0;">Representante</td>' +
    '<td style="color:#1e293b;font-weight:600;padding:5px 0;">' + ff.representante + '</td></tr>' +
    '<tr><td style="color:#64748b;padding:5px 0;">Aerolínea</td>' +
    '<td style="color:#1e293b;font-weight:600;padding:5px 0;">' + ff.aerolinea + '</td></tr>' +
    '<tr><td style="color:#64748b;padding:5px 0;">Número de vuelo</td>' +
    '<td style="color:#1e293b;font-weight:600;padding:5px 0;">' + ff.vuelo + '</td></tr>' +
    '<tr><td style="color:#64748b;padding:5px 0;">Fecha del vuelo</td>' +
    '<td style="color:#1e293b;font-weight:600;padding:5px 0;">' + ff.fecha_vuelo + '</td></tr>' +
    '<tr><td style="color:#64748b;padding:5px 0;">Aeropuerto origen</td>' +
    '<td style="color:#1e293b;font-weight:600;padding:5px 0;">' + ff.origen + '</td></tr>' +
    '<tr><td style="color:#64748b;padding:5px 0;">Aeropuerto destino</td>' +
    '<td style="color:#1e293b;font-weight:600;padding:5px 0;">' + ff.destino + '</td></tr>' +
    '<tr><td style="color:#64748b;padding:5px 0;">Tipo incidencia</td>' +
    '<td style="color:#1e293b;font-weight:600;padding:5px 0;">' + ff.tipo_incidencia + '</td></tr>' +
    '<tr><td style="color:#64748b;padding:5px 0;">Fecha reclamación aerolínea</td>' +
    '<td style="color:#1e293b;font-weight:600;padding:5px 0;">' + ff.fecha_reclamacion + '</td></tr>' +
    '<tr><td style="color:#64748b;padding:5px 0;">Respuesta aerolínea</td>' +
    '<td style="color:#1e293b;font-weight:600;padding:5px 0;">' + ff.respuesta_aerolinea + '</td></tr>' +
    '<tr><td style="color:#64748b;padding:5px 0;">Compensación reclamada</td>' +
    '<td style="color:#1e293b;font-weight:700;padding:5px 0;font-size:16px;">' + ff.compensacion_eur + ' €</td></tr>';

  var missingWarning = '';
  if (!dossier.ready) {
    missingWarning = '<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:14px 18px;margin:16px 0;">' +
      '<strong style="color:#dc2626;">⚠️ Documentos faltantes:</strong>' +
      '<ul style="margin:8px 0 0 0;padding-left:20px;color:#b91c1c;font-size:13px;">' +
      dossier.missingDocs.map(function(d) { return '<li>' + d + '</li>'; }).join('') +
      '</ul></div>';
  }

  var htmlBody =
    '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1.0"></head>' +
    '<body style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Arial,sans-serif;' +
    'background:#f4f6f9;margin:0;padding:20px;color:#333;">' +
    '<div style="max-width:680px;margin:0 auto;background:#fff;border-radius:12px;' +
    'overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">' +

    // Header
    '<div style="background:linear-gradient(135deg,#1a3c6e 0%,#2563eb 100%);padding:28px 36px;">' +
    '<h1 style="color:#fff;font-size:20px;margin:0 0 4px 0;">✈ AeroReclaim — Agent 5</h1>' +
    '<p style="color:#bfdbfe;font-size:12px;margin:0;">Agencia Estatal de Seguridad Aérea (AESA)</p>' +
    '<div style="display:inline-block;background:' + (dossier.ready ? '#10b981' : '#f59e0b') +
    ';color:#fff;font-size:11px;font-weight:700;padding:4px 14px;border-radius:20px;' +
    'text-transform:uppercase;letter-spacing:0.5px;margin-top:10px;">' +
    (dossier.ready ? '✓ DOSSIER LISTO PARA PRESENTAR' : '⚠ DOSSIER INCOMPLETO') +
    '</div></div>' +

    // Body
    '<div style="padding:32px 36px;">' +

    // Case summary
    '<h2 style="font-size:16px;color:#1e293b;margin:0 0 16px 0;">Resumen del Expediente</h2>' +
    '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;' +
    'padding:16px 20px;margin-bottom:24px;">' +
    '<table style="width:100%;border-collapse:collapse;">' +
    '<tr><td style="color:#64748b;padding:5px 0;width:45%;">Expediente</td>' +
    '<td style="color:#1e293b;font-weight:700;padding:5px 0;font-family:monospace;">' + caseData.case_id + '</td></tr>' +
    '<tr><td style="color:#64748b;padding:5px 0;">Pasajero</td>' +
    '<td style="color:#1e293b;font-weight:600;padding:5px 0;">' + caseData.passenger_name + '</td></tr>' +
    '<tr><td style="color:#64748b;padding:5px 0;">Vuelo</td>' +
    '<td style="color:#1e293b;font-weight:600;padding:5px 0;">' + caseData.flight_number +
    ' · ' + caseData.origin_iata + '→' + caseData.destination_iata + ' · ' + caseData.flight_date + '</td></tr>' +
    '<tr><td style="color:#64748b;padding:5px 0;">Aerolínea</td>' +
    '<td style="color:#1e293b;font-weight:600;padding:5px 0;">' + caseData.airline_name + '</td></tr>' +
    '<tr><td style="color:#64748b;padding:5px 0;">Incidencia</td>' +
    '<td style="color:#1e293b;font-weight:600;padding:5px 0;">' + caseData.incident_type + '</td></tr>' +
    '<tr><td style="color:#64748b;padding:5px 0;">Compensación</td>' +
    '<td style="color:#1e293b;font-weight:800;padding:5px 0;font-size:18px;">' + caseData.compensation_eur + ' €</td></tr>' +
    '<tr><td style="color:#64748b;padding:5px 0;">Recl. aerolínea</td>' +
    '<td style="color:#1e293b;padding:5px 0;">' + (ff.fecha_reclamacion || 'N/A') + '</td></tr>' +
    '<tr><td style="color:#64748b;padding:5px 0;">Resp. aerolínea</td>' +
    '<td style="color:#1e293b;padding:5px 0;">' + (caseData.airline_response_type || 'SILENCIO') + '</td></tr>' +
    '</table></div>' +

    // Eligibility checks
    '<h2 style="font-size:16px;color:#1e293b;margin:0 0 12px 0;">Verificación de Elegibilidad RAL</h2>' +
    '<table style="width:100%;border-collapse:collapse;margin-bottom:24px;' +
    'border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">' +
    checksHtml + '</table>' +

    // Missing docs warning
    missingWarning +

    // Document checklist
    '<h2 style="font-size:16px;color:#1e293b;margin:0 0 12px 0;">Documentos para Adjuntar</h2>' +
    '<table style="width:100%;border-collapse:collapse;margin-bottom:24px;' +
    'border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">' +
    docHtml + '</table>' +

    // Form fields
    '<h2 style="font-size:16px;color:#1e293b;margin:0 0 12px 0;">Datos Pre-Rellenados — Formulario AESA</h2>' +
    '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;' +
    'padding:16px 20px;margin-bottom:24px;">' +
    '<table style="width:100%;border-collapse:collapse;">' + formHtml + '</table></div>' +

    // Hechos
    '<h2 style="font-size:16px;color:#1e293b;margin:0 0 12px 0;">Texto de Hechos (copiar al formulario)</h2>' +
    '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;' +
    'padding:14px 18px;margin-bottom:24px;font-size:13px;color:#78350f;line-height:1.7;">' +
    ff.hechos + '</div>' +

    // Instructions
    '<h2 style="font-size:16px;color:#1e293b;margin:0 0 12px 0;">Instrucciones de Presentación</h2>' +
    '<div style="background:#eff6ff;border-left:4px solid #2563eb;border-radius:0 8px 8px 0;' +
    'padding:16px 20px;margin-bottom:16px;">' +
    '<ol style="margin:0;padding-left:20px;color:#1e40af;font-size:13px;line-height:1.9;">' +
    '<li>Ir a <a href="' + AESA_CONFIG.AESA_SEDE_URL + '" style="color:#2563eb;">' +
    AESA_CONFIG.AESA_SEDE_URL + '</a></li>' +
    '<li>Navegar: <strong>Derechos de pasajeros → RAL → Trámite online → ' +
    'Nueva Solicitud con identificación electrónica</strong></li>' +
    '<li>Autenticarse con <strong>certificado digital de empresa (FNMT)</strong></li>' +
    '<li>Rellenar el formulario con los datos de la sección anterior</li>' +
    '<li>Adjuntar los documentos listados en "Documentos para Adjuntar"</li>' +
    '<li>Firmar digitalmente y enviar</li>' +
    '<li><strong>Anotar el número de expediente AESA</strong> en columna AB de AESA_Queue</li>' +
    '<li><strong>Rellenar columna AA</strong> (aesa_submission_date) con la fecha de hoy</li>' +
    '</ol></div>' +

    '</div>' + // end body

    // Footer
    '<div style="background:#f8fafc;padding:20px 36px;text-align:center;' +
    'border-top:1px solid #e2e8f0;">' +
    '<p style="font-size:12px;color:#94a3b8;margin:3px 0;"><strong>AeroReclaim — Agent 5 (AESA)</strong></p>' +
    '<p style="font-size:12px;color:#94a3b8;margin:3px 0;">Expediente: ' + caseData.case_id +
    ' · Generado: ' + formatDateAESA_(new Date()) + '</p>' +
    '</div>' +
    '</div></body></html>';

  var plainText = 'DOSSIER AESA LISTO — Exp. ' + caseData.case_id + '\n\n' +
    dossier.dossierText + '\n\nAcceder a AESA sede: ' + AESA_CONFIG.AESA_SEDE_URL;

  GmailApp.sendEmail(
    AESA_CONFIG.AERORECLAIM_EMAIL + ',' + AESA_CONFIG.NOTIFICATION_EMAIL,
    subject,
    plainText,
    {
      name:      'AeroReclaim Agent 5 (AESA)',
      htmlBody:  htmlBody,
      replyTo:   AESA_CONFIG.AERORECLAIM_EMAIL
    }
  );
}


// ═══════════════════════════════════════════════════════════════
// MÓDULO 7: NOTIFICACIONES AL PASAJERO
// ═══════════════════════════════════════════════════════════════

/** Notificar que el caso ha sido presentado ante AESA */
function notifyPassengerPresented_(row, cols) {
  var to      = row[cols.passengerEmail];
  var name    = row[cols.passengerName];
  var caseId  = row[cols.caseId];
  var airline = row[cols.airlineName];
  var comp    = row[cols.compensationEur];
  var expNum  = row[cols.expedienteNum] || 'pendiente de asignación por AESA';

  if (!to || !name) return;

  GmailApp.sendEmail(to,
    'Tu caso ha sido presentado ante AESA — Exp. ' + caseId,
    'Hola ' + name + ',\n\n' +
    'Confirmamos que tu reclamación contra ' + airline + ' ha sido presentada ' +
    'oficialmente ante la AGENCIA ESTATAL DE SEGURIDAD AÉREA (AESA).\n\n' +
    'AESA tiene poder de resolución VINCULANTE para las aerolíneas (desde junio 2023).\n\n' +
    'Número expediente AESA: ' + expNum + '\n' +
    'Compensación reclamada: ' + comp + '€\n\n' +
    'Plazo estimado de resolución: 90-180 días (puede extenderse por volumen de reclamaciones).\n\n' +
    'Te informaremos de cada novedad. No necesitas hacer nada.\n\n' +
    'Ref.: ' + caseId + '\n\nAtentamente,\nAeroReclaim Solutions',
    { name: AESA_CONFIG.AERORECLAIM_NAME, replyTo: AESA_CONFIG.AERORECLAIM_EMAIL }
  );
}

/** Notificar decisión favorable de AESA */
function notifyPassengerFavorableDecision_(row, cols, complianceDeadline) {
  var to      = row[cols.passengerEmail];
  var name    = row[cols.passengerName];
  var caseId  = row[cols.caseId];
  var airline = row[cols.airlineName];
  var comp    = row[cols.compensationEur];
  var expNum  = row[cols.expedienteNum] || '';

  if (!to || !name) return;

  var dlStr = complianceDeadline ? formatDateAESA_(complianceDeadline) : '';

  GmailApp.sendEmail(to,
    '¡AESA ha resuelto a tu favor! — Exp. ' + caseId,
    'Hola ' + name + ',\n\n' +
    '¡Excelente noticia! La Agencia Estatal de Seguridad Aérea (AESA) ha emitido ' +
    'una RESOLUCIÓN FAVORABLE en tu caso contra ' + airline + '.\n\n' +
    'Compensación ordenada: ' + comp + '€\n' +
    'Expediente AESA: ' + expNum + '\n\n' +
    'La aerolínea tiene hasta el ' + dlStr + ' para hacer el pago.\n\n' +
    'Si la aerolínea no cumple, Ley 8/2025 permite sanciones hasta 250.000€ ' +
    'y podemos iniciar ejecución judicial directa usando la resolución AESA.\n\n' +
    'Nos pondremos en contacto contigo en cuanto confirmemos el cobro.\n\n' +
    'Ref.: ' + caseId + '\n\nAtentamente,\nAeroReclaim Solutions',
    { name: AESA_CONFIG.AERORECLAIM_NAME, replyTo: AESA_CONFIG.AERORECLAIM_EMAIL }
  );
}

/** Notificar decisión desfavorable de AESA */
function notifyPassengerUnfavorableDecision_(row, cols, decType) {
  var to      = row[cols.passengerEmail];
  var name    = row[cols.passengerName];
  var caseId  = row[cols.caseId];
  var airline = row[cols.airlineName];

  if (!to || !name) return;

  var isDesistimiento = (decType === 'DESISTIMIENTO');

  GmailApp.sendEmail(to,
    'Resolución AESA en tu caso — Exp. ' + caseId,
    'Hola ' + name + ',\n\n' +
    (isDesistimiento
      ? 'AESA ha cerrado tu expediente por desistimiento (documentación no aportada en plazo).\n\n' +
        'Lamentamos no haber podido continuar el proceso en esta fase.\n\n' +
        'Si deseas, podemos estudiar otras vías (judicial directa). Contáctanos.'
      : 'La Agencia Estatal de Seguridad Aérea (AESA) ha resuelto desfavorablemente ' +
        'tu reclamación contra ' + airline + '.\n\n' +
        'Esta resolución NO es vinculante para ti: puedes rechazarla y acudir a los ' +
        'tribunales (la resolución AESA sirve como prueba de la incidencia).\n\n' +
        'Ponte en contacto con nosotros si quieres valorar la vía judicial.') +
    '\n\nRef.: ' + caseId + '\n\nAtentamente,\nAeroReclaim Solutions',
    { name: AESA_CONFIG.AERORECLAIM_NAME, replyTo: AESA_CONFIG.AERORECLAIM_EMAIL }
  );
}

/** Notificar cobro confirmado */
function notifyPassengerPaymentConfirmed_(row, cols) {
  var to      = row[cols.passengerEmail];
  var name    = row[cols.passengerName];
  var caseId  = row[cols.caseId];
  var airline = row[cols.airlineName];
  var comp    = row[cols.compensationEur];

  if (!to || !name) return;

  GmailApp.sendEmail(to,
    '¡Tu compensación ha sido confirmada! — Exp. ' + caseId,
    'Hola ' + name + ',\n\n' +
    '¡Enhorabuena! ' + airline + ' ha cumplido con la resolución de AESA.\n\n' +
    'Compensación: ' + comp + '€\n\n' +
    'Gracias por confiar en AeroReclaim. Tu caso queda cerrado con éxito.\n\n' +
    'Ref.: ' + caseId + '\n\nAtentamente,\nAeroReclaim Solutions',
    { name: AESA_CONFIG.AERORECLAIM_NAME, replyTo: AESA_CONFIG.AERORECLAIM_EMAIL }
  );
}

/** Notificar incumplimiento de aerolínea */
function notifyPassengerNonCompliance_(row, cols) {
  var to      = row[cols.passengerEmail];
  var name    = row[cols.passengerName];
  var caseId  = row[cols.caseId];
  var airline = row[cols.airlineName];
  var comp    = row[cols.compensationEur];

  if (!to || !name) return;

  GmailApp.sendEmail(to,
    'La aerolínea no ha cumplido — próximos pasos — Exp. ' + caseId,
    'Hola ' + name + ',\n\n' +
    airline + ' no ha pagado los ' + comp + '€ en el plazo de 1 mes ' +
    'establecido por la resolución de AESA.\n\n' +
    'Opciones disponibles:\n' +
    '  1. Demanda ejecutiva: usamos la resolución AESA como título ejecutivo ' +
    'directamente en el juzgado (sin nuevo juicio sobre el fondo).\n' +
    '  2. Denuncia a AESA por incumplimiento: Ley 8/2025 prevé multas ' +
    'de hasta 250.000€ para la aerolínea.\n\n' +
    'Por favor responde a este email para coordinar el siguiente paso.\n\n' +
    'Ref.: ' + caseId + '\n\nAtentamente,\nAeroReclaim Solutions',
    { name: AESA_CONFIG.AERORECLAIM_NAME, replyTo: AESA_CONFIG.AERORECLAIM_EMAIL }
  );
}


// ═══════════════════════════════════════════════════════════════
// MÓDULO 8: ALERTAS INTERNAS ESPECIALIZADAS
// ═══════════════════════════════════════════════════════════════

function sendSubsanacionAlert_(ss, caseId, row, cols, deadline, daysLeft) {
  var msg = '🚨 SUBSANACIÓN AESA REQUERIDA — ' + daysLeft + ' DÍAS HÁBILES\n\n' +
    'Expediente: ' + caseId + '\n' +
    'Pasajero: ' + row[cols.passengerName] + '\n' +
    'Aerolínea: ' + row[cols.airlineName] + '\n' +
    'Exp. AESA: ' + (row[cols.expedienteNum] || 'pendiente') + '\n' +
    'Deadline subsanación: ' + formatDateAESA_(deadline) + '\n\n' +
    'AESA solicita documentación adicional. Plazo: ' + daysLeft + ' días hábiles.\n' +
    'Si no se responde a tiempo: DESISTIMIENTO automático (caso cerrado).\n\n' +
    'Acceder a "Mis Solicitudes" en: ' + AESA_CONFIG.AESA_SEDE_URL;
  sendInternalAlertAESA_(ss, caseId, msg);
}

function sendIncumplimientoAlert_(ss, caseId, row, cols) {
  var msg = '⚠️ INCUMPLIMIENTO AEROLINEA — RESOLUCIÓN AESA NO CUMPLIDA\n\n' +
    'Expediente: ' + caseId + '\n' +
    'Pasajero: ' + row[cols.passengerName] + '\n' +
    'Aerolínea: ' + row[cols.airlineName] + '\n' +
    'Compensación: ' + row[cols.compensationEur] + '€\n' +
    'Expediente AESA: ' + (row[cols.expedienteNum] || 'N/A') + '\n\n' +
    'ACCIONES RECOMENDADAS:\n' +
    '1. Obtener resolución AESA con CSV: ' + AESA_CONFIG.AESA_SEDE_URL + '/CID/\n' +
    '2. Preparar demanda ejecutiva (Art. 517.2.9 LEC)\n' +
    '3. Notificar incumplimiento a AESA (expediente sancionador — Ley 8/2025)\n' +
    '   Multa leve (1-3 meses): 4.500-70.000€\n' +
    '   Multa grave (>3 meses): hasta 250.000€\n\n' +
    'Mandato Drive: ' + (row[17] || 'N/A');  // col R (index 17) = mandate_drive_url
  sendInternalAlertAESA_(ss, caseId, msg);
}


// ═══════════════════════════════════════════════════════════════
// MÓDULO 9: HELPERS DE DATOS Y SHEET
// ═══════════════════════════════════════════════════════════════

/**
 * Extraer datos del caso desde una fila de Extrajudicial_Queue
 */
function extractAESACaseData_(row, headers) {
  var get = function(colName) {
    var idx = findColAESA_(headers, colName);
    return idx >= 0 ? (row[idx] !== undefined ? row[idx] : '') : '';
  };

  return {
    case_id:                  get('case_id'),
    passenger_name:           get('passenger_name'),
    passenger_email:          get('passenger_email'),
    passenger_dni:            get('passenger_dni'),
    passenger_phone:          get('passenger_phone'),
    airline_iata:             get('airline_iata'),
    airline_name:             get('airline_name'),
    flight_number:            get('flight_number'),
    flight_date:              get('flight_date'),
    origin_iata:              get('origin_iata'),
    destination_iata:         get('destination_iata'),
    incident_type:            get('incident_type'),
    delay_hours:              parseFloat(get('delay_hours')) || 0,
    distance_km:              parseInt(get('distance_km')) || 0,
    compensation_eur:         parseInt(get('compensation_eur') || get('compensation_amount')) || 0,
    booking_reference:        get('booking_reference'),
    mandate_drive_url:        get('mandate_drive_url'),
    boarding_pass_url:        get('boarding_pass_url'),
    extrajudicial_claim_date: get('claim_sent_date'),
    airline_response_type:    get('airline_response_type'),
    airline_response_notes:   get('airline_response_notes')
  };
}

/**
 * Crear fila de registro para AESA_Queue (37 columnas A–AK)
 */
function buildAESARecord_(caseData, eligibility, dossier, status) {
  var now = new Date();

  var eligibilityNotes = eligibility ? eligibility.checks.join(' | ') : '';
  var dossierReady     = dossier ? dossier.ready : false;
  var missingDocs      = dossier ? dossier.missingDocs.join(', ') : '';

  return [
    caseData.case_id,                       // A: case_id
    now,                                    // B: created_at
    caseData.passenger_name,               // C: passenger_name
    caseData.passenger_email,              // D: passenger_email
    caseData.passenger_dni,                // E: passenger_dni
    caseData.passenger_phone,              // F: passenger_phone
    caseData.airline_iata,                 // G: airline_iata
    caseData.airline_name,                 // H: airline_name
    caseData.flight_number,                // I: flight_number
    caseData.flight_date,                  // J: flight_date
    caseData.origin_iata,                  // K: origin_iata
    caseData.destination_iata,             // L: destination_iata
    caseData.incident_type,                // M: incident_type
    caseData.delay_hours,                  // N: delay_hours
    caseData.distance_km,                  // O: distance_km
    caseData.compensation_eur,             // P: compensation_eur
    caseData.booking_reference,            // Q: booking_reference
    caseData.mandate_drive_url,            // R: mandate_drive_url
    caseData.boarding_pass_url,            // S: boarding_pass_url
    caseData.extrajudicial_claim_date,     // T: extrajudicial_claim_date
    caseData.airline_response_type || 'SILENCIO', // U: airline_response_type
    caseData.airline_response_notes || '', // V: airline_response_notes
    eligibility ? eligibility.eligible : false, // W: aesa_eligible
    eligibilityNotes,                      // X: aesa_eligibility_notes
    dossierReady,                          // Y: aesa_dossier_ready
    missingDocs,                           // Z: aesa_dossier_missing_docs
    '',                                    // AA: aesa_submission_date (MANUAL)
    '',                                    // AB: aesa_expediente_num (MANUAL)
    '',                                    // AC: aesa_subsanacion_date (MANUAL)
    '',                                    // AD: aesa_subsanacion_deadline (calculado)
    '',                                    // AE: aesa_decision_date (MANUAL)
    '',                                    // AF: aesa_decision_type (MANUAL)
    '',                                    // AG: aesa_decision_notes (MANUAL)
    '',                                    // AH: airline_compliance_deadline (calculado)
    false,                                 // AI: airline_complied (MANUAL)
    status,                                // AJ: status
    now                                    // AK: status_updated_at
  ];
}

/**
 * Verificar si un caso ya existe en AESA_Queue (col A = case_id)
 */
function caseExistsInAESA_(sheet, caseId) {
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === caseId) return true;
  }
  return false;
}

/**
 * Verificar si el expediente ya fue logueado (evita duplicar log EXPEDIENTE_ASSIGNED)
 */
function checkExpedienteLogged_(ss, caseId) {
  try {
    var logSheet = ss.getSheetByName(AESA_CONFIG.SHEETS.LOG);
    if (!logSheet) return false;
    var data = logSheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][1] === caseId && data[i][2] === 'EXPEDIENTE_ASSIGNED') return true;
    }
  } catch (e) {}
  return false;
}

/**
 * Actualizar status de un caso en Extrajudicial_Queue
 */
function updateExtrajudicialStatusAESA_(ss, caseId, newStatus) {
  var exSheet = ss.getSheetByName(AESA_CONFIG.SHEETS.EXTRAJUDICIAL_QUEUE);
  if (!exSheet) return;
  var data    = exSheet.getDataRange().getValues();
  var headers = data[0];
  var colStatus = findColAESA_(headers, 'status');
  var colCaseId = findColAESA_(headers, 'case_id');
  if (colStatus < 0 || colCaseId < 0) return;
  for (var i = 1; i < data.length; i++) {
    if (data[i][colCaseId] === caseId) {
      exSheet.getRange(i + 1, colStatus + 1).setValue(newStatus);
      return;
    }
  }
}

/**
 * Extraer File ID de URL de Google Drive
 */
function extractDriveFileIdAESA_(driveUrl) {
  if (!driveUrl) return null;
  var match = String(driveUrl).match(/[-\w]{25,}/);
  return match ? match[0] : null;
}


// ═══════════════════════════════════════════════════════════════
// MÓDULO 10: UTILIDADES
// ═══════════════════════════════════════════════════════════════

/**
 * Buscar índice de columna por nombre (case-insensitive)
 */
function findColAESA_(headers, colName) {
  var target = String(colName).toLowerCase();
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).toLowerCase() === target) return i;
  }
  return -1;
}

/**
 * Registrar acción en Agent5_Log
 */
function logActionAESA_(ss, caseId, action, details) {
  try {
    var logSheet = ss.getSheetByName(AESA_CONFIG.SHEETS.LOG);
    if (!logSheet) return;
    logSheet.appendRow([
      new Date(),       // A: timestamp
      caseId,           // B: case_id
      action,           // C: action
      details,          // D: details
      'Agent5_Auto'     // E: user
    ]);
  } catch (e) {
    Logger.log('AESA log error: ' + e.toString());
  }
}

/**
 * Enviar alerta interna simple a info@aeroreclaim.com + ptusquets@gmail.com
 */
function sendInternalAlertAESA_(ss, caseId, message) {
  try {
    GmailApp.sendEmail(
      AESA_CONFIG.AERORECLAIM_EMAIL + ',' + AESA_CONFIG.NOTIFICATION_EMAIL,
      '[AeroReclaim Agent 5] Alerta — Exp. ' + caseId,
      'Expediente: ' + caseId + '\n\n' + message + '\n\n' +
      'Generado automáticamente por Agent 5 (AESA) — ' + new Date().toISOString(),
      { name: 'AeroReclaim Agent 5 (AESA)' }
    );
    if (ss) logActionAESA_(ss, caseId, 'ALERT_SENT', message.substring(0, 150));
  } catch (e) {
    Logger.log('Error enviando alerta AESA: ' + e.toString());
  }
}

/**
 * Añadir N días hábiles a una fecha (excluye sábados y domingos — MVP sin festivos)
 */
function addBusinessDays_(startDate, days) {
  var d = new Date(startDate);
  var added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    var dow = d.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d;
}

/**
 * Contar días hábiles hasta una fecha futura (0 si ya pasó)
 */
function countBusinessDaysUntil_(targetDate) {
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var target = new Date(targetDate);
  target.setHours(0, 0, 0, 0);
  if (target <= today) return 0;
  var count = 0;
  var d = new Date(today);
  while (d < target) {
    d.setDate(d.getDate() + 1);
    var dow = d.getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

/**
 * Formatear fecha en dd/MM/yyyy (timezone Europe/Madrid)
 */
function formatDateAESA_(date) {
  if (!date || isNaN(date.getTime())) return '';
  try {
    return Utilities.formatDate(date, 'Europe/Madrid', 'dd/MM/yyyy');
  } catch (e) {
    return date.toLocaleDateString('es-ES');
  }
}


// ═══════════════════════════════════════════════════════════════
// MÓDULO 11: TRIGGERS
// ═══════════════════════════════════════════════════════════════

/**
 * Instalar los 3 triggers de Agent 5 (AESA).
 * IMPORTANTE: Solo elimina triggers propios de Agent 5.
 * NO borra triggers de Agent 4 ni de ningún otro agente.
 * Ejecutar UNA VEZ manualmente desde Apps Script.
 */
function installAESATriggers() {
  // Borrar SOLO triggers de funciones de Agent 5
  var agent5Functions = [
    'processNewAESACases',
    'processAESAUpdates',
    'processAESADeadlines'
  ];

  var allTriggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < allTriggers.length; i++) {
    var funcName = allTriggers[i].getHandlerFunction();
    if (agent5Functions.indexOf(funcName) >= 0) {
      ScriptApp.deleteTrigger(allTriggers[i]);
      Logger.log('Trigger Agent 5 eliminado: ' + funcName);
    }
  }

  // TRIGGER 1: Nuevos casos — cada 5 minutos
  ScriptApp.newTrigger('processNewAESACases')
    .timeBased()
    .everyMinutes(5)
    .create();

  // TRIGGER 2: Actualizaciones manuales — cada 15 minutos
  ScriptApp.newTrigger('processAESAUpdates')
    .timeBased()
    .everyMinutes(15)
    .create();

  // TRIGGER 3: Plazos — diario a las 10:00 hora Madrid
  ScriptApp.newTrigger('processAESADeadlines')
    .timeBased()
    .everyDays(1)
    .atHour(10)
    .inTimezone('Europe/Madrid')
    .create();

  Logger.log('✓ 3 triggers de Agent 5 (AESA) instalados correctamente');

  // Verificar estado total de triggers del proyecto
  var updatedTriggers = ScriptApp.getProjectTriggers();
  Logger.log('Total triggers en el proyecto: ' + updatedTriggers.length);
  for (var j = 0; j < updatedTriggers.length; j++) {
    Logger.log('  - ' + updatedTriggers[j].getHandlerFunction());
  }
}


// ═══════════════════════════════════════════════════════════════
// MÓDULO 12: FUNCIONES DE TEST
// ═══════════════════════════════════════════════════════════════

/**
 * Test: Verificar que las pestañas existen y son accesibles
 */
function testAESAConfig() {
  var ss = SpreadsheetApp.openById(AESA_CONFIG.SPREADSHEET_ID);

  Logger.log('═══ TEST AGENT 5 — CONFIGURACIÓN ═══');

  var tabs = [
    AESA_CONFIG.SHEETS.EXTRAJUDICIAL_QUEUE,
    AESA_CONFIG.SHEETS.AESA_QUEUE,
    AESA_CONFIG.SHEETS.LOG
  ];

  for (var t = 0; t < tabs.length; t++) {
    var sheet = ss.getSheetByName(tabs[t]);
    Logger.log(tabs[t] + ': ' +
      (sheet ? '✓ encontrada (' + sheet.getLastRow() + ' filas)' : '✗ NO ENCONTRADA'));
    if (sheet && sheet.getLastRow() > 0) {
      var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      Logger.log('  Headers: ' + headers.slice(0, 10).join(' | ') + '...');
    }
  }

  // Verificar casos ESCALADA_AESA / RECHAZADA en Extrajudicial_Queue
  var exSheet = ss.getSheetByName(AESA_CONFIG.SHEETS.EXTRAJUDICIAL_QUEUE);
  if (exSheet && exSheet.getLastRow() > 1) {
    var data = exSheet.getDataRange().getValues();
    var headers = data[0];
    var statusCol = findColAESA_(headers, 'status');
    var count = 0;
    for (var i = 1; i < data.length; i++) {
      var s = data[i][statusCol];
      if (s === AESA_CONFIG.STATUS.EX_ESCALATED_AESA || s === AESA_CONFIG.STATUS.EX_REJECTED) {
        count++;
      }
    }
    Logger.log('Casos pendientes para Agent 5: ' + count);
  }

  Logger.log('\n✓ Test de configuración Agent 5 completado');
}

/**
 * Test: Verificar lógica de elegibilidad con datos de prueba
 */
function testAESAEligibility() {
  Logger.log('═══ TEST AGENT 5 — ELEGIBILIDAD ═══\n');

  var testCases = [
    {
      label: 'CASO OK — Vuelo BCN→MAD, Vueling, retraso, 35 días',
      data: {
        case_id: 'AR-TEST-001',
        flight_date: '15/10/2024',
        origin_iata: 'BCN',
        destination_iata: 'MAD',
        airline_iata: 'VY',
        airline_name: 'Vueling',
        incident_type: 'RETRASO',
        delay_hours: 4,
        distance_km: 620,
        compensation_eur: 250,
        extrajudicial_claim_date: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000)
      }
    },
    {
      label: 'NO ELEGIBLE — Vuelo pre-RAL (2023-01-10)',
      data: {
        case_id: 'AR-TEST-002',
        flight_date: '10/01/2023',
        origin_iata: 'MAD',
        destination_iata: 'BCN',
        airline_iata: 'IB',
        airline_name: 'Iberia',
        incident_type: 'CANCELACION',
        delay_hours: 0,
        distance_km: 620,
        compensation_eur: 250,
        extrajudicial_claim_date: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000)
      }
    },
    {
      label: 'NO ELEGIBLE — Equipaje',
      data: {
        case_id: 'AR-TEST-003',
        flight_date: '20/08/2024',
        origin_iata: 'AGP',
        destination_iata: 'LHR',
        airline_iata: 'VY',
        airline_name: 'Vueling',
        incident_type: 'EQUIPAJE',
        delay_hours: 0,
        distance_km: 1830,
        compensation_eur: 400,
        extrajudicial_claim_date: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000)
      }
    },
    {
      label: 'NO ELEGIBLE — Espera insuficiente (20 días)',
      data: {
        case_id: 'AR-TEST-004',
        flight_date: '01/01/2025',
        origin_iata: 'MAD',
        destination_iata: 'BCN',
        airline_iata: 'FR',
        airline_name: 'Ryanair',
        incident_type: 'CANCELACION',
        delay_hours: 0,
        distance_km: 620,
        compensation_eur: 250,
        extrajudicial_claim_date: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000)
      }
    }
  ];

  for (var t = 0; t < testCases.length; t++) {
    var tc = testCases[t];
    var result = validateAESAEligibility_(tc.data);
    Logger.log('─── ' + tc.label);
    Logger.log('  Eligible: ' + result.eligible + ' | InformativeOnly: ' + result.informativeOnly);
    Logger.log('  Checks:');
    for (var c = 0; c < result.checks.length; c++) {
      Logger.log('    ' + result.checks[c]);
    }
    Logger.log('  Notes: ' + result.notes);
    Logger.log('');
  }

  // Test de días hábiles
  var startDate = new Date('2026-03-06');
  var deadline  = addBusinessDays_(startDate, 10);
  Logger.log('Test addBusinessDays_: 06/03/2026 + 10 días hábiles = ' + formatDateAESA_(deadline));
  Logger.log('Test countBusinessDaysUntil_: días hábiles hasta ' + formatDateAESA_(deadline) +
    ': ' + countBusinessDaysUntil_(deadline));

  Logger.log('\n✓ Test de elegibilidad Agent 5 completado');
}

/**
 * Test: Simular caso completo y enviar email de dossier a info@aeroreclaim.com
 */
function testAESADossierEmail() {
  var testCase = {
    case_id:                  'AR-TEST-AESA-001',
    passenger_name:           'María García López',
    passenger_email:          'info@aeroreclaim.com',
    passenger_dni:            '12345678A',
    passenger_phone:          '+34 600 000 000',
    airline_iata:             'VY',
    airline_name:             'Vueling Airlines',
    flight_number:            'VY7821',
    flight_date:              '15/10/2024',
    origin_iata:              'BCN',
    destination_iata:         'MAD',
    incident_type:            'RETRASO',
    delay_hours:              4.5,
    distance_km:              620,
    compensation_eur:         250,
    booking_reference:        'ABC123',
    mandate_drive_url:        '',  // vacío para test
    boarding_pass_url:        '',  // vacío para test
    extrajudicial_claim_date: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000),
    airline_response_type:    'SILENCIO',
    airline_response_notes:   ''
  };

  var eligibility = validateAESAEligibility_(testCase);
  Logger.log('Eligibility: ' + JSON.stringify({ eligible: eligibility.eligible, notes: eligibility.notes }));

  var dossier = buildAESADossier_(testCase);
  Logger.log('Dossier ready: ' + dossier.ready);
  Logger.log('Missing docs: ' + dossier.missingDocs.join(', '));

  // Enviar email de prueba
  sendDossierAlert_(testCase, eligibility, dossier);
  Logger.log('✓ Email de dossier enviado a ' + AESA_CONFIG.AERORECLAIM_EMAIL);
  Logger.log('Revisar buzón para verificar formato del email.');
}
