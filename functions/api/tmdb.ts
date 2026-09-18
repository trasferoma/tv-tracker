import { resolveTmdbTargetPath, TMDB_API_ORIGIN } from '../../src/catalog/tmdbRequest';

interface PagesFunctionContext {
    readonly request: Request;
    readonly env: Readonly<Record<string, string | undefined>>;
}

const INVALID_REQUEST_MESSAGE = 'Richiesta al proxy TMDB non valida.';
const MISSING_TOKEN_MESSAGE = 'Token TMDB non configurato lato server.';

export async function onRequestGet(context: PagesFunctionContext): Promise<Response> {
    const incomingUrl = new URL(context.request.url);
    const targetPath = resolveTmdbTargetPath(incomingUrl.searchParams);
    if (targetPath === undefined) {
        return jsonErrorResponse(400, INVALID_REQUEST_MESSAGE);
    }
    const tmdbReadAccessToken = context.env.TMDB_READ_ACCESS_TOKEN;
    if (tmdbReadAccessToken === undefined) {
        return jsonErrorResponse(500, MISSING_TOKEN_MESSAGE);
    }
    const tmdbResponse = await fetch(`${TMDB_API_ORIGIN}${targetPath}`, {
        headers: { Authorization: `Bearer ${tmdbReadAccessToken}` }
    });
    const contentType = tmdbResponse.headers.get('content-type') ?? 'application/json';
    return new Response(tmdbResponse.body, {
        status: tmdbResponse.status,
        headers: { 'content-type': contentType }
    });
}

function jsonErrorResponse(status: number, message: string): Response {
    const body = JSON.stringify({ error: message });
    return new Response(body, {
        status,
        headers: { 'content-type': 'application/json' }
    });
}
