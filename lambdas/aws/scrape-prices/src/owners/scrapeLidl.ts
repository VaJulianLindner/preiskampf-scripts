import type { Context } from "aws-lambda";

import { parse } from "node-html-parser";

import { client } from "../../../../../db";

declare type ParsedProduct = {
    id: string;
    canonicalUrl: string;
};

const URL_ROOT = "https://www.lidl.de";

export const scrapeLidl = async (event: any, context: Context) => {
    console.log("running scrapeLidl:", context.functionName);

    const response = await fetch(URL_ROOT + "/c/eigenmarken-food/s10007656").then(res => res.text());
    const document = parse(response);
    const rubricLinks = document.querySelectorAll("[data-ga-action='Main Navigation'] li[data-ga-label] a") || [];

    for (let i = 0; i < rubricLinks.length; i++) {
        const rubricPath = rubricLinks[i].attrs["href"];
        const url = rubricPath.startsWith("https://") ? rubricPath : `${URL_ROOT}${rubricPath}`;
        // rubricPage, e.g. "freeway" => might have to follow to subrubric: https://www.lidl.de/c/brot-backwaren-kuchen/s10005225
        const response = await fetch(url).then(res => res.text());
        const document = parse(response);
        const htmlProducts = document.querySelectorAll("[data-grid-data]");
        const parsedProducts = parseHtmlProducts(htmlProducts);

        for (let k = 0; k < parsedProducts.length; k++) {
            const urlPart = parsedProducts[k].canonicalUrl;
            if (!urlPart) {
                continue;
            }
            // detailPage
            const response = await fetch(URL_ROOT + urlPart).then(res => res.text());
            const document = parse(response);
            const jsonLd = document.querySelector('[data-hid="json_data_product"]');
            if (!jsonLd) {
                continue;
            }

            const parsedJson = JSON.parse(`${jsonLd.innerHTML}`);

            const { status, error } = await client.from("products").upsert({
                id: parsedJson.sku,
                name: parsedJson.name,
                images: parsedJson.image,
                url: parsedJson.url,
                market_id: 1, // this is lidl's id, might also do an actual lookup
                price: parsedJson.offers?.[0].price,
                price_currency: parsedJson.offers?.[0].priceCurrency,
            });
            console.log("status", status, "error", error);
        }
    }

    return { statusCode: 200 };
}

function parseHtmlProducts(products: any[]): ParsedProduct[] {
    try {
        return products.map((product, i) => {
            return {
                id: product?.parentNode?._attrs?.productid,
                canonicalUrl: product?.parentNode?._attrs?.canonicalurl,
            };
        }).filter(Boolean);
    } catch (e) {
        console.error("error in parseHtmlProduct", e);
        return [];
    }
}