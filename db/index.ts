import path from "node:path";
import fs from "node:fs";
import * as dotenv from "dotenv";
import {createClient} from "@supabase/supabase-js";

// get the .env file from the repository's root, no matter where es-build put this file
const outsideSteps = ["../"];
const maxCount = 20;
while (outsideSteps.indexOf(".env") === -1 && outsideSteps.length < maxCount) {
    const dir = fs.readdirSync(outsideSteps.join(""));
    outsideSteps.push("../");
    if (dir.indexOf(".env") !== -1) {
        outsideSteps.push(".env");
    }
}

const dotEnvPath = path.resolve(__dirname + "/" + `${outsideSteps.join("")}`);
dotenv.config({path: dotEnvPath});

const supabaseUrl = String(process.env.SUPABASE_URL);
const supabaseKey = String(process.env.SUPABASE_SERVICE_ROLE);
const supabase = createClient(supabaseUrl, supabaseKey);

export const client = supabase;