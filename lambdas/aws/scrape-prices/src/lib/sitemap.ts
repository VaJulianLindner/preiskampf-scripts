const SITEMAP_LOCATION_RG = /<loc>(.*?)<\/loc>/m;

export async function getRobotsForDomain(baseUrl: string): Promise<string[]> {
    const response = await fetch(baseUrl + "/robots.txt").then(res => res.text());
    return response.replace(/\r/g, "").split("\n").filter(Boolean).map(v => v.toLowerCase());
}

export async function getSitemapForDomain(baseUrl: string): Promise<string | undefined> {
    const lines = await getRobotsForDomain(baseUrl);
    const sitemapLine = lines.find(v => v.startsWith("sitemap:"))
    return sitemapLine?.replace("sitemap:", "").trim();
}

export async function getSitemapContentForDomain(baseUrl: string): Promise<string | undefined> {
    const sitemapLocation = await getSitemapForDomain(baseUrl);
    if (!sitemapLocation) {
        return undefined;
    }
    return fetch(sitemapLocation, { headers: { "no-cache": "no-cache" } }).then(res => res.text());
}

export function getLocationsFromSitemapContent(content: string): Array<string> {
    const hasNewLines = content.indexOf("\n") > -1;

    return content
        .replaceAll("<url>", "")
        .split(hasNewLines ? "\n" : "</url>")
        .filter(v => v.trim().startsWith("<loc>"))
        .map(v => v.match(SITEMAP_LOCATION_RG)?.[1] || "")
        .filter(Boolean);
}