import { ExecutionContext, UnsupportedMediaTypeException } from '@nestjs/common';
import { JsonBodyGuard } from './json-body.guard';

describe('JsonBodyGuard', () => {
  const guard = new JsonBodyGuard();

  function contextFor(result: string | boolean | null | undefined) {
    const is = jest.fn().mockReturnValue(result);
    const context = {
      switchToHttp: () => ({ getRequest: () => ({ is }) }),
    } as unknown as ExecutionContext;
    return { context, is };
  }

  it.each([true, 'application/json'])(
    'accepts an application/json request',
    (result) => {
      const { context, is } = contextFor(result);
      expect(guard.canActivate(context)).toBe(true);
      expect(is).toHaveBeenCalledWith('application/json');
    },
  );

  it.each([false, null, undefined])(
    'rejects a non-JSON or missing content type with HTTP 415',
    (result) => {
      const { context, is } = contextFor(result);
      expect(() => guard.canActivate(context)).toThrow(UnsupportedMediaTypeException);
      try {
        guard.canActivate(context);
      } catch (error) {
        expect((error as UnsupportedMediaTypeException).getStatus()).toBe(415);
      }
      expect(is).toHaveBeenCalledWith('application/json');
    },
  );
});
