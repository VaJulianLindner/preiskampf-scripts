import type { Context } from "aws-lambda";
import zlib from "node:zlib";

import { getSitemapContentForDomain } from "../lib/sitemap";
import { getProductJsonLd, type OfferJson } from "../lib/parse";
import { client } from "../../../../../db";
import { LIDL_ID } from "../lib/const";
import { printProgress, type PriceData } from "../lib/misc";

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

    console.time("parsing sitemap");
    const response = await fetch(productsSitemapLocation, { headers: { "no-cache": "no-cache" } });
    const gunzipBuffer = zlib.gunzipSync(await response.arrayBuffer());
    const content = gunzipBuffer.toString();
    const productLocations = content.split("\n").filter(v => v.trim().startsWith("<loc>")).map(v => v.match(/<loc>(.*?)<\/loc>/m)?.[1]).filter(Boolean);
    console.timeEnd("parsing sitemap");

    console.time("product");
    // TODO theoretically have to delete unimported products or at least disable them..
    // TODO how to enqueue updates?
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
        const productData = {
            id: id,
            name: parsedJson.name,
            images: parsedJson.image,
            url: parsedJson.url,
            market_id: LIDL_ID,
        }

        try {
            const { error, status, statusText } = await client.from("products").upsert(productData);

            for (let j = 0; j < offers.length; j++) {
                const offerData = offers[j];
                if (!offerData?.price) {
                    continue;
                }

                const priceData: PriceData = {
                    product_id: id,
                    currency: offerData.priceCurrency,
                    price: Math.round(parseFloat(offerData.price) * 100),
                };
                if (offerData.availability) {
                    priceData.availability = offerData.availability;
                }
                const { data, error } = await client.from("prices").select("id")
                    .eq("product_id", priceData.product_id)
                    .eq("price", priceData.price)
                    .limit(1);

                if (!data?.length && !error) {
                    await client.from("prices").insert(priceData);
                }
            }
        } catch (e) {
            console.error(e);
        }

        printProgress(i, productLocations.length);
    }

    console.timeEnd("product");

    return { statusCode: 200 };
}