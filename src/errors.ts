import type { Response } from "express";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
  }
}

export const sendError = (
  res: Response,
  status: number,
  message: string,
  details?: unknown
) => {
  res.status(status).json({
    error: {
      message,
      details
    }
  });
};
