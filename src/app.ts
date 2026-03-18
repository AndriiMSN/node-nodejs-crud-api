import Fastify, { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

export function buildApp() {
  const app = Fastify({ logger: false });

  // app.register

  app.setNotFoundHandler((_request: FastifyRequest, reply: FastifyReply) => {
    reply.status(404).send({ message: 'Route not found' });
  });

  app.setErrorHandler((error: FastifyError, _request: FastifyRequest, reply: FastifyReply) => {
    const statusCode = error.statusCode ?? 500;
    const message = statusCode === 500 ? 'Internal server error' : error.message;
    reply.status(statusCode).send({ message });
  });

  return app;
}
