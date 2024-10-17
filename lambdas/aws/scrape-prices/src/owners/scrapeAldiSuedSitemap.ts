import type { Context } from "aws-lambda";
import asyncPool from "tiny-async-pool";

import { getProductJsonLd, parseOfferJsonIntoPriceData, type OfferJson, type ParsedProductJson } from "../lib/parse";
import { getRobotsForDomain, getLocationsFromSitemapContent } from "../lib/sitemap";
import { client } from "../../../../../db";
import { ALDI_SUED_ID } from "../lib/const";
import { printProgress, type ProductData, type PriceData } from "../lib/misc";

const URL_ROOT = "https://www.aldi-sued.de";

type ParsedProductData = {
    parsedJson: ParsedProductJson | undefined,
    url: string | undefined,
};

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

    // TODO theoretically have to delete unimported products or at least disable them..

    console.time("fetch-and-parse-jsonld");
    const productLocationsWithJsonLd: Array<ParsedProductData> = [];
    let count = 0;
    // TODO could be higher order function to dedupe code
    for await (const productData of asyncPool(15, productLocations, getProductJsonLdWithUrl)) {
        count++;
        printProgress(count, productLocations.length);
        if (productData) {
            productLocationsWithJsonLd.push(productData);
        }
    }
    console.log("\n");
    console.timeEnd("fetch-and-parse-jsonld");

    const dbResults = [];
    console.time("execute-db-updates");
    // TODO could be higher order function to dedupe code
    for await (const results of asyncPool(15, productLocationsWithJsonLd, executeDbUpdate)) {
        dbResults.push(...results);
    }
    console.log("\n");
    console.timeEnd("execute-db-updates");

    const resultState = {
        success: 0,
        error: 0,
    };

    dbResults.forEach(res => {
        if (String(res.status).startsWith("2")) {
            resultState.success++;
        } else {
            console.error("error in db result:", res);
            resultState.error++;
        }
    });

    console.log("resultState::", JSON.stringify(resultState, null, 2), "from", productLocationsWithJsonLd.length, "parsed products and", dbResults.length, "enqueued updates");

    return { statusCode: 200 };
}

async function getProductJsonLdWithUrl(url: string): Promise<ParsedProductData | undefined>  {
    const parsedJson = await getProductJsonLd(url);
    return {parsedJson, url};
}

// TODO fix any
async function executeDbUpdate(productLocationWithJsonLd: ParsedProductData): Promise<Array<any>> {
    const {parsedJson, url} = productLocationWithJsonLd;
    if (!parsedJson || !url) {
        return [];
    }

    const offers: Array<OfferJson> = Array.isArray(parsedJson.offers) ? parsedJson.offers : [parsedJson.offers];

    let sku = parsedJson.sku;
    if (!parsedJson.sku) {
        const splits = offers?.[0]?.url.split(".").filter(Boolean);
        sku = splits?.[splits.length - 2];
    }

    if (!sku) {
        return [];
    }
    
    const id = ALDI_SUED_ID + "_" + sku;

    // TODO price updates probably need to be only added if prices dont change, to not spam the db table
    const priceUpdates = parseOfferJsonIntoPriceData(offers, id);
    if (!priceUpdates.length) {
        return [];
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

    const productResult = await client.from("products").upsert(productData);
    // prices table has foreign_key constraint on products table
    const priceResults = await client.from("prices").insert(priceUpdates);

    return [productResult, priceResults];
}