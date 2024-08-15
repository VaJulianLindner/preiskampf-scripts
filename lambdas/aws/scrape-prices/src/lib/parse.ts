import { parse } from "node-html-parser";

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