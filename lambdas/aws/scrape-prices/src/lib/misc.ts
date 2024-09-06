export type PriceData = {
    product_id: string,
    currency: string,
    price: number,
    availability?: string,
}

export type ProductData = {
    id?: string,
    name: string,
    images: Array<string>,
    url: string | undefined,
    market_id: number,
}

export function printProgress(current: number, total: number) {
    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);
    process.stdout.write(`${current} of ${total} (${Math.ceil(current / total * 100)}%)`);
}