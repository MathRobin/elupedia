/**
 * Logger unique du package (winston, sortie console, niveau info).
 *
 * Format volontairement minimal — `HH:mm:ss [level] message` — lu dans les
 * logs Dagu. Plusieurs messages sont testés par sous-chaîne (ex. « retrying
 * in Nms » dans utils/retry.ts) : ne pas changer le format sans vérifier.
 * Les tests le remplacent par vi.mock('./logger.js').
 */
import { createLogger, format, transports } from 'winston';

export const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp({ format: 'HH:mm:ss' }),
    format.printf(
      ({ timestamp, level, message }) => `${timestamp} [${level}] ${message}`,
    ),
  ),
  transports: [new transports.Console()],
});
