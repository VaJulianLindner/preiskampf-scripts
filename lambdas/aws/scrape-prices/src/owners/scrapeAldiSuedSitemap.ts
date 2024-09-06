import type { Context } from "aws-lambda";

import { getProductJsonLd, type ParsedProductJson, type OfferJson } from "../lib/parse";
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
        const productData: ProductData = {
            name: parsedJson.name,
            images: (Array.isArray(parsedJson.image) ? parsedJson.image : [parsedJson.image]).filter(Boolean),
            url: parsedJson.url || url,
            market_id: ALDI_SUED_ID,
        };

        let sku = parsedJson.sku;
        if (!parsedJson.sku) {
            const splits = offers?.[0]?.url.split(".").filter(Boolean);
            sku = splits?.[splits.length - 2];
        }

        if (!sku) {
            continue;
        }
        
        productData.id = ALDI_SUED_ID + "_" + sku;

        try {
            const { error, status, statusText } = await client.from("products").upsert(productData);

            for (let j = 0; j < offers.length; j++) {
                const offerData = offers?.[j];
                if (!offerData?.price) {
                    continue;
                }

                const priceData: PriceData = {
                    product_id: productData.id,
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

                // TODO check if multiple prices would cause problems after app fixes
                await client.from("prices").insert(priceData);
            }
        } catch (e) {
            console.error(e);
        }

        printProgress(i, productLocations.length);
    }
    console.timeEnd("product");

    return { statusCode: 200 };
}