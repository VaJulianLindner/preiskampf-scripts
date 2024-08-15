import type { Context } from "aws-lambda";

import { parse } from "node-html-parser";

import { getProductJsonLd, type ParsedProductJson } from "../lib/parse";
import { getRobotsForDomain } from "../lib/sitemap";
import { client } from "../../../../../db";

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

    console.log(sitemapLocation);

    return { statusCode: 200 };
}