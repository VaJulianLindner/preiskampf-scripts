import type { Context } from "aws-lambda";

import { parse } from "node-html-parser";

import { getProductJsonLd, type ParsedProductJson } from "../lib/parse";
import { client } from "../../../../../db";

const URL_ROOT = "https://www.aldi-sued.de";

export const scrapeAldiSued = async (event: any, context: Context) => {
    console.log("running scrapeAldiSued:", context.functionName);

    const response = await fetch(URL_ROOT + "/de/produkte.html").then(res => res.text());
    const document = parse(response);
    const rubricLinks = document.querySelectorAll(".produkte-teaser a") || [];

    for (let i = 0; i < rubricLinks.length; i++) {
        const rubricPath = rubricLinks[i].attrs["href"];
        const url = URL_ROOT + rubricPath.replace(".html", ".onlyProduct.html");

        let currentPage = 0;
        let maxPage = Infinity;
        while (currentPage <= maxPage) {
            const response = await fetch(url + "?pageNumber=" + currentPage).then(res => res.text());
            const document = parse(response);

            // @ts-ignore
            maxPage = parseInt(document.querySelector("[data-pagenumber]")?.dataset?.pagenumber || 0);
            currentPage++;

            const productElements = document.querySelectorAll("article.wrapper > a");
            for (let k = 0; k < productElements.length; k++) {
                const urlPart = productElements[k].getAttribute("href");
                if (!urlPart) {
                    continue;
                }

                // detailPage
                const parsedJson = await getProductJsonLd(URL_ROOT + urlPart)
                if (!parsedJson) {
                    continue;
                }

                const offer = Array.isArray(parsedJson.offers) ? parsedJson.offers?.[0] : parsedJson.offers;
                const splits = offer.url.split(".").filter(Boolean);
                const sku = splits?.[splits.length - 2];

                const images = [parsedJson.image, document.querySelector(".active.zoom-ico-image img")?.getAttribute("src")];

                const { status, error } = await client.from("products").upsert({
                    id: sku,
                    name: parsedJson.name,
                    images: images.filter(Boolean),
                    url: offer.url,
                    market_id: 2, // this is aldi sued's id, might also do an actual lookup
                    price: offer?.price,
                    price_currency: offer?.priceCurrency,
                });
                console.log("status", status, "error", error);
            }
        }
    }

    return { statusCode: 200 };
}