import type { Context } from "aws-lambda";

import { parse } from "node-html-parser";

import { getSitemapContentForDomain } from "../lib/sitemap";
import { client } from "../../../../../db";

type ParsedImageJson = {
    "@type": string,
    "@context": string,
    author: string,
    contentLocation: string,
    contentUrl: string,
    datePublished: string,
    description: string,
    name: string,
};

const URL_ROOT = "https://www.aldi-nord.de";

export const scrapeAldiNord = async (event: any, context: Context) => {
    console.log("running scrapeAldiNord:", context.functionName);

    const sitemapContent = await getSitemapContentForDomain(URL_ROOT);
    console.log(sitemapContent);

    return { statusCode: 200 };
}