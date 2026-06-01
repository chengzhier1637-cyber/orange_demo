import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleApiRequest } from '../server/api.ts';

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  await handleApiRequest(request, response, request.url ?? '');
}
