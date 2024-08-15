export function printProgress(current: number, total: number) {
    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);
    process.stdout.write(`${current} of ${total} (${Math.ceil(current / total * 100)}%)`);
}