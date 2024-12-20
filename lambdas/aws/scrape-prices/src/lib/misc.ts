import readline from "node:readline";

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
    currency: string,
    price: number,
}

export function printProgress(current: number, total: number, additionalMsg?: string) {
    // @ts-ignore
    readline.cursorTo(process.stdout, 0);
    let line = `${current} of ${total} (${Math.ceil(current / total * 100)}%)`;
    if (additionalMsg) {
        line += additionalMsg;
    }
    process.stdout.write(line);
}