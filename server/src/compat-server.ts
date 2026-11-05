import type { NextFunction, Request, Response } from "express";
import { handleDemoApi } from "./api";

export async function compatibilityApi(
  request: Request,
  response: Response,
  next: NextFunction,
) {
  try {
    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
      if (Array.isArray(value)) headers.set(key, value.join(", "));
      else if (value !== undefined) headers.set(key, value);
    }

    const rawBody = (request as Request & { rawBody?: Buffer }).rawBody;
    const body =
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : (rawBody?.toString("utf8") ?? JSON.stringify(request.body ?? {}));
    const apiPath = `${request.baseUrl}${request.url}`;
    const apiRequest = new Request(
      `${request.protocol}://${request.get("host")}${apiPath}`,
      {
        method: request.method,
        headers,
        body,
      },
    );
    const apiResponse = await handleDemoApi(apiRequest);
    if (!apiResponse) return next();

    response.status(apiResponse.status);
    apiResponse.headers.forEach((value, key) => response.setHeader(key, value));
    const contentType = apiResponse.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return response.send(await apiResponse.json());
    }
    return response.send(Buffer.from(await apiResponse.arrayBuffer()));
  } catch (error) {
    return next(error);
  }
}
