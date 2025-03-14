import { Hono } from 'hono'
import { swaggerUI } from '@hono/swagger-ui'

type Bindings = {
    IMG_BUCKET: R2Bucket
    CF_CACHE_TTL: number
    S3_CDN_URL: string
    S3_CDN_DIR: string
    CF_VERSION_METADATA: WorkerVersionMetadata;
}

const app = new Hono<{ Bindings: Bindings }>()

app.get('/Img/:viewId/:imageFile{.+\\.*}', async (c) => {

    const viewId = c.req.param('viewId') || '';
    const imimageFile = c.req.param('imageFile') || '';
    const density = c.req.query('density') || 1;

    let fileItems = imimageFile.split('.');

    const imageId = fileItems[0];
    const ext = fileItems[1];

    let l = imageId.substring(0,2)

    let h = imageId.substring(imageId.length - 2)

    let image:any = {}
    image.width = 1000;
    image.height = 50;

    const optionsKeys = Object.entries(image).map(([key, val]) => `${key}=${val}`).join(',')

    let s3Url = c.env.S3_CDN_URL
    let s3Dir = c.env.S3_CDN_DIR

    let imgUrl = new URL(`https://${s3Url}${s3Dir}${l}/${h}/${imageId}.${ext}`)

    let resized = await fetch(imgUrl, {
        cf: { image: image }
    })

    let response = new Response(resized.body, resized);
        response.headers.set('version', c.env.CF_VERSION_METADATA.id );
        response.headers.set('density', density.toString());
        response.headers.set('resizeOptions', optionsKeys);

    return response;
})

app.get("/swagger", swaggerUI({ url: "/doc/swagger.json" }));

export default app
