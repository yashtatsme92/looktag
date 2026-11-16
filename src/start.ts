import { createStart } from "@tanstack/react-start";
import { serverFnErrorMiddleware } from "@/lib/errors/server-fn-errors";

/** Global server-function middleware. Error masking runs outermost. */
export const startInstance = createStart(() => ({
  functionMiddleware: [serverFnErrorMiddleware],
}));
