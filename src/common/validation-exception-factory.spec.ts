import type { ValidationError } from 'class-validator';
import { validationExceptionFactory } from './validation-exception-factory';
import { AppBadRequestException } from './exceptions';
import { ErrorCode } from './exceptions/error-codes';

function makeError(
  property: string,
  constraints: Record<string, string>,
  children: ValidationError[] = [],
): ValidationError {
  return { property, constraints, children, target: {}, value: undefined };
}

describe('validationExceptionFactory', () => {
  it('returns an AppBadRequestException with the translated generic code', () => {
    const result = validationExceptionFactory([
      makeError('fuelLitersRefilled', {
        isNumber:
          'fuelLitersRefilled must be a number conforming to the specified constraints',
      }),
    ]);

    expect(result).toBeInstanceOf(AppBadRequestException);
    expect(result.getResponse()).toEqual(
      expect.objectContaining({
        code: ErrorCode.VALIDATION_BAD_REQUEST_GENERIC,
      }),
    );
  });

  it('joins constraint messages from multiple fields into the message', () => {
    const result = validationExceptionFactory([
      makeError('startOperatingHours', {
        min: 'startOperatingHours must not be less than 0',
      }),
      makeError('fuelLitersRefilled', {
        isNumber:
          'fuelLitersRefilled must be a number conforming to the specified constraints',
      }),
    ]);

    const body = result.getResponse() as { message: string };
    expect(body.message).toContain(
      'startOperatingHours must not be less than 0',
    );
    expect(body.message).toContain(
      'fuelLitersRefilled must be a number conforming to the specified constraints',
    );
  });

  it('flattens nested (child) validation errors instead of dropping them', () => {
    const result = validationExceptionFactory([
      makeError('nested', {}, [
        makeError('innerField', { isString: 'innerField must be a string' }),
      ]),
    ]);

    const body = result.getResponse() as { message: string };
    expect(body.message).toBe('innerField must be a string');
  });

  it('falls back to a generic message when there are no constraint texts at all', () => {
    const result = validationExceptionFactory([]);

    const body = result.getResponse() as { message: string };
    expect(body.message).toBe('Validation failed');
  });
});
