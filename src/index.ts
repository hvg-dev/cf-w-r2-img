
export default {
    async fetch(request, env): Promise<Response> {
        let url = new URL(request.url)
        const regex = /^\/Img\/(?<view>.*)\/(?<img>.*).(?<ext>jpg|png)$/g;
        //console.log(url.pathname)
        let match = regex.exec(url.pathname)

        if (match?.groups == null) {
            return new Response('', {
                status: 400
            })
        }

        let view = match.groups.view
        //console.log(view)

        let img = match.groups.img
        //console.log(img)

        let ext = match.groups.ext
        //console.log(ext)

        let l = img.substring(0,2)
        //console.log(l)

        let h = img.substring(img.length - 2)
        //console.log(h)

        const views: { [key: string]: string } = {
            "00000000-0000-0000-0000-000000000000": "quality=100",
            "2e6bbfa1-3baa-4a23-9b95-1671cd328d09": "width=579,height=360,gravity=0.5x0.5,fit=cover,quality=90",
            "d687bb3a-509a-49ca-b43e-cbc038e76e5b": "width=580,quality=100",
            "ffdb5e3a-e632-4abc-b367-3d9b3bb5573b": "width=90,height=60,gravity=0.5x0.5,fit=cover,quality=100"
        };

        if (!views.hasOwnProperty(view)) {
            return new Response('', {
                status: 404
            })
        }

        const s3 = env.S3_CDN_URL

        url = new URL(`https://${s3}/cdn-cgi/image/${views[view]}/${l}/${h}/${img}.${ext}`)
        let modified = new Request(url.toString(), request)
        let response = await fetch(modified, {
            cf: { cacheTtl: env.CF_CACHE_TTL }
        })
        return response

    },
} satisfies ExportedHandler<Env>;
