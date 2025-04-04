import { Hono } from 'hono';
import { swaggerUI } from '@hono/swagger-ui';
import { Base64 } from 'js-base64';
import allPresetViews from './models/views';

type Bindings = {
    IMG_BUCKET: R2Bucket;
    IMG_KV: KVNamespace;
    CF_VERSION_METADATA: WorkerVersionMetadata;
    CF_CACHE_TTL: number;
    S3_CDN_URL: string;
    S3_CDN_DIR: string;
    S3_CACHE_DIR: string;
};

const isGuidInARetardedWay = (guid: string) => guid.replaceAll('-', '').length === 32 && guid.split('-').length !== 2;
const addHyphensToGuid = (guid: string) => guid.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');

const app = new Hono<{ Bindings: Bindings }>();

app.get('/Img/:viewId/:imageFile{.+\\.*}', async (c) => {
    const cache = caches.default;
    const CF_CACHE_TTL = c.env.CF_CACHE_TTL;

    let viewId = c.req.param('viewId').toLowerCase();

    let responseViewOptions: any = {};

    if (isGuidInARetardedWay(viewId)) {
        if (viewId.indexOf('-') === -1) viewId = addHyphensToGuid(viewId);
        const responseView = allPresetViews.find((view) => view.id == viewId);

        if (!responseView) return new Response(`ViewId ${viewId} not found`, { status: 404 });
        responseViewOptions = responseView?.options || {};
    } else {
        console.log(`View is not valid Guid, going for exact size: (${viewId})`);

        const exactDimensionRegex = /^(?<width>[0-9]*)-(?<height>[0-9]*)$/g;
        let match = exactDimensionRegex.exec(viewId);

        if (!match || !match.groups) {
            return new Response(`ViewId / exact size is not valid ${viewId}`, { status: 400 });
        }

        if (match.groups.width != '0') {
            responseViewOptions.width = +match.groups.width;
        }

        if (match.groups.height != '0') {
            responseViewOptions.height = +match.groups.height;
        }

        responseViewOptions.fit = 'cover';
        responseViewOptions.gravity = { x: 0.5, y: 0.5 };
    }

    const imageFile = c.req.param('imageFile').toLowerCase() || '';
    const density = c.req.query('density') || 1;

    responseViewOptions.dpr = density;

    let options = Object.entries(responseViewOptions)
        .map(([key, val]) => `${key}=${val}`)
        .join(',');

    // Fix for the gravity nested object
    if (options.indexOf('gravity=[object Object]') > -1) {
        const gravity = Object.entries(responseViewOptions.gravity)
            .map(([key, val]) => `${val}`)
            .join('x');
        options = options.replace('gravity=[object Object]', `gravity=${gravity}`);
    }

    const cacheKeyItems: string[] = [Base64.encode(options, true), imageFile];

    const cacheKey = cacheKeyItems.join('.');

    const s3CacheDir = c.env.S3_CACHE_DIR;
    const s3CacheKey = `${s3CacheDir}${cacheKeyItems[0].substring(cacheKeyItems[0].length - 2)}/${cacheKeyItems.join('/')}`;

    // Check whether the value is already available in the cache
    // if not, fetch it from R2, and store it in the cache
    let response = await cache.match(c.req.url);
    if (response) {
        console.log(`Cache HIT for: ${cacheKey}.`);
        console.log(`Current options: ${options}`);
        return response;
    }

    console.log(`Cache MISS for: ${cacheKey}.`);

    console.log(`Current options: ${options}`);

    let imageId = imageFile.split('.')[0].toLowerCase();
    let extension = imageFile.split('.')[1].toLowerCase();
    if (!isGuidInARetardedWay(imageId)) return new Response(`ImageId ${imageId} is not valid Guid`, { status: 400 });
    if (imageId.indexOf('-') === -1) imageId = addHyphensToGuid(imageId);

    const leadingFolder = imageId.substring(0, 2);
    const trailingFolder = imageId.substring(imageId.length - 2);

    const s3Url = c.env.S3_CDN_URL;
    const s3Dir = c.env.S3_CDN_DIR;

    const imgUrl = new URL(`https://${s3Url}${s3Dir}${leadingFolder}/${trailingFolder}/${imageId}.${extension}`);

    const resized = await fetch(imgUrl, {
        cf: { image: responseViewOptions },
    });

    // Ensure the body is read properly using arrayBuffer
    const resizedBody = await resized.arrayBuffer();
    if (!resizedBody) {
        return new Response('Failed to fetch or process the image.', { status: 500 });
    }

    response = new Response(resizedBody, {
        status: resized.status,
        statusText: resized.statusText,
        headers: resized.headers,
    });
    response.headers.set('Version', c.env.CF_VERSION_METADATA.id);
    response.headers.set('Resize-Options', options);
    response.headers.set('Cache-Control', `max-age=${CF_CACHE_TTL}`);

    await cache.put(c.req.url, response.clone());
    //await c.env.IMG_KV.put(cacheKey, JSON.stringify(resized.headers))
    //await c.env.IMG_BUCKET.put(s3CacheKey, response.clone().body)
    return response;
});

app.get('/swagger', swaggerUI({ url: '/doc/swagger.json' }));

export default app;
