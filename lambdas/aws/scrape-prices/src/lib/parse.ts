import { parse } from "node-html-parser";
import { type PriceData } from "./misc";

export type OfferJson = {
    "@type": "Offer",
    url: string,
    priceCurrency: string,
    price: string,
    availability?: string,
};

export type RatingJson = {
    "@type": "AggregateRating",
    ratingCount?: number,
    reviewCount?: number,
    ratingValue?: number,
}

export type BrandJson = {
    "@type": "Brand",
    name: string,
};

export type ParsedProductJson = {
    "@context": string;
    "@type": string;
    name: string,
    image: string,
    sku?: string,
    url?: string,
    brand?: string | BrandJson,
    weight?: string,
    description: string,
    offers: OfferJson | OfferJson[],
};

export async function getProductJsonLd(url: string): Promise<ParsedProductJson | undefined> {
    if (!url) {
        return;
    }

    try {
        const response = await fetch(url).then(res => res.text());
        const document = parse(response);
        const jsonLds = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
        return jsonLds.map(jsonLd => {
            try {
                return JSON.parse(`${jsonLd.innerHTML.replace(/[\n\t]/img, "")}`);
            } catch (e) {/*ignore*/ }
        }).find(parsedJson => parsedJson?.["@type"] === "Product");
    } catch (e) {
        console.error("error in getProductJsonLd", e);
    }
}

export function parseOfferJsonIntoPriceData(offers: Array<OfferJson>, productId: string): Array<PriceData> {
    const priceUpdates: Array<PriceData> = [];
    for (let j = 0; j < offers.length; j++) {
        const offerData = offers[j];
        if (!offerData?.price) {
            continue;
        }

        const priceData: PriceData = {
            product_id: productId,
            currency: offerData.priceCurrency,
            price: Math.round(parseFloat(offerData.price) * 100),
        };
        if (offerData.availability) {
            priceData.availability = offerData.availability;
        }

        priceUpdates.push(priceData);
    }

    return priceUpdates;
}