import type { Context } from "aws-lambda";
import zlib from "node:zlib";

import { getSitemapContentForDomain, getLocationsFromSitemapContent } from "../lib/sitemap";
import { getProductJsonLd, parseOfferJsonIntoPriceData, type OfferJson } from "../lib/parse";
import { client } from "../../../../../db";
import { LIDL_ID } from "../lib/const";
import { printProgress, type PriceData, type ProductData } from "../lib/misc";

const URL_ROOT = "https://www.lidl.de";

export const scrapeLidl = async (event: any, context: Context) => {
    console.log("running scrapeLidl:", context.functionName);

    const sitemapContent = await getSitemapContentForDomain(URL_ROOT);
    if (!sitemapContent) {
        console.error("no sitemap content found");
        return { statusCode: 404 };
    }

    const locations = sitemapContent.replace(/\t/g, "").split("\n").map(v => v.match(/<loc>(.*?)<\/loc>/m)?.[1]).filter(Boolean);
    const productsSitemapLocation = locations.find(v => v?.indexOf("product_sitemap") !== -1);

    if (!productsSitemapLocation) {
        console.error("no products sitemap found");
        return { statusCode: 404 };
    }

    const response = await fetch(productsSitemapLocation, { headers: { "no-cache": "no-cache" } });
    const gunzipBuffer = zlib.gunzipSync(await response.arrayBuffer());
    const content = gunzipBuffer.toString();
    const productLocations = getLocationsFromSitemapContent(content);

    // TODO theoretically have to delete unimported products or at least disable them..
    // TODO how to enqueue updates?
    console.time("product");
    for (let i = 0; i < productLocations.length; i++) {
        const url = productLocations[i];
        if (!url) {
            continue;
        }

        const parsedJson = await getProductJsonLd(url);
        if (!parsedJson || !parsedJson.sku) {
            continue;
        }

        const id = LIDL_ID + "_" + parsedJson.sku;
        const offers: Array<OfferJson> = Array.isArray(parsedJson.offers) ? parsedJson.offers : [parsedJson.offers];

        const priceUpdates = parseOfferJsonIntoPriceData(offers, id);
        if (!priceUpdates.length) {
            continue;
        }

        const latestPrice = priceUpdates[0];
        const productData: ProductData = {
            id: id,
            name: parsedJson.name,
            images: (Array.isArray(parsedJson.image) ? parsedJson.image : [parsedJson.image]).filter(Boolean),
            url: parsedJson.url,
            market_id: LIDL_ID,
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