import type { Context } from "aws-lambda";

import { getProductJsonLd, parseOfferJsonIntoPriceData, type OfferJson } from "../lib/parse";
import { getRobotsForDomain, getLocationsFromSitemapContent } from "../lib/sitemap";
import { client } from "../../../../../db";
import { ALDI_SUED_ID } from "../lib/const";
import { printProgress, type ProductData, type PriceData } from "../lib/misc";

const URL_ROOT = "https://www.aldi-sued.de";

export const scrapeAldiSued = async (event: any, context: Context) => {
    console.log("running scrapeAldiSued:", context.functionName);

    const robotsContent = await getRobotsForDomain(URL_ROOT);
    if (!robotsContent) {
        console.error("no robots.txt found");
        return { statusCode: 404 };
    }

    const sitemapLocation = robotsContent.find(v => v.indexOf("sitemap_products.xml") !== -1)?.replace("sitemap:", "")?.trim();
    if (!sitemapLocation) {
        console.error("no sitemap found");
        return { statusCode: 404 };
    }

    const sitemapContent = await fetch(sitemapLocation, { headers: { "no-cache": "no-cache" } }).then(res => res.text());
    const productLocations = getLocationsFromSitemapContent(sitemapContent);

    console.time("product");
    for (let i = 0; i < productLocations.length; i++) {
        const url = productLocations[i];
        if (!url) {
            continue;
        }

        const parsedJson = await getProductJsonLd(url);
        if (!parsedJson) {
            continue;
        }
 
        const offers: Array<OfferJson> = Array.isArray(parsedJson.offers) ? parsedJson.offers : [parsedJson.offers];
    
        let sku = parsedJson.sku;
        if (!parsedJson.sku) {
            const splits = offers?.[0]?.url.split(".").filter(Boolean);
            sku = splits?.[splits.length - 2];
        }

        if (!sku) {
            continue;
        }
        
        const id = ALDI_SUED_ID + "_" + sku;

        const priceUpdates = parseOfferJsonIntoPriceData(offers, id);
        if (!priceUpdates.length) {
            continue;
        }

        const latestPrice = priceUpdates[0];
        const productData: ProductData = {
            id: id,
            name: parsedJson.name,
            images: (Array.isArray(parsedJson.image) ? parsedJson.image : [parsedJson.image]).filter(Boolean),
            url: parsedJson.url || url,
            market_id: ALDI_SUED_ID,
            price: latestPrice.price,
            currency: latestPrice.currency,
        };

        try {
            const { error, status, statusText } = await client.from("products").upsert(productData);
        } catch (e) {
            console.error("error while updating product", e);
        }

        try {
            const { error, status, statusText } = await client.from("prices").insert(priceUpdates);
        } catch (e) {
            console.error("error while updating prices", e);
        }

        printProgress(i, productLocations.length, ` -- ${productData.id}`);
    }
    console.timeEnd("product");

    return { statusCode: 200 };
}