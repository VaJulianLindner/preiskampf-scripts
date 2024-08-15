import type { Context } from "aws-lambda";

import fetch from "node-fetch";
import { parse } from "node-html-parser";

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

    const response = await fetch(URL_ROOT + "/sortiment.html").then(res => res.text());
    const document = parse(response);
    const rubricLinks = document.querySelectorAll("a.mod-content-tile__action") || [];

    for (let i = 0; i < rubricLinks.length; i++) {
        const rubricPath = rubricLinks[i].attrs["href"];

        // only parse relative urls, that redirect somewhere on the aldi page
        if (!rubricPath.startsWith("/")) {
            continue;
        }

        const url = URL_ROOT + rubricPath;
        const response = await fetch(url).then(res => res.text());
        const document = parse(response);

        const productLinks = document.querySelectorAll("a[data-attr-prodid]") || [];
        for (let j = 0; j < productLinks.length; j++) {
            const product = productLinks[j];
            const url = product.getAttribute("href");
            // @ts-ignore
            const sku = product._rawAttrs?.["data-attr-prodid"] || product.dataset?.attrProdid;

            if (!sku || !url) {
                continue;
            }

            const hashtagIndex = url.indexOf("#");
            const detailUrl = (hashtagIndex !== -1) ? url.substring(0, hashtagIndex) : url;
            const detailPart = detailUrl.split("/").filter(Boolean).pop();
            const parsedDetailUrl = URL_ROOT + "/produkt/" + detailPart;

            const result = await fetch(parsedDetailUrl);
            const statusCode = String(result.status);

            if (statusCode.startsWith("4")) {
                continue;
            }

            const response = await result.text();
            const document = parse(response);

            const jsonLds = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
            const parsedImageJson: ParsedImageJson = jsonLds.map(jsonLd => {
                try {
                    return JSON.parse(`${jsonLd.innerHTML.replace(/[\n\t]/img, "")}`);
                } catch (e) {/*ignore*/ }
            }).find(parsedJson => parsedJson?.["@type"] === "ImageObject");

            const images = [];
            if (parsedImageJson?.contentUrl) {
                images.push(parsedImageJson.contentUrl);
            }

            const displayPrice = Array.from(document.querySelector(".price__wrapper")?.childNodes || []).map((el) => {
                return String(el.innerText || "").trim().replace(/[\n\t]/img, "");
            }).filter(Boolean).join("");
            const price = parseFloat(displayPrice);

            const name = String(document.querySelector("title")?.innerHTML || "").trim()
                .replace(" - günstig bei ALDI Nord", "")
                .replace(" günstig bei ALDI Nord", "")
                .replace(" bei ALDI Nord", "")
                .replace(" bei ALDI", "")
                .replace(" von ALDI Nord", "")
                .replace(" von ALDI", "");
            if (!name) {
                continue;
            }

            const { status, error } = await client.from("products").upsert({
                id: sku,
                // @ts-ignore
                name: name,
                images: images,
                url: parsedDetailUrl,
                market_id: 3, // this is aldi nord's id, might also do an actual lookup
                price: price,
                price_currency: "EUR", // aldi nord doesnt provide currency, so hardcode EUR for the time being
            });
            console.log("status", status, "error", error);
        }
    }

    return { statusCode: 200 };
}