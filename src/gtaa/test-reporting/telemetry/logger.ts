/**
 * Thin logging wrapper (pino) for the reporting layer. Kept minimal and
 * dependency-light so tool adapters can log without coupling to a transport.
 */
import pino from 'pino';
import { str } from '../../configuration/environments/env';

export const logger = pino({
  level: str('LOG_LEVEL', 'info'),
  base: undefined,
});

export function childLogger(tool: string) {
  return logger.child({ tool });
}
