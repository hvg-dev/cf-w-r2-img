import { Hono } from 'hono'
import { swaggerUI } from '@hono/swagger-ui'
import { Guid } from 'guid-ts';
import { Base64 } from 'js-base64'
import VIEWS from './models/views';

type Bindings = {
    IMG_BUCKET: R2Bucket
    IMG_KV: KVNamespace
    CF_VERSION_METADATA: WorkerVersionMetadata
    CF_CACHE_TTL: number
    S3_CDN_URL: string
    S3_CDN_DIR: string
}

const DEFAULT_VIEW_ID = Guid.empty();

const regex = /^(?<width>[0-9]*)-(?<height>[0-9]*)$/g

const app = new Hono<{ Bindings: Bindings }>()

app.get('/Img/:viewId/:imageFile{.+\\.*}', async (c) => {

    const _viewId = c.req.param('viewId').toLowerCase()

    const cache = caches.default

    const CF_CACHE_TTL = c.env.CF_CACHE_TTL

    const viewId = new Guid(_viewId)
    let _view:any = VIEWS.find( (view) => view.id == viewId.toString())?.options || null

    if( _view === null ) {
        console.log(`View is not found (${_viewId})`)

        _view = VIEWS.find( (view) => view.id == DEFAULT_VIEW_ID.toString())?.options || {}

        let match = regex.exec(_viewId)

        if (match?.groups == null) {
            return new Response(`View is not found  ${_viewId}`, { status: 404 })
        }

        if(match.groups.width != '0') {
            _view.width = match.groups.width
        }

        if(match.groups.height != '0') {
            _view.height = match.groups.height
        }

        _view.fit = 'cover'
    }

    const imimageFile = c.req.param('imageFile').toLowerCase() || '';
    const density = c.req.query('density') || 1;

    _view.dpr = density

    let _options = Object.entries(_view).map(([key, val]) => `${key}=${val}`).join(',')

    // Fix for the gravity nested object
    if(_options.indexOf('gravity=[object Object]') > -1) {
        const gravity = Object.entries(_view.gravity).map(([val]) => `${val}`).join('x')
        _options = _options.replace('gravity=[object Object]', `gravity=${gravity}`)
    }

    const cacheKeyItems:string[] = [Base64.encode(_options), imimageFile]

    const cacheKey = cacheKeyItems.join('-')

    const s3CacheKey = cacheKeyItems.join('/')

    // Check whether the value is already available in the cache
    // if not, fetch it from R2, and store it in the cache
    let response = await cache.match(c.req.url)
    if (response) {
        console.log(`Cache HIT for: ${cacheKey}.`)
        console.log(`Current options: ${_options}`)
        return response
    }

    console.log(`Cache MISS for: ${cacheKey}.`)

    console.log(`Current options: ${_options}`)

    const fileItems = imimageFile.split('.');


    const imageId = new Guid(fileItems[0])

    const ext = fileItems[1];

    const l = imageId.toString().substring(0,2)

    const h = imageId.toString().substring(imageId.toString().length - 2)

    const s3Url = c.env.S3_CDN_URL
    const s3Dir = c.env.S3_CDN_DIR

    const imgUrl = new URL(`https://${s3Url}${s3Dir}${l}/${h}/${imimageFile}`)

    const resized = await fetch(imgUrl, {
        cf: { image: _view }
    })

    response = new Response(resized.body, resized);
    response.headers.set('Version', c.env.CF_VERSION_METADATA.id );
    response.headers.set('Resize-Options', _options);
    response.headers.set('Cache-Control', `max-age=${CF_CACHE_TTL}`)

    await cache.put(c.req.url, response.clone())

    return response;
})

app.get("/swagger", swaggerUI({ url: "/doc/swagger.json" }));

export default app
