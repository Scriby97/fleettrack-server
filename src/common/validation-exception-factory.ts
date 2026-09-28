import type { ValidationError } from 'class-validator';
import { AppBadRequestException, ErrorCode } from './exceptions';

/**
 * class-validator liefert bei verschachtelten DTOs verschachtelte Fehler
 * (children) statt direkt constraints - flach machen, damit kein Feld
 * stillschweigend aus der Fehlermeldung verschwindet.
 */
function flattenValidationErrors(errors: ValidationError[]): ValidationError[] {
  return errors.flatMap((error) =>
    error.children?.length ? flattenValidationErrors(error.children) : [error],
  );
}

/**
 * Wandelt class-validator-Fehler in eine AppBadRequestException statt der
 * NestJS-Standard-BadRequestException um (siehe main.ts, ValidationPipe).
 * Ohne das liefert ValidationPipe {statusCode, message: string[], error} -
 * rein englische Constraint-Texte, ohne `code`. Das Frontend zeigt ohne
 * `code` den rohen (englischen) Fallback-Text an, egal welche UI-Sprache
 * eingestellt ist (siehe fleettrack-app/lib/i18n/useApiErrorMessage.ts). Die
 * Constraint-Details bleiben als `message` erhalten (fuer API-Debugging),
 * das UI zeigt aber dank des schon uebersetzten
 * VALIDATION_BAD_REQUEST_GENERIC-Codes die generische Meldung in der
 * aktuellen Sprache statt der englischen Rohtexte.
 */
export function validationExceptionFactory(
  errors: ValidationError[],
): AppBadRequestException {
  const details = flattenValidationErrors(errors)
    .flatMap((error) => Object.values(error.constraints ?? {}))
    .join('; ');
  return new AppBadRequestException(
    ErrorCode.VALIDATION_BAD_REQUEST_GENERIC,
    details || 'Validation failed',
  );
}
