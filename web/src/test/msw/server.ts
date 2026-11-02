import { setupServer } from "msw/node";

/** Shared MSW server. Tests add handlers with server.use(...); none are global. */
export const server = setupServer();
