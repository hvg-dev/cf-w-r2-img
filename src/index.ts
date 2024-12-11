/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.toml`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export default {
    async fetch(request, env, ctx): Promise<Response> {
        //let url = new URL(request.url)
        let url = new URL('https://r2.test-hvg.hu/cdn-cgi/image/width=250/f0/f0/f0c89ccc-11f6-44ac-8111-49efe070d7f0.jpg')
        let modified = new Request(url.toString(), request)
        let response = await fetch(modified, {
            cf: { cacheTtl: env.CF_CACHE_TTL }
        })
        return response
    },
} satisfies ExportedHandler<Env>;
