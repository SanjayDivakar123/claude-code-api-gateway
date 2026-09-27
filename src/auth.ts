import type { NextFunction, Request, Response } from "express";
import { config } from "./config.js";
import { sendError } from "./errors.js";

export const requireGatewayAuth = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!config.gatewayApiKey) {
    sendError(res, 500, "Gateway is missing GATEWAY_API_KEY");
    return;
  }

  const header = req.header("authorization");
  const expected = `Bearer ${config.gatewayApiKey}`;

  if (header !== expected) {
    sendError(res, 401, "Unauthorized");
    return;
  }

  next();
};
