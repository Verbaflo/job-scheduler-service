import { AppError } from '../app_error';

class HttpError extends AppError {
  constructor(status: number, message: string) {
    super({
      message,
      status: status,
      code: 'HTTP_ERROR',
    });
  }
}

export { HttpError };
