import type { Context } from "aws-lambda";
import zlib from "node:zlib";
import asyncPool from "tiny-async-pool";

import { getSitemapContentForDomain, getLocationsFromSitemapContent } from "../lib/sitemap";
import { getProductJsonLd, parseOfferJsonIntoPriceData, type ParsedProductJson, type OfferJson } from "../lib/parse";
import { client } from "../../../../../db";
import { LIDL_ID } from "../lib/const";
import { printProgress, type ProductData } from "../lib/misc";

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

    console.time("fetch-and-parse-jsonld");
    const jsonLds = [];
    let count = 0;
    for await (const jsonLd of asyncPool(10, productLocations, getProductJsonLd)) {
        count++;
        printProgress(count, productLocations.length);
        jsonLds.push(jsonLd);
    }
    console.log("\n");
    console.timeEnd("fetch-and-parse-jsonld");

    const dbUpdates = [];
    console.time("generate-db-updates");
    for (let i = 0; i < jsonLds.length; i++) {
        const parsedJson = jsonLds[i];
        if (!parsedJson?.sku) {
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

        dbUpdates.push(client.from("products").upsert(productData));
        dbUpdates.push(client.from("prices").insert(priceUpdates));
    }
    console.timeEnd("generate-db-updates");

    console.time("execute-db-updates");
    const dbResults = await Promise.all(dbUpdates);
    console.timeEnd("execute-db-updates");

    const resultState = {
        success: 0,
        error: 0,
    };

    dbResults.forEach(res => {
        if (String(res.status).startsWith("2")) {
            resultState.success++;
        } else {
            resultState.error++;
        }
    });

    console.log("resultState::", JSON.stringify(resultState, null, 2), "from", jsonLds.length, "parsed products and", dbResults.length, "enqueued updates");

    return { statusCode: 200 };
}